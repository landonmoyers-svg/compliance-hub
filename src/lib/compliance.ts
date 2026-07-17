import { daysUntil, isExpired, isExpiringSoon } from "./dates";
import type {
  ComplianceDocument,
  ComplianceTask,
  CredentialRecord,
  Employee,
  RiskManagementCase,
  TrainingAssignment,
} from "./data/schema";

/**
 * Shared compliance business logic. Defined once and reused by every page so a
 * credential's status / the compliance score / "overdue" all mean the same
 * thing everywhere. Fixes from the source app:
 *   - credential status is DERIVED from expirationDate, not a stale stored enum
 *   - already-expired credentials are penalized (the original only counted
 *     "expiring within 30 days" and used backwards date math)
 *   - the score formula is transparent and documented, not arbitrary
 */

export type DerivedCredentialStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "no_expiry";

export function credentialStatus(
  c: Pick<CredentialRecord, "expirationDate">,
  within = 30,
): DerivedCredentialStatus {
  if (!c.expirationDate) return "no_expiry";
  if (isExpired(c.expirationDate)) return "expired";
  if (isExpiringSoon(c.expirationDate, within)) return "expiring_soon";
  return "active";
}

/* ------------------------- holder context (active vs former) -------------------------
 * Compliance warnings must respect CONTEXT: an expired license held by someone
 * who left the practice is history, not an alarm. These helpers resolve the
 * person behind a record (by stable userId when linked, else normalized name)
 * to their employment status so every warning surface can exclude or downgrade
 * former-staff items consistently.
 */

export type HolderStatus = "active" | "former" | "unknown";

export interface HolderIndex {
  byUserId: Map<string, HolderStatus>;
  byName: Map<string, HolderStatus>;
}

const normName = (s?: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** "Active" = still working here (active or on leave). Everything else is former. */
function employeeHolderStatus(e: Pick<Employee, "employmentStatus">): HolderStatus {
  return e.employmentStatus === "active" || e.employmentStatus === "on_leave" ? "active" : "former";
}

export function buildHolderIndex(employees: Pick<Employee, "userId" | "firstName" | "lastName" | "employmentStatus">[]): HolderIndex {
  const byUserId = new Map<string, HolderStatus>();
  const byName = new Map<string, HolderStatus>();
  for (const e of employees) {
    const st = employeeHolderStatus(e);
    if (e.userId) byUserId.set(e.userId, st);
    const n = normName(`${e.firstName} ${e.lastName}`);
    // If two people share a normalized name, prefer marking the name active so
    // we never silence a warning that might belong to a current employee.
    if (n) byName.set(n, byName.get(n) === "active" ? "active" : st);
  }
  return { byUserId, byName };
}

/** Resolve the employment status of the person behind a record. */
export function holderStatus(
  rec: { employeeUserId?: string | null; employeeName?: string | null },
  index: HolderIndex,
): HolderStatus {
  if (rec.employeeUserId) {
    const byId = index.byUserId.get(rec.employeeUserId);
    if (byId) return byId;
  }
  const byName = index.byName.get(normName(rec.employeeName));
  return byName ?? "unknown";
}

/** True when the record's holder still works here (unknown holders count as
 *  active — never silence a warning we can't attribute). */
export function holderIsActive(
  rec: { employeeUserId?: string | null; employeeName?: string | null },
  index: HolderIndex,
): boolean {
  return holderStatus(rec, index) !== "former";
}

export function taskIsOpen(t: ComplianceTask): boolean {
  return t.status !== "completed" && t.status !== "cancelled";
}

export function taskIsOverdue(t: ComplianceTask): boolean {
  return taskIsOpen(t) && isExpired(t.dueDate);
}

export function taskDueWithin(t: ComplianceTask, within: number): boolean {
  return taskIsOpen(t) && isExpiringSoon(t.dueDate, within);
}

export function assignmentIsOverdue(a: TrainingAssignment): boolean {
  return a.status !== "completed" && isExpired(a.dueDate);
}

export function documentNeedsReview(d: ComplianceDocument): boolean {
  return d.status === "active" && isExpired(d.reviewDate);
}

export interface ScoreFactor {
  key: string;
  label: string;
  count: number;
  impact: number; // negative number of points deducted
}

export interface ComplianceScore {
  score: number; // 0–100
  factors: ScoreFactor[];
  criticalCount: number;
  highCount: number;
}

interface ScoreInput {
  tasks: ComplianceTask[];
  credentials: CredentialRecord[];
  trainingAssignments: TrainingAssignment[];
  documents: ComplianceDocument[];
  riskCases: RiskManagementCase[];
  /** When provided, credential/training penalties only count people who still
   *  work here — an expired license of a former employee is history, not risk. */
  employees?: Pick<Employee, "userId" | "firstName" | "lastName" | "employmentStatus">[];
  /** CC-4: additional recurring-obligation penalties (e.g. exclusion screening
   *  overdue) computed by the caller and folded transparently into the score.
   *  Each factor's `impact` should already be a capped negative number. */
  extraFactors?: ScoreFactor[];
}

function deduct(count: number, per: number, cap: number): number {
  return -Math.min(count * per, cap);
}

/**
 * Transparent score: start at 100 and subtract capped penalties per category.
 * Every deduction is surfaced in `factors` so the UI can explain the number.
 */
export function computeComplianceScore(input: ScoreInput): ComplianceScore {
  // Context: only current staff's credentials/training count against the score.
  const index = input.employees ? buildHolderIndex(input.employees) : null;
  const creds = index
    ? input.credentials.filter((c) => holderIsActive(c, index))
    : input.credentials;
  const training = index
    ? input.trainingAssignments.filter((a) =>
        holderIsActive({ employeeUserId: a.assignedToUserId, employeeName: a.assignedToName }, index))
    : input.trainingAssignments;

  const overdueTasks = input.tasks.filter(taskIsOverdue).length;
  const expiredCreds = creds.filter(
    (c) => credentialStatus(c) === "expired",
  ).length;
  const expiringCreds = creds.filter(
    (c) => credentialStatus(c) === "expiring_soon",
  ).length;
  const overdueTraining = training.filter(assignmentIsOverdue).length;
  const docsNeedingReview = input.documents.filter(documentNeedsReview).length;

  const openRisk = input.riskCases.filter(
    (r) => r.status === "open" || r.status === "investigating",
  );
  const criticalRisk = openRisk.filter((r) => r.severity === "critical").length;
  const highRisk = openRisk.filter((r) => r.severity === "high").length;

  const factors: ScoreFactor[] = [
    { key: "overdueTasks", label: "Overdue tasks", count: overdueTasks, impact: deduct(overdueTasks, 3, 25) },
    { key: "expiredCreds", label: "Expired credentials", count: expiredCreds, impact: deduct(expiredCreds, 5, 20) },
    { key: "expiringCreds", label: "Credentials expiring ≤30d", count: expiringCreds, impact: deduct(expiringCreds, 2, 10) },
    { key: "overdueTraining", label: "Overdue training", count: overdueTraining, impact: deduct(overdueTraining, 2, 15) },
    { key: "docsReview", label: "Documents past review", count: docsNeedingReview, impact: deduct(docsNeedingReview, 2, 10) },
    { key: "criticalRisk", label: "Open critical risk cases", count: criticalRisk, impact: deduct(criticalRisk, 6, 18) },
    { key: "highRisk", label: "Open high risk cases", count: highRisk, impact: deduct(highRisk, 3, 12) },
    // CC-4: caller-supplied recurring-obligation penalties (exclusion screening, etc.).
    ...(input.extraFactors ?? []),
  ].filter((f) => f.count > 0);

  const total = factors.reduce((sum, f) => sum + f.impact, 0);
  const score = Math.max(0, Math.min(100, 100 + total));

  return {
    score,
    factors,
    criticalCount: overdueTasks + expiredCreds + criticalRisk,
    highCount: expiringCreds + overdueTraining + highRisk,
  };
}

export function scoreBand(score: number): {
  label: string;
  tone: "success" | "warning" | "destructive";
} {
  if (score >= 85) return { label: "Healthy", tone: "success" };
  if (score >= 65) return { label: "Needs attention", tone: "warning" };
  return { label: "At risk", tone: "destructive" };
}

/** Sort helper: soonest due/expiring first, nulls last. */
export function bySoonest<T>(getDate: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const da = daysUntil(getDate(a));
    const db = daysUntil(getDate(b));
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  };
}

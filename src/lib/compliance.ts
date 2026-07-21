import { daysUntil, isExpired, isExpiringSoon, parseDate } from "./dates";
import { supersededCredentialIds } from "./credentials";
import type {
  ComplianceDocument,
  ComplianceTask,
  CredentialRecord,
  Employee,
  ExclusionScreening,
  InsurancePolicyRecord,
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

/** Insurance policy status derived from its renewal date — same semantics as
 *  credentialStatus, so "expired"/"renewing soon" mean the same thing everywhere. */
export function insuranceStatus(
  p: Pick<InsurancePolicyRecord, "renewalDate">,
  within = 30,
): DerivedCredentialStatus {
  if (!p.renewalDate) return "no_expiry";
  if (isExpired(p.renewalDate)) return "expired";
  if (isExpiringSoon(p.renewalDate, within)) return "expiring_soon";
  return "active";
}

type SupersedablePolicy = Pick<InsurancePolicyRecord, "id" | "holderUserId" | "holderName" | "policyType" | "renewalDate" | "createdDate">;

/** IDs of insurance policies SUPERSEDED by a newer term in the same
 *  (holder, policy type) line — a prior renewal is history, not an action item,
 *  so it must not count as "expired" in the score or on the dashboard. Mirrors
 *  supersededCredentialIds. A policy of one type never supersedes another type. */
export function supersededInsuranceIds(policies: SupersedablePolicy[]): Set<string> {
  const recency = (p: SupersedablePolicy) => (parseDate(p.renewalDate) ?? parseDate(p.createdDate))?.getTime() ?? 0;
  const groups = new Map<string, SupersedablePolicy[]>();
  for (const p of policies) {
    const holder = p.holderUserId || p.holderName?.trim() || "Entity";
    const key = `${holder}::${(p.policyType ?? "").toLowerCase()}`;
    const arr = groups.get(key);
    if (arr) arr.push(p); else groups.set(key, [p]);
  }
  const superseded = new Set<string>();
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => recency(b) - recency(a));
    for (let i = 1; i < sorted.length; i++) superseded.add(sorted[i].id);
  }
  return superseded;
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
  /** Insurance policies (e.g. malpractice). Expired/renewing-soon policies for
   *  current holders (or entity-wide policies) fold into the score, like creds. */
  insurancePolicies?: InsurancePolicyRecord[];
  /** Count of required credentials that are entirely MISSING (never on file) for
   *  current clinical staff — computed by the caller via countRequirementGaps()
   *  to avoid a module cycle. Expired-but-present items are already penalized as
   *  expired credentials, so only true gaps are passed here. */
  requirementGaps?: number;
  /** When provided, credential/training penalties only count people who still
   *  work here — an expired license of a former employee is history, not risk. */
  employees?: Pick<Employee, "userId" | "firstName" | "lastName" | "employmentStatus">[];
  /** CC-4: exclusion screening is a recurring monthly obligation — active staff
   *  with no screening in the last 30 days are folded into the score. Computed
   *  in ONE place here so the number is identical on every page. */
  exclusionScreenings?: Pick<ExclusionScreening, "subjectName" | "screenedDate" | "createdDate">[];
  /** Additional caller-supplied recurring-obligation penalties (already capped). */
  extraFactors?: ScoreFactor[];
}

function deduct(count: number, per: number, cap: number): number {
  return -Math.min(count * per, cap);
}

/** CC-4: active staff with no exclusion screening logged in the last 30 days. */
export function exclusionScreeningOverdue(
  employees: Pick<Employee, "firstName" | "lastName" | "employmentStatus">[],
  screenings: Pick<ExclusionScreening, "subjectName" | "screenedDate" | "createdDate">[],
): number {
  const now = Date.now();
  const latestByName = new Map<string, number>();
  for (const s of screenings) {
    const key = (s.subjectName ?? "").toLowerCase();
    const t = s.screenedDate ? new Date(s.screenedDate).getTime() : new Date(s.createdDate).getTime();
    if (!latestByName.has(key) || t > latestByName.get(key)!) latestByName.set(key, t);
  }
  return employees.filter((e) => e.employmentStatus === "active").filter((e) => {
    const last = latestByName.get(`${e.firstName} ${e.lastName}`.trim().toLowerCase());
    return !last || (now - last) > 30 * 864e5;
  }).length;
}

/**
 * Transparent score: start at 100 and subtract capped penalties per category.
 * Every deduction is surfaced in `factors` so the UI can explain the number.
 */
export function computeComplianceScore(input: ScoreInput): ComplianceScore {
  // Context: only current staff's credentials/training count against the score.
  const index = input.employees ? buildHolderIndex(input.employees) : null;
  const activeCreds = index
    ? input.credentials.filter((c) => holderIsActive(c, index))
    : input.credentials;
  // Superseded copies (an old license a current one replaced) are history, not
  // risk — exclude them so they don't drag the score or show as action items.
  const supersededIds = supersededCredentialIds(input.credentials);
  const creds = activeCreds.filter((c) => !supersededIds.has(c.id));
  const training = index
    ? input.trainingAssignments.filter((a) =>
        holderIsActive({ employeeUserId: a.assignedToUserId, employeeName: a.assignedToName }, index))
    : input.trainingAssignments;

  // Insurance: exclude superseded prior-term policies (history, not risk), then
  // count only policies whose holder still works here, or entity-wide policies
  // (no holder). Unknown holders count as active — never silence a real lapse we
  // can't attribute — mirroring the credential rule.
  const supersededInsIds = supersededInsuranceIds(input.insurancePolicies ?? []);
  const currentInsurance = (input.insurancePolicies ?? []).filter((p) => !supersededInsIds.has(p.id));
  const insurance = index
    ? currentInsurance.filter((p) => holderIsActive({ employeeUserId: p.holderUserId, employeeName: p.holderName }, index))
    : currentInsurance;

  const overdueTasks = input.tasks.filter(taskIsOverdue).length;
  const expiredCreds = creds.filter(
    (c) => credentialStatus(c) === "expired",
  ).length;
  const expiringCreds = creds.filter(
    (c) => credentialStatus(c) === "expiring_soon",
  ).length;
  const expiredInsurance = insurance.filter((p) => insuranceStatus(p) === "expired").length;
  const expiringInsurance = insurance.filter((p) => insuranceStatus(p) === "expiring_soon").length;
  const overdueTraining = training.filter(assignmentIsOverdue).length;
  const docsNeedingReview = input.documents.filter(documentNeedsReview).length;
  const requirementGaps = input.requirementGaps ?? 0;

  const openRisk = input.riskCases.filter(
    (r) => r.status === "open" || r.status === "investigating",
  );
  const criticalRisk = openRisk.filter((r) => r.severity === "critical").length;
  const highRisk = openRisk.filter((r) => r.severity === "high").length;

  // CC-4: exclusion screening obligation, computed once here for consistency.
  const screeningDue = input.exclusionScreenings && input.employees
    ? exclusionScreeningOverdue(input.employees, input.exclusionScreenings)
    : 0;

  const factors: ScoreFactor[] = [
    { key: "overdueTasks", label: "Overdue tasks", count: overdueTasks, impact: deduct(overdueTasks, 3, 25) },
    { key: "expiredCreds", label: "Expired credentials", count: expiredCreds, impact: deduct(expiredCreds, 5, 20) },
    { key: "expiringCreds", label: "Credentials expiring ≤30d", count: expiringCreds, impact: deduct(expiringCreds, 2, 10) },
    { key: "requirementGaps", label: "Missing required credentials", count: requirementGaps, impact: deduct(requirementGaps, 3, 15) },
    { key: "expiredInsurance", label: "Expired insurance", count: expiredInsurance, impact: deduct(expiredInsurance, 5, 15) },
    { key: "expiringInsurance", label: "Insurance renewing ≤30d", count: expiringInsurance, impact: deduct(expiringInsurance, 2, 8) },
    { key: "overdueTraining", label: "Overdue training", count: overdueTraining, impact: deduct(overdueTraining, 2, 15) },
    { key: "docsReview", label: "Documents past review", count: docsNeedingReview, impact: deduct(docsNeedingReview, 2, 10) },
    { key: "criticalRisk", label: "Open critical risk cases", count: criticalRisk, impact: deduct(criticalRisk, 6, 18) },
    { key: "highRisk", label: "Open high risk cases", count: highRisk, impact: deduct(highRisk, 3, 12) },
    { key: "screeningDue", label: "Staff overdue for exclusion screening", count: screeningDue, impact: deduct(screeningDue, 1, 10) },
    // Additional caller-supplied recurring-obligation penalties.
    ...(input.extraFactors ?? []),
  ].filter((f) => f.count > 0);

  const total = factors.reduce((sum, f) => sum + f.impact, 0);
  const score = Math.max(0, Math.min(100, 100 + total));

  return {
    score,
    factors,
    criticalCount: overdueTasks + expiredCreds + expiredInsurance + requirementGaps + criticalRisk,
    highCount: expiringCreds + expiringInsurance + overdueTraining + highRisk,
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

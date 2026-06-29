import { daysUntil, isExpired, isExpiringSoon } from "./dates";
import type {
  ComplianceDocument,
  ComplianceTask,
  CredentialRecord,
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
}

function deduct(count: number, per: number, cap: number): number {
  return -Math.min(count * per, cap);
}

/**
 * Transparent score: start at 100 and subtract capped penalties per category.
 * Every deduction is surfaced in `factors` so the UI can explain the number.
 */
export function computeComplianceScore(input: ScoreInput): ComplianceScore {
  const overdueTasks = input.tasks.filter(taskIsOverdue).length;
  const expiredCreds = input.credentials.filter(
    (c) => credentialStatus(c) === "expired",
  ).length;
  const expiringCreds = input.credentials.filter(
    (c) => credentialStatus(c) === "expiring_soon",
  ).length;
  const overdueTraining =
    input.trainingAssignments.filter(assignmentIsOverdue).length;
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

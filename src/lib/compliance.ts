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

/** Requirement completion across current clinical staff (from the requirements
 *  engine). "missing" = required doc not on file yet — usually just not uploaded,
 *  so it feeds readiness/progress, NOT a score penalty. Computed by the caller
 *  (staffRequirementStats) to keep this module free of an import cycle. */
export interface StaffRequirementStats {
  clinicians: number;
  required: number;
  met: number;
  missing: number;
  expired: number;
}

export interface Achievement {
  key: string;
  label: string;
  description: string;
  unlocked: boolean;
}

export interface LevelInfo {
  tier: number;      // 1-based
  name: string;
  floor: number;     // points at which this level starts
  nextAt: number | null; // points needed for the next level (null at max)
}

/** Positive, monotonic "you're making progress" ladder — the gamified counter to
 *  a penalty-only score so ramp-up feels like climbing, not digging out. */
const LEVELS: { floor: number; name: string }[] = [
  { floor: 0, name: "Getting Started" },
  { floor: 300, name: "Building Momentum" },
  { floor: 800, name: "On Track" },
  { floor: 1600, name: "Well Managed" },
  { floor: 3000, name: "Gold Standard" },
];

export function levelForPoints(points: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].floor) idx = i;
  const next = LEVELS[idx + 1] ?? null;
  return { tier: idx + 1, name: LEVELS[idx].name, floor: LEVELS[idx].floor, nextAt: next ? next.floor : null };
}

export interface ComplianceScore {
  score: number; // 0–100 health (penalty-based, gentle)
  factors: ScoreFactor[];
  criticalCount: number;
  highCount: number;
  // Gamification layer — progress the officer earns, not just risk they carry.
  readiness: number;         // 0–100 completion; climbs as records are uploaded/done
  points: number;            // cumulative points for work completed
  level: LevelInfo;
  achievements: Achievement[];
  strengths: string[];       // positive callouts ("No expired licenses or insurance")
  rampUp: boolean;           // still onboarding — UI should lead with progress, not the score
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
  /** Requirement completion across current clinical staff (staffRequirementStats).
   *  Drives readiness/points; "missing" items are treated as not-yet-uploaded
   *  (progress to make), not a score penalty. */
  requirements?: StaffRequirementStats;
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

  const openRisk = input.riskCases.filter(
    (r) => r.status === "open" || r.status === "investigating",
  );
  const criticalRisk = openRisk.filter((r) => r.severity === "critical").length;
  const highRisk = openRisk.filter((r) => r.severity === "high").length;

  // CC-4: exclusion screening obligation, computed once here for consistency.
  const screeningDue = input.exclusionScreenings && input.employees
    ? exclusionScreeningOverdue(input.employees, input.exclusionScreenings)
    : 0;

  // Penalty weights, deliberately ordered: an INCOMPLETE TRAINING (a real gap in
  // someone's competency) is the heaviest per-item hit — no expired license or
  // insurance out-weighs it. A credential/policy just NOT UPLOADED YET is not a
  // penalty at all; it lowers readiness (below) instead, so ramp-up doesn't feel
  // like a hole. Every deduction is capped and surfaced for transparency.
  const factors: ScoreFactor[] = [
    { key: "overdueTraining", label: "Overdue / incomplete training", count: overdueTraining, impact: deduct(overdueTraining, 4, 24) },
    { key: "overdueTasks", label: "Overdue tasks", count: overdueTasks, impact: deduct(overdueTasks, 3, 18) },
    { key: "criticalRisk", label: "Open critical risk cases", count: criticalRisk, impact: deduct(criticalRisk, 4, 12) },
    { key: "expiredCreds", label: "Expired licenses / credentials", count: expiredCreds, impact: deduct(expiredCreds, 3, 15) },
    { key: "expiredInsurance", label: "Expired insurance", count: expiredInsurance, impact: deduct(expiredInsurance, 3, 12) },
    { key: "highRisk", label: "Open high risk cases", count: highRisk, impact: deduct(highRisk, 2, 8) },
    { key: "screeningDue", label: "Staff overdue for exclusion screening", count: screeningDue, impact: deduct(screeningDue, 1, 6) },
    { key: "expiringCreds", label: "Licenses expiring ≤30d", count: expiringCreds, impact: deduct(expiringCreds, 1, 6) },
    { key: "expiringInsurance", label: "Insurance renewing ≤30d", count: expiringInsurance, impact: deduct(expiringInsurance, 1, 5) },
    { key: "docsReview", label: "Documents past review", count: docsNeedingReview, impact: deduct(docsNeedingReview, 1, 5) },
    // Additional caller-supplied recurring-obligation penalties.
    ...(input.extraFactors ?? []),
  ].filter((f) => f.count > 0);

  const total = factors.reduce((sum, f) => sum + f.impact, 0);
  const score = Math.max(0, Math.min(100, 100 + total));

  /* ---------------------------- gamification layer ----------------------------
   * Positive progress the officer earns. Points go UP as records are uploaded and
   * obligations completed; readiness is % complete; levels + achievements reward
   * the climb. "Missing" required docs reduce readiness (something to do) but are
   * never a penalty — most are just not uploaded yet. */
  const req = input.requirements;
  const activeStaff = (input.employees ?? []).filter(
    (e) => e.employmentStatus === "active" || e.employmentStatus === "on_leave",
  ).length;
  const screenedStaff = Math.max(0, activeStaff - screeningDue);

  const credsOnFile = creds.filter((c) => credentialStatus(c) !== "expired").length;
  const policiesActive = insurance.filter((p) => insuranceStatus(p) !== "expired").length;
  const trainingDone = training.filter((a) => a.status === "completed").length;
  const trainingTotal = training.length;
  const resolvedRisk = input.riskCases.length - openRisk.length;

  const points =
    trainingDone * 15 +
    credsOnFile * 10 +
    policiesActive * 10 +
    screenedStaff * 5 +
    resolvedRisk * 10 +
    (req ? req.met * 12 : 0);
  const level = levelForPoints(points);

  // Readiness = average of whatever completion dimensions actually apply.
  const rates: number[] = [];
  if (trainingTotal > 0) rates.push(trainingDone / trainingTotal);
  if (req && req.required > 0) rates.push(req.met / req.required);
  if (activeStaff > 0) rates.push(screenedStaff / activeStaff);
  const readiness = rates.length ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) : 100;

  const noneExpired = expiredCreds === 0 && expiredInsurance === 0;
  const trainingRate = trainingTotal > 0 ? trainingDone / trainingTotal : 1;
  const screeningRate = activeStaff > 0 ? screenedStaff / activeStaff : 1;
  const reqRate = req && req.required > 0 ? req.met / req.required : 1;

  const achievements: Achievement[] = [
    { key: "first_docs", label: "First Documents", description: "Uploaded your first credential", unlocked: credsOnFile > 0 },
    { key: "halfway", label: "Halfway There", description: "Reached 50% readiness", unlocked: readiness >= 50 },
    { key: "training_champ", label: "Training Champion", description: "90%+ of training complete", unlocked: trainingTotal > 0 && trainingRate >= 0.9 },
    { key: "covered", label: "Covered", description: "Insurance on file with none expired", unlocked: policiesActive > 0 && expiredInsurance === 0 },
    { key: "nothing_expired", label: "Nothing Expired", description: "No expired licenses or insurance", unlocked: noneExpired && (credsOnFile > 0 || policiesActive > 0) },
    { key: "screened", label: "Screening Clean", description: "All active staff screened", unlocked: activeStaff > 0 && screeningRate >= 1 },
    { key: "audit_ready", label: "Audit Ready", description: "Reached 90% readiness", unlocked: readiness >= 90 },
  ];

  const strengths: string[] = [];
  if (noneExpired && (credsOnFile > 0 || policiesActive > 0)) strengths.push("No expired licenses or insurance");
  if (trainingTotal > 0 && trainingRate >= 0.9) strengths.push("Training is on track");
  if (activeStaff > 0 && screeningRate >= 1) strengths.push("All active staff screened");
  if (req && req.required > 0 && reqRate >= 0.9) strengths.push("Required credentials nearly complete");
  if (overdueTasks === 0) strengths.push("No overdue tasks");

  // Ramp-up: still building coverage. UI leads with progress, not the score.
  const rampUp = readiness < 70;

  return {
    score,
    factors,
    criticalCount: overdueTasks + expiredCreds + expiredInsurance + criticalRisk,
    highCount: expiringCreds + expiringInsurance + overdueTraining + highRisk,
    readiness,
    points,
    level,
    achievements,
    strengths,
    rampUp,
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

import type { LawObligation } from "@/lib/data/schema";

/**
 * Applicable-law engine.
 *
 * Given the facts about this organization — how many people it employs, which
 * states it employs them in, and a few yes/no conditions — decide which stored
 * obligations are live now, which switch on as it grows, and which are gated on
 * a fact nobody has confirmed yet.
 *
 * Deliberately conservative: an obligation whose condition is unknown is
 * surfaced as "check this", never silently dropped. Under-reporting a duty is
 * the expensive failure here.
 */

export interface OrgFacts {
  employeeCount: number;
  /** State codes where people are employed, e.g. ["UT"]. Federal always applies. */
  states: string[];
  /** Conditions known to be TRUE. Anything absent is treated as unknown, not false. */
  conditionsMet: string[];
  /** Conditions known to be FALSE — these do remove an obligation. */
  conditionsNotMet: string[];
}

export type ObligationStatus =
  /** Applies on the facts as they stand. */
  | "applies"
  /** Would apply, but hangs on a condition nobody has confirmed. */
  | "check"
  /** Switches on above the current headcount. */
  | "upcoming"
  /** Ruled out — wrong state, or a condition confirmed false. */
  | "not_applicable";

export interface EvaluatedObligation {
  obligation: LawObligation;
  status: ObligationStatus;
  /** Plain-language reason, shown next to the badge. */
  reason: string;
  /** Conditions still to be confirmed. */
  openConditions: string[];
  /** Headcount at which it switches on, when upcoming. */
  threshold: number | null;
}

export interface Evaluation {
  applies: EvaluatedObligation[];
  check: EvaluatedObligation[];
  upcoming: EvaluatedObligation[];
  notApplicable: EvaluatedObligation[];
  /** Distinct future headcount thresholds with what each one triggers. */
  milestones: { threshold: number; obligations: LawObligation[] }[];
  needsReview: LawObligation[];
}

/** Human labels for the condition flags stored on an obligation. */
export const CONDITION_LABELS: Record<string, string> = {
  group_health_plan: "Sponsors a group health plan",
  federal_contractor: "Holds a federal contract",
  covered_entity: "Is a HIPAA covered entity",
  osha_partially_exempt_naics: "Establishment NAICS is on OSHA's partial-exemption list",
};

export function conditionLabel(key: string): string {
  return CONDITION_LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * A condition can invert the meaning of an obligation: OSHA recordkeeping is one
 * we are EXCUSED from when the flag is true, rather than one that requires it.
 */
const EXCUSING_CONDITIONS = new Set(["osha_partially_exempt_naics"]);

export function evaluateObligations(obligations: LawObligation[], facts: OrgFacts): Evaluation {
  const met = new Set(facts.conditionsMet);
  const notMet = new Set(facts.conditionsNotMet);
  const states = new Set(facts.states.map((s) => s.toUpperCase()));

  const applies: EvaluatedObligation[] = [];
  const check: EvaluatedObligation[] = [];
  const upcoming: EvaluatedObligation[] = [];
  const notApplicable: EvaluatedObligation[] = [];

  for (const o of obligations) {
    if (!o.active) continue;

    // Jurisdiction first — a state law for a state we don't employ in is out.
    const juris = (o.jurisdiction ?? "federal").toUpperCase();
    if (juris !== "FEDERAL" && !states.has(juris)) {
      notApplicable.push({
        obligation: o, status: "not_applicable",
        reason: `State law for ${juris}; no employees there.`,
        openConditions: [], threshold: null,
      });
      continue;
    }

    // Headcount bounds.
    const min = o.appliesAll ? null : o.minEmployees ?? null;
    const max = o.maxEmployees ?? null;

    if (min != null && facts.employeeCount < min) {
      upcoming.push({
        obligation: o, status: "upcoming",
        reason: `Switches on at ${min} employees — ${min - facts.employeeCount} more than today.`,
        openConditions: [], threshold: min,
      });
      continue;
    }
    if (max != null && facts.employeeCount > max) {
      notApplicable.push({
        obligation: o, status: "not_applicable",
        reason: `Applies only at or below ${max} employees.`,
        openConditions: [], threshold: null,
      });
      continue;
    }

    // Conditions.
    const excusing = o.conditions.filter((c) => EXCUSING_CONDITIONS.has(c));
    const gating = o.conditions.filter((c) => !EXCUSING_CONDITIONS.has(c));

    const confirmedFalse = gating.find((c) => notMet.has(c));
    if (confirmedFalse) {
      notApplicable.push({
        obligation: o, status: "not_applicable",
        reason: `${conditionLabel(confirmedFalse)} — confirmed not to apply here.`,
        openConditions: [], threshold: null,
      });
      continue;
    }

    const open = [...gating.filter((c) => !met.has(c)), ...excusing.filter((c) => !met.has(c) && !notMet.has(c))];
    const excused = excusing.find((c) => met.has(c));

    if (excused) {
      notApplicable.push({
        obligation: o, status: "not_applicable",
        reason: `${conditionLabel(excused)} — this duty is lifted, but read the summary for what still applies.`,
        openConditions: [], threshold: null,
      });
      continue;
    }

    if (open.length > 0) {
      check.push({
        obligation: o, status: "check",
        reason: `Turns on ${open.map(conditionLabel).join(" and ").toLowerCase()} — confirm before relying on this.`,
        openConditions: open, threshold: min,
      });
      continue;
    }

    applies.push({
      obligation: o, status: "applies",
      reason: o.appliesAll
        ? "Applies to every employer, regardless of size."
        : `At ${facts.employeeCount} employees you are over the ${min}-employee line.`,
      openConditions: [], threshold: min,
    });
  }

  // Growth milestones: the next headcounts that change the picture.
  const byThreshold = new Map<number, LawObligation[]>();
  for (const u of upcoming) {
    if (u.threshold == null) continue;
    const list = byThreshold.get(u.threshold) ?? [];
    list.push(u.obligation);
    byThreshold.set(u.threshold, list);
  }
  const milestones = [...byThreshold.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([threshold, obs]) => ({ threshold, obligations: obs }));

  const needsReview = obligations.filter((o) => o.active && o.reviewStatus === "needs_review");

  return { applies, check, upcoming, notApplicable, milestones, needsReview };
}

/** What in the Hub is already linked to this obligation. Explicit links only — no guessing. */
export function coverageOf(o: LawObligation): { covered: boolean; kinds: string[] } {
  const kinds: string[] = [];
  if (o.linkedDocumentId) kinds.push("SOP");
  if (o.linkedTrainingModuleId) kinds.push("Training");
  if (o.linkedFormTemplateId) kinds.push("Form");
  if (o.regulatorySourceId) kinds.push("Source");
  return { covered: kinds.length > 0, kinds };
}

export const TOPIC_LABELS: Record<string, string> = {
  discrimination: "Discrimination & EEO",
  leave: "Leave & accommodation",
  wage_hour: "Wage & hour",
  hiring: "Hiring",
  termination: "Termination",
  benefits: "Benefits",
  safety: "Safety",
  recordkeeping: "Recordkeeping & reporting",
  posting: "Postings",
  privacy: "Privacy",
  tax: "Tax",
  other: "Other",
};

import type { CategoryKey } from "./categories";
import { expiryStatus, type RecordMeta } from "./records";
import { JOURNEY_BY_KEY, type Journey, type JourneyKey, type Milestone } from "./journeys";

/**
 * How ready this household is — and, just as importantly, how ready it *isn't*.
 *
 * The previous score counted one thing (does a category contain any record?) and
 * presented it as a single percentage. That number can reach 100% while the
 * vault is full of placeholders and expired documents, which means it can tell a
 * household they are safe when they are not. A readiness score that lies by
 * omission is its own dark pattern, so this module reports three separate
 * things and refuses to average them into one reassuring number:
 *
 *   • **covered**   — is anything recorded at all? (breadth)
 *   • **current**   — is what's recorded still in date? (freshness)
 *   • **unknown**   — what we cannot see, and never can
 *
 * The third is the honest one. We store ciphertext, so we genuinely cannot tell
 * whether a record's contents are correct, complete, or up to date. Saying so
 * out loud is the difference between a progress bar and a promise we can't keep.
 */

export interface MilestoneProgress {
  milestone: Milestone;
  /** Categories still without a record. */
  missing: CategoryKey[];
  /** Categories whose only records have expired. */
  stale: CategoryKey[];
  complete: boolean;
}

export interface Readiness {
  journey: Journey;
  milestones: MilestoneProgress[];
  /** Milestones fully achieved. The number a household should actually watch. */
  achieved: number;
  total: number;
  /** True once every milestone on this journey is met. */
  finished: boolean;
  /** Records past their expiry date — the one form of "wrong" we CAN detect. */
  expired: RecordMeta[];
  /** Records expiring inside the reminder window. */
  expiringSoon: RecordMeta[];
  /** Plain-language statement of what this assessment cannot see. */
  limits: string[];
}

const SOON_DAYS = 90;

function hasCurrentRecord(records: RecordMeta[], category: CategoryKey, now: number): boolean {
  return records.some((r) => r.category === category && expiryStatus(r, SOON_DAYS, now) !== "expired");
}

function hasAnyRecord(records: RecordMeta[], category: CategoryKey): boolean {
  return records.some((r) => r.category === category);
}

export function assessReadiness(
  records: RecordMeta[],
  journeyKey: JourneyKey,
  now: number = Date.now(),
): Readiness {
  const journey = JOURNEY_BY_KEY[journeyKey];

  const milestones: MilestoneProgress[] = journey.milestones.map((milestone) => {
    const missing = milestone.requires.filter((c) => !hasAnyRecord(records, c));
    // "Stale" means something IS recorded but every copy has expired — a
    // different problem from an empty category, and a different fix.
    const stale = milestone.requires.filter(
      (c) => hasAnyRecord(records, c) && !hasCurrentRecord(records, c, now),
    );
    return { milestone, missing, stale, complete: missing.length === 0 && stale.length === 0 };
  });

  const expired = records.filter((r) => expiryStatus(r, SOON_DAYS, now) === "expired");
  const expiringSoon = records.filter((r) => expiryStatus(r, SOON_DAYS, now) === "soon");
  const achieved = milestones.filter((m) => m.complete).length;

  return {
    journey,
    milestones,
    achieved,
    total: milestones.length,
    finished: achieved === milestones.length,
    expired,
    expiringSoon,
    limits: [
      "Whether what you've written down is accurate or complete — your records are encrypted, so we genuinely can't read them to check.",
      "Documents with no expiry date, which we have no way to know have gone out of date.",
      "Anything your household needs that isn't one of the categories here.",
    ],
  };
}

/**
 * What this household has actually gained, phrased as capabilities rather than
 * scores. Used where a percentage would otherwise appear.
 *
 * Deliberately positive-only: gaps are handled by the coach as invitations, not
 * repeated here as a running tally of shortcomings.
 */
export function wins(readiness: Readiness): string[] {
  return readiness.milestones.filter((m) => m.complete).map((m) => m.milestone.title);
}

/**
 * Once a household is finished, they should hear from us rarely — only when
 * something genuinely needs a human decision. This is the check that lets the
 * product get out of the way, which for a completion product is the goal rather
 * than a failure.
 */
export interface MaintenanceState {
  /** Nothing to do right now. */
  atRest: boolean;
  /** Things that genuinely need attention, in priority order. */
  needsAttention: RecordMeta[];
  /** How often a finished household should be prompted, in days. */
  cadenceDays: number;
}

export function maintenanceState(readiness: Readiness): MaintenanceState {
  const needsAttention = [...readiness.expired, ...readiness.expiringSoon];
  return {
    atRest: readiness.finished && needsAttention.length === 0,
    needsAttention,
    cadenceDays: readiness.journey.maintenanceCadenceDays,
  };
}

/**
 * A defensible, non-manipulative statement of what being organised is worth.
 *
 * Deliberately NOT a dollar figure. An invented "saves you $4,200 a year" would
 * be a fabricated number used to drive behaviour — the same manipulation the
 * rest of this design avoids, just pointed somewhere friendly. What we can say
 * honestly is what the household will no longer have to do, and the widely
 * reported fact that settling an estate takes executors months of work largely
 * spent locating things exactly like these.
 */
export function valueStatement(readiness: Readiness): { headline: string; detail: string } {
  const { journey, achieved } = readiness;

  if (achieved === 0) {
    return {
      headline: "Start with one thing",
      detail:
        "Add a single record — the Wi-Fi password is a fine first one. The point of this isn't to finish today; it's to stop keeping it all in your head.",
    };
  }

  if (readiness.finished) {
    return {
      headline: "This is done",
      detail:
        journey.key === "organized"
          ? "Neither of you has to be the one who remembers any more. We'll only get in touch when a document is actually about to expire."
          : "Everything your family would need is recorded and findable. Settling an estate routinely costs executors months, most of it spent hunting for exactly these things. We'll check in rarely from here.",
    };
  }

  return {
    headline: `${achieved} of ${readiness.total} done`,
    detail:
      journey.key === "organized"
        ? "Each one of these is something neither of you has to hold in your head any more."
        : "Each one of these is a question your family won't have to answer from scratch.",
  };
}

import { CATEGORIES, CATEGORY_BY_KEY, type Category, type CategoryKey } from "./categories";
import { expiryStatus, type RecordMeta } from "./records";
import type { JourneyKey } from "./journeys";
import { assessReadiness, type Readiness } from "./readiness";

/**
 * The coach.
 *
 * Its job is to make the next step obvious and small — never to make anyone feel
 * behind. Three rules, in order of how easy they are to break:
 *
 * 1. **Invite, don't accuse.** "Add where the originals live" is a suggestion.
 *    "Your household can't hand this over if it isn't recorded" is a threat
 *    dressed as advice. Nothing here may imply someone is failing their family.
 *
 * 2. **Suggestions are dismissible.** A household that has decided a category
 *    doesn't apply to them is right, and the app is wrong to keep asking. Every
 *    step can be deferred or marked not-applicable, and that choice sticks.
 *
 * 3. **Silence is a valid end state.** When there is nothing worth doing, the
 *    coach says so and stops. It does not invent work to fill the space.
 */

export interface CategoryCoverage {
  category: Category;
  count: number;
  covered: boolean;
}

export type StepKind = "add" | "renew" | "celebrate";

export interface CoachStep {
  id: string;
  kind: StepKind;
  /** Phrased as an action the user might want to take, not a deficiency. */
  title: string;
  detail: string;
  /** Why this is worth doing, in the journey's terms. Never a consequence-threat. */
  because: string;
  /** Roughly how long it takes, so "later" is an informed choice. */
  minutes: number;
  category?: CategoryKey;
}

/** A household's decisions about what the coach should stop suggesting. */
export interface CoachPreferences {
  /** Categories the household has said don't apply to them. */
  notApplicable: CategoryKey[];
  /** Step ids deferred until a later date (ms epoch). */
  snoozedUntil: Record<string, number>;
}

export const NO_PREFERENCES: CoachPreferences = { notApplicable: [], snoozedUntil: {} };

export function categoryCoverage(records: RecordMeta[]): CategoryCoverage[] {
  return CATEGORIES.map((category) => {
    const count = records.filter((r) => r.category === category.key).length;
    return { category, count, covered: count > 0 };
  });
}

/** Rough time-to-complete, so a household can choose to do the five-minute one. */
const MINUTES_BY_CATEGORY: Partial<Record<CategoryKey, number>> = {
  household: 3,
  contacts: 3,
  accounts: 10,
  medical: 8,
  insurance: 5,
  financial: 10,
  identity: 8,
  property: 5,
  estate: 10,
  directives: 15,
  hazmat: 3,
};

function minutesFor(key: CategoryKey): number {
  return MINUTES_BY_CATEGORY[key] ?? 5;
}

/**
 * The next few things this household might want to do — ordered by their
 * journey, not by our idea of what's important.
 *
 * Returns at most `limit` steps. Showing everything at once is how a tool
 * becomes the burden it was supposed to lift; a short list is finishable.
 */
export function coachSteps(
  records: RecordMeta[],
  journeyKey: JourneyKey,
  prefs: CoachPreferences = NO_PREFERENCES,
  now: number = Date.now(),
  limit = 3,
): CoachStep[] {
  const readiness = assessReadiness(records, journeyKey, now);
  const steps: CoachStep[] = [];
  const skip = new Set(prefs.notApplicable);

  // Expired documents first: this is the one problem we can actually detect,
  // and it is concrete rather than aspirational.
  for (const record of readiness.expired) {
    steps.push({
      id: `renew-${record.id}`,
      kind: "renew",
      title: `${record.label} has expired`,
      detail: `It expired on ${record.expiresOn}. Update the record once it's renewed and we'll stop mentioning it.`,
      because: "Out-of-date records are the ones that cause trouble at the worst moment.",
      minutes: 2,
      category: record.category,
    });
  }

  // Then the current milestone — one milestone at a time, so there is always a
  // visible near edge rather than an undifferentiated pile of everything.
  const nextMilestone = readiness.milestones.find((m) => !m.complete);
  if (nextMilestone) {
    for (const key of [...nextMilestone.missing, ...nextMilestone.stale]) {
      if (skip.has(key)) continue;
      const category = CATEGORY_BY_KEY[key];
      steps.push({
        id: `add-${key}`,
        kind: "add",
        title: `Add your ${category.label.toLowerCase()}`,
        detail: `${category.examples.slice(0, 2).join(", ")} — about ${minutesFor(key)} minutes.`,
        because: nextMilestone.milestone.why,
        minutes: minutesFor(key),
        category: key,
      });
    }
  }

  // Expiring-soon last: useful to know, not urgent, and explicitly framed that way.
  for (const record of readiness.expiringSoon) {
    steps.push({
      id: `soon-${record.id}`,
      kind: "renew",
      title: `${record.label} renews on ${record.expiresOn}`,
      detail: "No rush — this is just so it doesn't catch you by surprise.",
      because: "Renewal dates are easy to miss and annoying to fix late.",
      minutes: 2,
      category: record.category,
    });
  }

  const visible = steps.filter((s) => (prefs.snoozedUntil[s.id] ?? 0) <= now);

  // Nothing to do is a real, reportable state — not an empty list to be filled.
  if (visible.length === 0) {
    return [
      {
        id: "at-rest",
        kind: "celebrate",
        title: readiness.finished ? "You're done here" : "Nothing needs you right now",
        detail: readiness.finished
          ? "We'll only get in touch when a document is genuinely about to expire."
          : "Come back when you feel like adding more — it'll keep.",
        because: "",
        minutes: 0,
      },
    ];
  }

  return visible.slice(0, limit);
}

/** Defer a suggestion. The household decides when "later" is. */
export function snooze(prefs: CoachPreferences, stepId: string, days: number, now = Date.now()): CoachPreferences {
  return {
    ...prefs,
    snoozedUntil: { ...prefs.snoozedUntil, [stepId]: now + days * 24 * 60 * 60 * 1000 },
  };
}

/** Stop suggesting a category entirely. Households without a pool know that. */
export function markNotApplicable(prefs: CoachPreferences, category: CategoryKey): CoachPreferences {
  return prefs.notApplicable.includes(category)
    ? prefs
    : { ...prefs, notApplicable: [...prefs.notApplicable, category] };
}

export function restoreCategory(prefs: CoachPreferences, category: CategoryKey): CoachPreferences {
  return { ...prefs, notApplicable: prefs.notApplicable.filter((c) => c !== category) };
}

/**
 * Retained for callers that still want a single breadth figure — but see
 * `assessReadiness`, which is what the UI uses. A lone percentage overstates
 * what we can actually know, so this is not shown to households as a headline.
 */
export function coverageBreadth(records: RecordMeta[]): number {
  const coverage = categoryCoverage(records);
  const weight = { critical: 3, high: 2, standard: 1 } as const;
  const total = coverage.reduce((s, c) => s + weight[c.category.tier], 0);
  const got = coverage.reduce((s, c) => s + (c.covered ? weight[c.category.tier] : 0), 0);
  return Math.round((got / total) * 100);
}

export type { Readiness };
export { assessReadiness, expiryStatus };

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coachSteps,
  snooze,
  markNotApplicable,
  restoreCategory,
  NO_PREFERENCES,
  type CoachPreferences,
} from "./coach";
import { assessReadiness, maintenanceState, valueStatement, wins } from "./readiness";
import { JOURNEYS, JOURNEY_BY_KEY, priorityOrder } from "./journeys";
import type { RecordMeta } from "./records";
import type { CategoryKey } from "./categories";

/**
 * These cover behaviour, and also **tone** — because tone is the thing most
 * likely to regress quietly. A copy tweak that reintroduces guilt will not fail
 * a type check, so the vocabulary rules are asserted here instead.
 */

const NOW = Date.parse("2026-08-22T12:00:00Z");

function rec(id: string, category: CategoryKey, expiresOn: string | null = null): RecordMeta {
  return {
    id,
    householdId: "h",
    category,
    tier: "standard",
    label: `${category} record`,
    kind: "digital",
    hasPhysicalLocation: false,
    expiresOn,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

/** Enough records to finish the "organized" journey. */
function organisedHousehold(): RecordMeta[] {
  const cats = priorityOrder(JOURNEY_BY_KEY.organized);
  return cats.map((c, i) => rec(`r${i}`, c));
}

// --- Tone ------------------------------------------------------------------

test("no coach copy blames the household or invokes fear", () => {
  // The old copy read "your household can't hand this over if it isn't
  // recorded". That is a threat wearing a helpful face, and it is the single
  // easiest thing to reintroduce by accident.
  const banned = [
    "can't hand this over",
    "you failed",
    "don't break",
    "you've missed",
    "hurry",
    "act now",
    "before it's too late",
    "at risk",
    "you should have",
  ];

  const everything: string[] = [];
  for (const journey of JOURNEYS) {
    everything.push(journey.goal, journey.tagline, journey.handoverFraming);
    for (const m of journey.milestones) everything.push(m.title, m.why);

    for (const records of [[], organisedHousehold()]) {
      for (const step of coachSteps(records, journey.key, NO_PREFERENCES, NOW, 10)) {
        everything.push(step.title, step.detail, step.because);
      }
      const readiness = assessReadiness(records, journey.key, NOW);
      const value = valueStatement(readiness);
      everything.push(value.headline, value.detail);
    }
  }

  for (const text of everything) {
    for (const phrase of banned) {
      assert.ok(
        !text.toLowerCase().includes(phrase),
        `copy should not contain "${phrase}": ${JSON.stringify(text)}`,
      );
    }
  }
});

test("milestones are stated as capabilities gained, not chores outstanding", () => {
  for (const journey of JOURNEYS) {
    for (const m of journey.milestones) {
      assert.ok(m.title.length > 0);
      // A chore list starts with a verb at the user ("Add…", "Complete…").
      assert.ok(
        !/^(add|complete|finish|fix|upload)\b/i.test(m.title),
        `milestone reads as a chore: ${m.title}`,
      );
    }
  }
});

// --- The completion-product rule -------------------------------------------

test("an empty vault suggests a small first step, not a pile of work", () => {
  const steps = coachSteps([], "organized", NO_PREFERENCES, NOW);
  assert.ok(steps.length <= 3, "should not dump every gap at once");
  assert.ok(steps.every((s) => s.minutes <= 15));
});

test("the first milestone of every journey is reachable in one sitting", () => {
  for (const journey of JOURNEYS) {
    const first = journey.milestones[0];
    const minutes = coachSteps([], journey.key, NO_PREFERENCES, NOW, 10)
      .filter((s) => s.category && first.requires.includes(s.category))
      .reduce((sum, s) => sum + s.minutes, 0);
    assert.ok(minutes <= 25, `${journey.key}'s first milestone needs ${minutes} minutes`);
  }
});

test("a finished household is told it is done, and nothing is invented to fill the space", () => {
  const steps = coachSteps(organisedHousehold(), "organized", NO_PREFERENCES, NOW);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, "celebrate");
  assert.match(steps[0].title, /done/i);
});

test("a finished household with nothing expiring is at rest", () => {
  const readiness = assessReadiness(organisedHousehold(), "organized", NOW);
  const state = maintenanceState(readiness);
  assert.equal(readiness.finished, true);
  assert.equal(state.atRest, true);
  assert.ok(state.cadenceDays >= 90, "a finished household should be left alone for months");
});

// --- User control -----------------------------------------------------------

test("a household can say a category doesn't apply, and it stops being suggested", () => {
  const before = coachSteps([], "organized", NO_PREFERENCES, NOW, 10);
  const suggested = before.find((s) => s.category)?.category as CategoryKey;

  const prefs = markNotApplicable(NO_PREFERENCES, suggested);
  const after = coachSteps([], "organized", prefs, NOW, 10);

  assert.ok(!after.some((s) => s.category === suggested), "dismissed category came back");
  assert.deepEqual(restoreCategory(prefs, suggested).notApplicable, []);
});

test("a snoozed step stays gone until the household's chosen date", () => {
  const step = coachSteps([], "handover", NO_PREFERENCES, NOW, 10)[0];
  const prefs: CoachPreferences = snooze(NO_PREFERENCES, step.id, 30, NOW);

  const soon = coachSteps([], "handover", prefs, NOW + 24 * 60 * 60 * 1000, 10);
  assert.ok(!soon.some((s) => s.id === step.id), "snoozed step reappeared early");

  const later = coachSteps([], "handover", prefs, NOW + 31 * 24 * 60 * 60 * 1000, 10);
  assert.ok(later.some((s) => s.id === step.id), "snoozed step never came back");
});

// --- Honesty ----------------------------------------------------------------

test("readiness states plainly what it cannot see", () => {
  const readiness = assessReadiness(organisedHousehold(), "organized", NOW);
  assert.ok(readiness.limits.length >= 2);
  assert.ok(
    readiness.limits.some((l) => /accurate|complete/i.test(l)),
    "must disclose that record contents are unverifiable",
  );
});

test("a full-but-expired vault is not reported as finished", () => {
  // The failure the old single score allowed: 100% breadth while every document
  // is out of date.
  const expired = priorityOrder(JOURNEY_BY_KEY.organized).map((c, i) => rec(`r${i}`, c, "2020-01-01"));
  const readiness = assessReadiness(expired, "organized", NOW);

  assert.equal(readiness.finished, false, "expired records must not count as ready");
  assert.ok(readiness.expired.length > 0);
  assert.ok(readiness.milestones.some((m) => m.stale.length > 0), "should distinguish stale from missing");
});

test("missing and stale are different problems", () => {
  const stale = [rec("a", "household", "2020-01-01")];
  const readiness = assessReadiness(stale, "organized", NOW);
  const first = readiness.milestones[0];

  assert.ok(first.stale.includes("household"), "an expired record is stale, not missing");
  assert.ok(!first.missing.includes("household"), "something IS recorded, so it isn't missing");
});

test("the value statement makes no fabricated financial claims", () => {
  // Inventing "saves you $4,200 a year" would be a made-up number used to drive
  // behaviour — the same manipulation this design avoids, pointed somewhere
  // friendly.
  for (const journey of JOURNEYS) {
    for (const records of [[], organisedHousehold()]) {
      const { headline, detail } = valueStatement(assessReadiness(records, journey.key, NOW));
      for (const text of [headline, detail]) {
        assert.ok(!/\$\s?\d/.test(text), `invented a dollar figure: ${text}`);
        assert.ok(!/\d+\s*%/.test(text), `invented a percentage claim: ${text}`);
      }
    }
  }
});

test("wins report what was achieved and never what is outstanding", () => {
  const partial = [rec("a", "household"), rec("b", "contacts")];
  const readiness = assessReadiness(partial, "organized", NOW);
  const achieved = wins(readiness);

  assert.deepEqual(achieved, ["Either of you can run the house"]);
  assert.equal(achieved.length, readiness.achieved);
});

// --- Journeys ---------------------------------------------------------------

test("every journey is finishable and orders the same categories differently", () => {
  const orders = JOURNEYS.map((j) => priorityOrder(j).join(","));
  assert.equal(new Set(orders).size, JOURNEYS.length, "journeys should not be reskins of one order");

  for (const journey of JOURNEYS) {
    assert.ok(journey.milestones.length >= 3);
    const complete = priorityOrder(journey).map((c, i) => rec(`r${i}`, c));
    assert.equal(assessReadiness(complete, journey.key, NOW).finished, true, `${journey.key} is unfinishable`);
  }
});

test("the organised journey leads with everyday life, not with dying", () => {
  // Someone here to run a household should not be met with mortality.
  const journey = JOURNEY_BY_KEY.organized;
  const opening = `${journey.tagline} ${journey.goal} ${journey.milestones[0].title} ${journey.milestones[0].why}`;
  for (const word of ["death", "die", "dies", "estate", "executor", "passing"]) {
    assert.ok(!opening.toLowerCase().includes(word), `opening copy mentions "${word}"`);
  }
  assert.equal(priorityOrder(journey)[0], "household");
});

test("the handover journey does lead with what that household came for", () => {
  const journey = JOURNEY_BY_KEY.handover;
  assert.equal(priorityOrder(journey)[0], "identity");
  assert.ok(journey.milestones.some((m) => m.requires.includes("estate")));
});

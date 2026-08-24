import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOURCES,
  DEFAULT_ASSUMPTIONS,
  NOT_INCLUDED,
  annualHouseholdSaving,
  handoverSaving,
  formatHours,
  formatDollars,
  DOLLAR_CAVEAT,
  type ValueAssumptions,
} from "./value";

/**
 * These guard the *integrity* of the estimate as much as the arithmetic. The
 * failure mode for a feature like this isn't a wrong sum — it's a number that
 * quietly grows until it's marketing.
 */

test("every source is attributed, linked, and carries a provenance note", () => {
  assert.ok(SOURCES.length >= 3);
  for (const s of SOURCES) {
    assert.ok(s.url.startsWith("https://"), `${s.id} has no link`);
    assert.ok(s.publisher.length > 0, `${s.id} has no publisher`);
    assert.ok(s.provenance.length > 20, `${s.id} needs an honest provenance note`);
  }
});

test("vendor-funded sources are disclosed as such", () => {
  // A household should be able to see which numbers came from someone selling
  // something, without having to click through.
  const password = SOURCES.find((s) => s.id === "password-resets")!;
  const lost = SOURCES.find((s) => s.id === "lost-items")!;
  assert.match(password.provenance, /vendor|benefit|commission/i);
  assert.match(lost.provenance, /sell|company/i);
});

test("defaults sit at the conservative end of the published ranges", () => {
  // Published password figures run 11–26 h/yr. Defaulting to anything above the
  // floor means picking the vendor's number over the sceptic's.
  assert.equal(DEFAULT_ASSUMPTIONS.passwordHoursPerYear, 11);
  // The lost-item survey covers ~60 h/yr across ALL misplaced items; paperwork
  // is one of several categories.
  assert.ok(DEFAULT_ASSUMPTIONS.paperworkHoursPerYear <= 20);
  // A vault removes searching, not every errand.
  assert.ok(DEFAULT_ASSUMPTIONS.recoverableShare < 1);
  // Most executor time is process and waiting, not hunting.
  assert.ok(DEFAULT_ASSUMPTIONS.executorSearchShare <= 0.25);
});

test("the workplace document-search statistic is not used anywhere", () => {
  // "Knowledge workers spend ~5 hours/week searching for documents" measures
  // paid office work. Borrowing it for household admin would inflate this by an
  // order of magnitude, and it is the standard trick in calculators like this.
  //
  // 5 h/week is 260 h/year; nothing here may imply anything near that.
  const estimate = annualHouseholdSaving();
  assert.ok(estimate.highHours < 100, `annual estimate of ${estimate.highHours}h is implausibly large`);
  for (const s of SOURCES) {
    assert.ok(!/knowledge worker/i.test(s.claim), "workplace stat leaked into the sources");
  }
});

test("the estimate never claims to save more time than is lost", () => {
  const a = DEFAULT_ASSUMPTIONS;
  const totalLostPerAdult = 26 + a.paperworkHoursPerYear; // upper bound of inputs
  const ceiling = totalLostPerAdult * a.adults;
  assert.ok(annualHouseholdSaving().highHours <= ceiling);
});

test("handover saving counts only the searching part of settling an estate", () => {
  const a = DEFAULT_ASSUMPTIONS;
  const estimate = handoverSaving();
  // Must be far below the headline 570-hour figure, which is mostly court
  // filings, tax returns and waiting.
  assert.ok(estimate.highHours < a.executorHours * 0.25, "claiming too much of the executor's time");
  assert.ok(estimate.lowHours > 0);
});

test("results are ranges, because the underlying studies disagree", () => {
  const annual = annualHouseholdSaving();
  assert.ok(annual.highHours > annual.lowHours, "a single number would overstate our confidence");
  assert.match(formatHours(annual), /–/);
  assert.match(formatDollars(annual), /–/);
});

test("assumptions actually drive the result", () => {
  // If a household disagrees with our guesses, changing them must matter.
  const doubled: ValueAssumptions = { ...DEFAULT_ASSUMPTIONS, adults: 4 };
  assert.equal(annualHouseholdSaving(doubled).lowHours, annualHouseholdSaving().lowHours * 2);

  const cheaper: ValueAssumptions = { ...DEFAULT_ASSUMPTIONS, hourlyRate: 20 };
  assert.ok(annualHouseholdSaving(cheaper).lowDollars < annualHouseholdSaving().lowDollars);

  const sceptic: ValueAssumptions = { ...DEFAULT_ASSUMPTIONS, recoverableShare: 0 };
  assert.equal(annualHouseholdSaving(sceptic).lowHours, 0, "a sceptical household should be able to zero it out");
});

test("what the estimate excludes is stated, including the cost of using the app", () => {
  assert.ok(NOT_INCLUDED.length >= 3);
  assert.ok(
    NOT_INCLUDED.some((n) => /putting information into|time you spend/i.test(n)),
    "must admit that using HomeVault itself takes time",
  );
});

test("the dollar figure travels with its caveat", () => {
  assert.match(DOLLAR_CAVEAT, /not money you'll receive|translation/i);
});

test("formatting collapses to a single value when there is genuinely no range", () => {
  const flat: ValueAssumptions = { ...DEFAULT_ASSUMPTIONS, passwordHoursPerYear: 26 };
  assert.ok(!formatHours(annualHouseholdSaving(flat)).includes("–"));
});

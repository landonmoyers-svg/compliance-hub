import { test } from "node:test";
import assert from "node:assert/strict";
import {
  transition,
  validatePlan,
  isArmable,
  triggersSatisfied,
  type HandoverPlan,
  type HandoverSignals,
} from "./handover";

const DAY = 24 * 60 * 60 * 1000;

function basePlan(overrides: Partial<HandoverPlan> = {}): HandoverPlan {
  return {
    id: "p1",
    householdId: "h1",
    tiers: ["critical"],
    triggers: [{ kind: "dual_key", shareCount: 3, threshold: 2, requiredHolders: [] }],
    combine: "any",
    graceDays: 7,
    recipientIds: ["r1"],
    state: "CONFIGURED",
    ...overrides,
  };
}

function signals(overrides: Partial<HandoverSignals> = {}): HandoverSignals {
  return {
    now: 1_000_000_000_000,
    lastOwnerCheckInAt: 1_000_000_000_000,
    contributingHolders: [],
    legalEvidenceApproved: false,
    contactConfirmed: false,
    ...overrides,
  };
}

test("critical-tier dual_key with threshold 1 is not armable", () => {
  const plan = basePlan({ triggers: [{ kind: "dual_key", shareCount: 3, threshold: 1, requiredHolders: [] }] });
  assert.ok(validatePlan(plan).some((i) => i.level === "error"));
  assert.equal(isArmable(plan), false);
});

test("a valid 2-of-3 critical plan is armable", () => {
  assert.equal(isArmable(basePlan()), true);
});

test("cannot arm a plan with no recipients", () => {
  const plan = basePlan({ recipientIds: [] });
  const r = transition({ plan, signals: signals() }, { type: "arm" });
  assert.equal(r.ok, false);
});

test("dual_key trigger needs threshold distinct holders", () => {
  const plan = basePlan();
  assert.equal(triggersSatisfied(plan, signals({ contributingHolders: ["a"] })), false);
  assert.equal(triggersSatisfied(plan, signals({ contributingHolders: ["a", "b"] })), true);
});

test("mandatory trustee must participate even past threshold", () => {
  const plan = basePlan({
    triggers: [{ kind: "dual_key", shareCount: 3, threshold: 2, requiredHolders: ["trustee"] }],
  });
  assert.equal(triggersSatisfied(plan, signals({ contributingHolders: ["a", "b"] })), false);
  assert.equal(triggersSatisfied(plan, signals({ contributingHolders: ["a", "trustee"] })), true);
});

test("verification is impossible before the grace window elapses", () => {
  const plan = basePlan({ state: "PENDING" });
  const now = 2_000_000_000_000;
  const sig = signals({ now, contributingHolders: ["a", "b"] });
  const tooEarly = transition({ plan, signals: sig, pendingSince: now - 2 * DAY }, { type: "verify" });
  assert.equal(tooEarly.ok, false);
  const afterGrace = transition({ plan, signals: sig, pendingSince: now - 8 * DAY }, { type: "verify" });
  assert.equal(afterGrace.ok, true);
  assert.equal(afterGrace.state, "VERIFIED");
});

test("owner veto during PENDING cancels the handover", () => {
  const plan = basePlan({ state: "PENDING" });
  const r = transition({ plan, signals: signals() }, { type: "owner_veto" });
  assert.equal(r.ok, true);
  assert.equal(r.state, "CANCELLED");
});

test("inactivity trigger requires contact confirmation when configured", () => {
  const plan = basePlan({
    tiers: ["critical"],
    triggers: [{ kind: "inactivity", inactivityDays: 90, requireContactConfirmation: true }],
  });
  const now = 1_000_000_000_000 + 100 * DAY;
  assert.equal(triggersSatisfied(plan, signals({ now })), false); // idle enough, but no confirmation
  assert.equal(triggersSatisfied(plan, signals({ now, contactConfirmed: true })), true);
});

test("full happy path: configure → arm → trigger → verify → release → complete", () => {
  let plan = basePlan({ state: "DRAFT" });
  const now = 2_000_000_000_000;
  const sig = signals({ now, contributingHolders: ["a", "b"] });

  const step = (action: Parameters<typeof transition>[1], pendingSince?: number) => {
    const r = transition({ plan, signals: sig, pendingSince }, action);
    assert.ok(r.ok, `${action.type} should succeed: ${r.reason ?? ""}`);
    plan = { ...plan, state: r.state };
  };

  step({ type: "configure" });
  step({ type: "arm" });
  step({ type: "trigger" });
  step({ type: "verify" }, now - 8 * DAY);
  step({ type: "release" });
  step({ type: "confirm_receipt" });
  assert.equal(plan.state, "COMPLETED");
});

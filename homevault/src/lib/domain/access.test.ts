import { test } from "node:test";
import assert from "node:assert/strict";
import {
  can,
  canOpenVault,
  FAILSAFES,
  everydayFailsafes,
  handoverFailsafes,
  FAILSAFE_BY_KEY,
} from "./access";
import { MEMBER_ROLES, DEFAULT_INVITE_ROLE, ROLE_DESCRIPTION } from "./members";

/**
 * The governing rule these protect: owners can open their own vault, always,
 * without ceremony. The handover machinery is for when nobody who could grant
 * access is able to — and it must never leak into everyday use.
 */

test("every member can open the vault — membership is access", () => {
  for (const role of MEMBER_ROLES) {
    assert.equal(canOpenVault(role), true, `${role} cannot open the vault`);
  }
});

test("owners and co-owners are equal on reading and writing", () => {
  // A household is not an org chart. A partner who can read but not correct a
  // record would defeat the point of keeping it in one place.
  for (const capability of ["read", "write"] as const) {
    assert.equal(can("owner", capability), can("co_owner", capability), `differ on ${capability}`);
    assert.equal(can("owner", capability), true);
  }
});

test("they differ only where a mistake is hard to undo", () => {
  assert.equal(can("owner", "remove-member"), true);
  assert.equal(can("co_owner", "remove-member"), false);
});

test("viewer means read-only, and the label no longer lies", () => {
  // This role previously granted identical full write access while being named
  // "viewer" — and was the column default.
  assert.equal(can("viewer", "read"), true);
  for (const capability of ["write", "invite", "configure-handover", "remove-member"] as const) {
    assert.equal(can("viewer", capability), false, `viewer should not be able to ${capability}`);
  }
  assert.match(ROLE_DESCRIPTION.viewer, /read|cannot change/i);
});

test("an invited member defaults to full access, not to viewer", () => {
  // The everyday failsafe — "the other owner already has their own key" — only
  // works if an invited partner actually has full access.
  assert.equal(DEFAULT_INVITE_ROLE, "co_owner");
  assert.equal(can(DEFAULT_INVITE_ROLE, "write"), true);
});

// --- The failsafe ladder ----------------------------------------------------

test("the situations households actually hit need no ceremony at all", () => {
  const everyday = everydayFailsafes().map((f) => f.key);
  assert.ok(everyday.includes("co-owner"), "a partner being unavailable must need no process");
  assert.ok(everyday.includes("recovery-code"), "a forgotten passphrase must need no process");
});

test("the frictionless failsafes are the ones that already exist", () => {
  // The rare cases can wait; the common ones cannot.
  for (const failsafe of everydayFailsafes()) {
    assert.equal(failsafe.status, "built", `${failsafe.key} is the common case and is not built`);
  }
});

test("a co-owner being unavailable triggers nothing", () => {
  const coOwner = FAILSAFE_BY_KEY["co-owner"];
  assert.equal(coOwner.friction, "none");
  assert.match(coOwner.mechanism, /nothing is triggered|no process/i);
});

test("the full-ceremony failsafes are only for when nobody can grant access", () => {
  const handover = handoverFailsafes().map((f) => f.key);
  assert.deepEqual(handover.sort(), ["escrow", "inactivity", "legal-proof"]);
});

test("no failsafe describes a single party acting alone", () => {
  // Including us. "No single point of unilateral access" is the claim that
  // makes the handover trustworthy at all.
  for (const failsafe of handoverFailsafes()) {
    assert.ok(
      !/\bwe (can|will) (unlock|open|restore|recover)\b/i.test(failsafe.mechanism),
      `${failsafe.key} implies HomeVault can act alone`,
    );
  }
  assert.match(FAILSAFE_BY_KEY.escrow.mechanism, /never one person alone/i);
});

test("every failsafe states the situation in the household's terms", () => {
  for (const failsafe of FAILSAFES) {
    assert.ok(failsafe.situation.length > 10, `${failsafe.key} has no plain-language situation`);
    // Written from the household's side ("I've forgotten…"), not ours.
    assert.ok(
      /\b(i|we|my|our|us|nobody|something|there is|one of)\b/i.test(failsafe.situation),
      `${failsafe.key} reads like a spec, not a person: ${failsafe.situation}`,
    );
  }
});

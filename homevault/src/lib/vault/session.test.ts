import { test } from "node:test";
import assert from "node:assert/strict";
import { VaultSession } from "./session";
import { createVaultKeyEnvelope, defaultKdfParams, generateKdfSalt, type KdfParams } from "../crypto/keys";
import { seal, open } from "../crypto/envelope";
import { utf8ToBytes } from "../crypto/encoding";

/**
 * The session is the enforcement point for "keys exist only while unlocked"
 * (SECURITY.md § 1). These tests pin that behaviour, including the awkward
 * cases: a machine that slept, a failed unlock, and a caller that keeps a
 * reference around after locking.
 */

const PASSPHRASE = "correct horse battery staple";
const device = () => new Uint8Array(32).fill(7);

function fastParams(): KdfParams {
  return { ...defaultKdfParams(generateKdfSalt()), memoryKiB: 1024, iterations: 1, parallelism: 1 };
}

/** A session with a controllable clock and timer. */
function harness(idleLockMs = 1000) {
  let clock = 0;
  let scheduled: (() => void) | null = null;
  const session = new VaultSession({
    idleLockMs,
    now: () => clock,
    setTimer: (fn) => {
      scheduled = fn;
      return 1;
    },
    clearTimer: () => {
      scheduled = null;
    },
  });
  return {
    session,
    advance: (ms: number) => {
      clock += ms;
    },
    fireTimer: () => scheduled?.(),
    hasTimer: () => scheduled !== null,
  };
}

test("a new session starts locked and refuses to hand out a key", () => {
  const { session } = harness();
  assert.equal(session.getSnapshot().state, "locked");
  assert.equal(session.isUnlocked(), false);
  assert.throws(() => session.requireVaultKey(), /The vault is locked/);
});

test("unlock exposes a working vault key", async () => {
  const { session } = harness();
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());

  await session.unlock(envelope, PASSPHRASE, device());

  assert.equal(session.getSnapshot().state, "unlocked");
  const aad = utf8ToBytes("meta");
  const sealed = await seal({ ssn: "123-45-6789" }, session.requireVaultKey(), aad);
  assert.deepEqual(await open(sealed, session.requireVaultKey(), aad), { ssn: "123-45-6789" });
});

test("locking drops the key — a caller cannot keep using the session", async () => {
  const { session } = harness();
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  await session.unlock(envelope, PASSPHRASE, device());

  session.lock();

  assert.equal(session.isUnlocked(), false);
  assert.throws(() => session.requireVaultKey(), /The vault is locked/);
  assert.equal(session.getSnapshot().lastLockReason, "manual");
});

test("the device factor is zeroized after unlock, success or failure", async () => {
  const { session } = harness();
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());

  const good = device();
  await session.unlock(envelope, PASSPHRASE, good);
  assert.deepEqual(good, new Uint8Array(32), "factor should be wiped after a successful unlock");

  const bad = device();
  await session.unlock(envelope, "wrong", bad).catch(() => {});
  assert.deepEqual(bad, new Uint8Array(32), "factor should be wiped after a failed unlock too");
});

test("a failed unlock leaves the vault locked and records why", async () => {
  const { session } = harness();
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());

  await assert.rejects(() => session.unlock(envelope, "wrong passphrase", device()));

  const snap = session.getSnapshot();
  assert.equal(snap.state, "locked");
  assert.equal(snap.lastLockReason, "unlock-failed");
  assert.match(snap.error ?? "", /Unlock failed/);
  assert.throws(() => session.requireVaultKey(), /The vault is locked/);
});

test("the vault auto-locks once the idle window elapses", async () => {
  const h = harness(1000);
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  await h.session.unlock(envelope, PASSPHRASE, device());

  h.advance(1000);
  h.fireTimer();

  assert.equal(h.session.isUnlocked(), false);
  assert.equal(h.session.getSnapshot().lastLockReason, "idle");
});

test("activity within the window keeps the vault open", async () => {
  const h = harness(1000);
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  await h.session.unlock(envelope, PASSPHRASE, device());

  h.advance(600);
  h.session.touch(); // user did something
  h.advance(600); // 1200ms total, but only 600ms since activity
  h.fireTimer();

  assert.equal(h.session.isUnlocked(), true, "should not lock while the user is active");
});

test("a machine that slept past the timeout comes back locked", async () => {
  // The timer alone is not trustworthy across suspend, so lockIfIdle re-checks
  // the wall clock.
  const h = harness(1000);
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  await h.session.unlock(envelope, PASSPHRASE, device());

  h.advance(60 * 60 * 1000); // slept an hour
  h.session.lockIfIdle();

  assert.equal(h.session.isUnlocked(), false);
  assert.equal(h.session.getSnapshot().lastLockReason, "idle");
});

test("locking clears the pending idle timer", async () => {
  const h = harness(1000);
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  await h.session.unlock(envelope, PASSPHRASE, device());
  assert.equal(h.hasTimer(), true);

  h.session.lock();
  assert.equal(h.hasTimer(), false);
});

test("subscribers are notified on state changes and the snapshot is referentially stable", async () => {
  const h = harness();
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());

  let notifications = 0;
  const unsubscribe = h.session.subscribe(() => notifications++);

  const before = h.session.getSnapshot();
  assert.equal(h.session.getSnapshot(), before, "repeated reads must return the same object");

  await h.session.unlock(envelope, PASSPHRASE, device());
  assert.ok(notifications > 0);
  assert.notEqual(h.session.getSnapshot(), before, "snapshot should change after unlock");

  unsubscribe();
  const count = notifications;
  h.session.lock();
  assert.equal(notifications, count, "unsubscribed listeners stop receiving updates");
});

test("msUntilIdleLock reports zero when locked and counts down when unlocked", async () => {
  const h = harness(1000);
  assert.equal(h.session.msUntilIdleLock, 0);

  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  await h.session.unlock(envelope, PASSPHRASE, device());
  assert.equal(h.session.msUntilIdleLock, 1000);

  h.advance(400);
  assert.equal(h.session.msUntilIdleLock, 600);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVaultKeyEnvelope,
  openVaultKeyEnvelope,
  derivePassphraseKey,
  deriveKeyEncryptionKey,
  defaultKdfParams,
  generateKdfSalt,
  needsKdfUpgrade,
  rewrapVaultKey,
  zeroize,
  type KdfParams,
} from "./keys";
import { seal, open, exportVaultKey } from "./envelope";
import { base64ToBytes, utf8ToBytes } from "./encoding";

/**
 * These tests exist to pin the *security properties* of the key hierarchy
 * (docs/SECURITY.md § 2), not just that the happy path runs. Each one below
 * corresponds to a claim the security model makes to users.
 */

const PASSPHRASE = "correct horse battery staple";
const DEVICE = new Uint8Array(32).fill(7); // stand-in for a WebAuthn PRF output

/** Cheap KDF params — these tests exercise structure, not cost. */
function fastParams(salt = generateKdfSalt()): KdfParams {
  return { algorithm: "argon2id", memoryKiB: 1024, iterations: 1, parallelism: 1, salt: bytes64(salt) };
}
function bytes64(b: Uint8Array): string {
  return defaultKdfParams(b).salt;
}

test("round-trip: a vault created with both factors unlocks with both factors", async () => {
  const params = fastParams();
  const { envelope, vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, params);
  const reopened = await openVaultKeyEnvelope(envelope, PASSPHRASE, DEVICE);

  // Same key material, recovered from nothing but the stored envelope.
  assert.deepEqual(await exportVaultKey(reopened), await exportVaultKey(vaultKey));
});

test("the wrong passphrase cannot unwrap the vault key", async () => {
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  await assert.rejects(() => openVaultKeyEnvelope(envelope, "wrong passphrase", DEVICE), /Unlock failed/);
});

test("SECURITY.md § 5: a stolen passphrase alone is not enough — the device factor is required", async () => {
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  const attackerDevice = new Uint8Array(32).fill(9);
  await assert.rejects(() => openVaultKeyEnvelope(envelope, PASSPHRASE, attackerDevice), /Unlock failed/);
});

test("a stolen device factor alone is not enough — the passphrase is required", async () => {
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  await assert.rejects(() => openVaultKeyEnvelope(envelope, "", DEVICE), /Unlock failed/);
});

test("failure is indistinguishable — a bad passphrase and a bad device factor report the same error", async () => {
  // Never tell an attacker which of the two factors they got right.
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  const a = await openVaultKeyEnvelope(envelope, "nope", DEVICE).catch((e: Error) => e.message);
  const b = await openVaultKeyEnvelope(envelope, PASSPHRASE, new Uint8Array(32).fill(1)).catch((e: Error) => e.message);
  assert.equal(a, b);
});

test("an empty device factor is rejected rather than silently degrading to one factor", async () => {
  const pk = await derivePassphraseKey(PASSPHRASE, fastParams());
  await assert.rejects(
    () => deriveKeyEncryptionKey(pk, new Uint8Array(0), fastParams()),
    /Both a passphrase key and a device factor are required/,
  );
});

test("the envelope stored server-side contains no usable key material", async () => {
  const { envelope, vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  const raw = await exportVaultKey(vaultKey);
  const wrapped = base64ToBytes(envelope.wrappedVaultKey);

  // The wrapped blob must not simply contain the vault key.
  assert.ok(!containsSubsequence(wrapped, raw), "wrapped VK leaked the raw vault key");
  // AES-KW adds an 8-byte integrity check block to the 32-byte key.
  assert.equal(wrapped.length, 40);

  // And the envelope's non-secret half really is non-secret: only KDF params.
  assert.deepEqual(Object.keys(envelope).sort(), ["kdf", "wrappedVaultKey"]);
  assert.deepEqual(Object.keys(envelope.kdf).sort(), [
    "algorithm",
    "iterations",
    "memoryKiB",
    "parallelism",
    "salt",
  ]);
});

test("the same passphrase yields different envelopes for different households (salt is used)", async () => {
  const a = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  const b = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, fastParams());
  assert.notEqual(a.envelope.kdf.salt, b.envelope.kdf.salt);
  assert.notEqual(a.envelope.wrappedVaultKey, b.envelope.wrappedVaultKey);
});

test("PK is salt-dependent: the same passphrase under a different salt gives a different key", async () => {
  const one = await derivePassphraseKey(PASSPHRASE, fastParams());
  const two = await derivePassphraseKey(PASSPHRASE, fastParams());
  assert.notDeepEqual(one, two);
});

test("PK is deterministic for the same passphrase and salt", async () => {
  const params = fastParams();
  assert.deepEqual(await derivePassphraseKey(PASSPHRASE, params), await derivePassphraseKey(PASSPHRASE, params));
});

test("the recovered vault key actually decrypts records sealed by the original", async () => {
  // The point of the hierarchy: unlock must yield a VK that opens real data.
  const params = fastParams();
  const { envelope, vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, params);
  const aad = utf8ToBytes(JSON.stringify({ id: "r-1", label: "Primary checking" }));
  const sealed = await seal({ account: "1234-5678" }, vaultKey, aad);

  const reopened = await openVaultKeyEnvelope(envelope, PASSPHRASE, DEVICE);
  assert.deepEqual(await open(sealed, reopened, aad), { account: "1234-5678" });
});

test("changing the passphrase re-wraps VK without invalidating existing records", async () => {
  const params = fastParams();
  const { envelope, vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, params);
  const aad = utf8ToBytes("meta");
  const sealed = await seal({ secret: "unchanged" }, vaultKey, aad);

  const next = await rewrapVaultKey(vaultKey, "a brand new passphrase", DEVICE, fastParams());

  // Old passphrase no longer opens the vault...
  await assert.rejects(() => openVaultKeyEnvelope(next, PASSPHRASE, DEVICE), /Unlock failed/);
  // ...the new one does, and the record never had to be re-encrypted.
  const unlocked = await openVaultKeyEnvelope(next, "a brand new passphrase", DEVICE);
  assert.deepEqual(await open(sealed, unlocked, aad), { secret: "unchanged" });
  assert.notEqual(envelope.wrappedVaultKey, next.wrappedVaultKey);
});

test("needsKdfUpgrade flags vaults created under weaker cost than today's default", async () => {
  assert.equal(needsKdfUpgrade(fastParams()), true, "a cheap legacy vault should be flagged");
  assert.equal(needsKdfUpgrade(defaultKdfParams()), false, "a vault at current defaults should not be");
});

test("a vault created under old parameters still unlocks after the defaults are raised", async () => {
  // The migration property that storing KdfParams per household buys us.
  const legacy = fastParams();
  const { envelope } = await createVaultKeyEnvelope(PASSPHRASE, DEVICE, legacy);

  // Defaults have since moved on (fastParams is far below them)...
  assert.ok(needsKdfUpgrade(envelope.kdf));
  // ...and the vault still opens, because the envelope carries its own params.
  await assert.doesNotReject(() => openVaultKeyEnvelope(envelope, PASSPHRASE, DEVICE));
});

test("an unsupported KDF algorithm is rejected rather than silently mis-derived", async () => {
  const bad = { ...fastParams(), algorithm: "scrypt" } as unknown as KdfParams;
  await assert.rejects(() => derivePassphraseKey(PASSPHRASE, bad), /Unsupported KDF algorithm/);
});

test("zeroize overwrites key material in place", () => {
  const buf = new Uint8Array([1, 2, 3, 4]);
  zeroize(buf);
  assert.deepEqual(buf, new Uint8Array([0, 0, 0, 0]));
  // Tolerates null/undefined so callers can zeroize in a finally block.
  assert.doesNotThrow(() => zeroize(null, undefined));
});

/** Does `haystack` contain `needle` as a contiguous run? Used to assert no key leakage. */
function containsSubsequence(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

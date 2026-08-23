import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFactorFromDeviceKey, generateDeviceKey } from "./device-factor";
import { createVaultKeyEnvelope, openVaultKeyEnvelope, defaultKdfParams, generateKdfSalt, type KdfParams } from "./keys";

/**
 * The IndexedDB plumbing in device-factor.ts needs a browser, but the part that
 * actually matters for security — how a factor is derived from the device key —
 * is pure WebCrypto and testable here.
 */

function fastParams(): KdfParams {
  return { ...defaultKdfParams(generateKdfSalt()), memoryKiB: 1024, iterations: 1, parallelism: 1 };
}

test("the device key is non-extractable — its bytes cannot be read back out", async () => {
  const key = await generateDeviceKey();
  assert.equal(key.extractable, false);
  await assert.rejects(
    () => globalThis.crypto.subtle.exportKey("raw", key),
    "a non-extractable key must refuse export",
  );
});

test("the derived factor is deterministic — the same key and salt reopen the vault", async () => {
  const key = await generateDeviceKey();
  const salt = new Uint8Array(32).fill(3);
  assert.deepEqual(await deriveFactorFromDeviceKey(key, salt), await deriveFactorFromDeviceKey(key, salt));
});

test("different salts give different factors", async () => {
  const key = await generateDeviceKey();
  const a = await deriveFactorFromDeviceKey(key, new Uint8Array(32).fill(1));
  const b = await deriveFactorFromDeviceKey(key, new Uint8Array(32).fill(2));
  assert.notDeepEqual(a, b);
});

test("different devices give different factors for the same salt", async () => {
  const salt = new Uint8Array(32).fill(3);
  const a = await deriveFactorFromDeviceKey(await generateDeviceKey(), salt);
  const b = await deriveFactorFromDeviceKey(await generateDeviceKey(), salt);
  assert.notDeepEqual(a, b, "a second browser profile must not derive the first one's factor");
});

test("a device-key factor works end to end as the second factor", async () => {
  const key = await generateDeviceKey();
  const salt = new Uint8Array(32).fill(9);
  const factor = await deriveFactorFromDeviceKey(key, salt);

  const { envelope } = await createVaultKeyEnvelope("passphrase", factor, fastParams());
  // Re-derive it the way a later unlock would, rather than reusing the value.
  const again = await deriveFactorFromDeviceKey(key, salt);
  await assert.doesNotReject(() => openVaultKeyEnvelope(envelope, "passphrase", again));
});

test("a vault bound to one device cannot be opened with another device's factor", async () => {
  const salt = new Uint8Array(32).fill(9);
  const mine = await deriveFactorFromDeviceKey(await generateDeviceKey(), salt);
  const theirs = await deriveFactorFromDeviceKey(await generateDeviceKey(), salt);

  const { envelope } = await createVaultKeyEnvelope("passphrase", mine, fastParams());
  await assert.rejects(() => openVaultKeyEnvelope(envelope, "passphrase", theirs), /Unlock failed/);
});

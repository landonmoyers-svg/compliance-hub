import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRecoveryCode,
  recoverVaultKey,
  generateRecoveryCode,
  normalizeRecoveryCode,
  isWellFormedRecoveryCode,
} from "./recovery";
import { createVaultKeyEnvelope, openVaultKeyEnvelope, rewrapVaultKey, defaultKdfParams, generateKdfSalt, type KdfParams } from "./keys";
import { seal, open, exportVaultKey } from "./envelope";
import { utf8ToBytes, base64ToBytes } from "./encoding";

/**
 * Recovery is the difference between "I forgot my passphrase" being an
 * inconvenience and being permanent loss of the household's documents. These
 * tests cover the paths a real person actually takes, including typing the code
 * off paper imperfectly.
 */

const PASSPHRASE = "correct horse battery staple";
const device = () => new Uint8Array(32).fill(7);

function fastParams(): KdfParams {
  return { ...defaultKdfParams(generateKdfSalt()), memoryKiB: 1024, iterations: 1, parallelism: 1 };
}

test("a recovery code reopens the vault", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const { code, envelope } = await createRecoveryCode(vaultKey);

  const recovered = await recoverVaultKey(envelope, code);
  assert.deepEqual(await exportVaultKey(recovered), await exportVaultKey(vaultKey));
});

test("the recovered key decrypts records sealed before recovery", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const aad = utf8ToBytes("meta");
  const sealed = await seal({ ssn: "541-88-2270" }, vaultKey, aad);

  const { code, envelope } = await createRecoveryCode(vaultKey);
  const recovered = await recoverVaultKey(envelope, code);

  assert.deepEqual(await open(sealed, recovered, aad), { ssn: "541-88-2270" });
});

test("the full forgotten-passphrase journey: recover, then set a new passphrase", async () => {
  // This is the whole point — the user gets back in AND ends up with a vault
  // they can open normally again, without re-encrypting a single record.
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const aad = utf8ToBytes("meta");
  const sealed = await seal({ note: "still here" }, vaultKey, aad);
  const { code, envelope: recovery } = await createRecoveryCode(vaultKey);

  // ...time passes, the passphrase is forgotten...
  const recovered = await recoverVaultKey(recovery, code);
  const reset = await rewrapVaultKey(recovered, "a new passphrase", device(), fastParams());

  const unlocked = await openVaultKeyEnvelope(reset, "a new passphrase", device());
  assert.deepEqual(await open(sealed, unlocked, aad), { note: "still here" });
});

test("a wrong recovery code does not open the vault", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const { envelope } = await createRecoveryCode(vaultKey);
  const someoneElses = generateRecoveryCode();

  await assert.rejects(() => recoverVaultKey(envelope, someoneElses), /did not open this vault/);
});

test("a code from a different vault does not open this one", async () => {
  const a = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const b = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const { code: codeForB } = await createRecoveryCode(b.vaultKey);
  const { envelope: envelopeForA } = await createRecoveryCode(a.vaultKey);

  await assert.rejects(() => recoverVaultKey(envelopeForA, codeForB), /did not open this vault/);
});

test("the code is accepted however a human retypes it from paper", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const { code, envelope } = await createRecoveryCode(vaultKey);

  const variants = [
    code.toLowerCase(),
    code.replace(/-/g, ""), // dashes left out
    code.replace(/-/g, " "), // spaces instead
    ` ${code} `, // stray whitespace
  ];
  for (const v of variants) {
    await assert.doesNotReject(() => recoverVaultKey(envelope, v), `should accept "${v}"`);
  }
});

test("visually ambiguous characters are folded, so O/0 and I/1 confusion is survivable", () => {
  // The alphabet excludes O, I, L and U precisely so these can be folded safely.
  assert.equal(normalizeRecoveryCode("O0I1L"), "00111");
  assert.equal(normalizeRecoveryCode("h7qk2-9wmxr"), "H7QK29WMXR");
});

test("generated codes are well formed, unique, and carry real entropy", () => {
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateRecoveryCode();
    assert.ok(isWellFormedRecoveryCode(code), `malformed code: ${code}`);
    assert.match(code, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}-[0-9A-Z]$/, `bad grouping: ${code}`);
    codes.add(code);
  }
  assert.equal(codes.size, 200, "generated codes must not repeat");
});

test("a truncated or malformed code is rejected before any crypto runs", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const { code, envelope } = await createRecoveryCode(vaultKey);

  await assert.rejects(() => recoverVaultKey(envelope, code.slice(0, 10)), /doesn't look like a recovery code/);
  await assert.rejects(() => recoverVaultKey(envelope, ""), /doesn't look like a recovery code/);
});

test("the stored envelope leaks neither the code nor the vault key", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const { code, envelope } = await createRecoveryCode(vaultKey);

  const serialized = JSON.stringify(envelope);
  assert.ok(!serialized.includes(code), "the recovery code must never be stored");
  assert.ok(!serialized.includes(normalizeRecoveryCode(code)), "normalized code must not appear either");

  const raw = await exportVaultKey(vaultKey);
  const wrapped = base64ToBytes(envelope.wrappedVaultKey);
  assert.ok(!contains(wrapped, raw), "wrapped key leaked the vault key");
  assert.equal(wrapped.length, 40); // 32-byte key + AES-KW integrity block
});

test("each issued code is independent — reissuing does not invalidate the vault", async () => {
  const { vaultKey } = await createVaultKeyEnvelope(PASSPHRASE, device(), fastParams());
  const first = await createRecoveryCode(vaultKey);
  const second = await createRecoveryCode(vaultKey);

  assert.notEqual(first.code, second.code);
  // Both envelopes still open the same vault; replacing a lost code is a matter
  // of storing the new envelope and discarding the old one.
  await assert.doesNotReject(() => recoverVaultKey(first.envelope, first.code));
  await assert.doesNotReject(() => recoverVaultKey(second.envelope, second.code));
});

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

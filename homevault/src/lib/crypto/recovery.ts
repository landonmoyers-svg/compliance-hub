import { CRYPTO_PARAMS } from "./params";
import { base64ToBytes, bytesToBase64, utf8ToBytes } from "./encoding";
import { zeroize } from "./keys";

/**
 * Recovery codes — the answer to "what happens if I forget my passphrase or
 * clear this browser?".
 *
 * docs/SECURITY.md § 7 is emphatic that recovery must not become a backdoor:
 * there is no "email us to reset", because that would reintroduce exactly the
 * single point of unilateral access the whole design avoids. A recovery code
 * keeps that property — it is a **second wrapped copy of the vault key**, held
 * by the owner on paper. HomeVault never sees it and cannot regenerate it.
 *
 * The long-term recovery story is the escrow/handover machinery (Phase 2). This
 * is the honest interim: without it, a forgotten passphrase means the vault is
 * gone forever, which for a household's real documents is a worse outcome than
 * the breach the encryption defends against.
 *
 * ## Why this KDF is cheap when the passphrase KDF is expensive
 *
 * Argon2id exists to make *guessing* infeasible, and only human-chosen
 * passphrases are guessable. A recovery code is 128 bits of machine randomness;
 * brute force is already out of reach, so stretching it buys nothing and only
 * makes recovery slower. HKDF-SHA-256 is the right tool for high-entropy input.
 */

/**
 * Crockford-style base32, minus I/L/O/U — so a code read off paper can't be
 * ruined by confusing 1/I/L, 0/O, or an accidental profanity.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_CHARS = 26; // 26 × 5 bits = 130 bits of entropy
const GROUP = 5;
const RECOVERY_INFO = "homevault:recovery-kek:v1";

/** What the server stores so a recovery code can reopen the vault. */
export interface RecoveryEnvelope {
  /** base64 — AES-KW(recovery key, VK). */
  wrappedVaultKey: string;
  /** base64 — salt for the recovery KDF. Not a secret. */
  salt: string;
  /** When this code was issued, so the UI can nudge about stale codes. */
  createdAt: string;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto is unavailable in this environment.");
  return c.subtle;
}

/**
 * A fresh recovery code, formatted for printing:
 *   `H7QK2-9WMXR-4TBND-P3FGZ-6VJC8-YS`
 *
 * Generated with rejection sampling rather than `% 32` so every character is
 * uniformly distributed — a modulo bias would quietly cost entropy.
 */
export function generateRecoveryCode(): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < CODE_CHARS) {
    globalThis.crypto.getRandomValues(buf);
    // 256 is not a multiple of 32... it is (8×32), so no bias here, but keep the
    // guard explicit in case the alphabet size ever changes.
    const limit = 256 - (256 % ALPHABET.length);
    if (buf[0] >= limit) continue;
    out.push(ALPHABET[buf[0] % ALPHABET.length]);
  }
  return out.join("").replace(new RegExp(`(.{${GROUP}})(?=.)`, "g"), "$1-");
}

/**
 * Accept a code however the user typed it: lower case, missing dashes, spaces,
 * or the O/0 and I/1 substitutions people make when reading their own writing.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

export function isWellFormedRecoveryCode(input: string): boolean {
  const norm = normalizeRecoveryCode(input);
  return norm.length === CODE_CHARS && [...norm].every((c) => ALPHABET.includes(c));
}

/** Derive the key-wrapping key from a recovery code. See the note above on HKDF. */
async function deriveRecoveryKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const s = subtle();
  const ikm = utf8ToBytes(normalizeRecoveryCode(code));
  try {
    const hkdf = await s.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveKey"]);
    return await s.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: utf8ToBytes(RECOVERY_INFO) as BufferSource },
      hkdf,
      { name: CRYPTO_PARAMS.wrap.name, length: CRYPTO_PARAMS.wrap.length },
      false,
      ["wrapKey", "unwrapKey"],
    );
  } finally {
    zeroize(ikm);
  }
}

/**
 * Issue a recovery code for an unlocked vault.
 *
 * Returns the code **once**. It is never stored — only the wrapped key is — so
 * neither HomeVault nor a database dump can recover the vault without the paper.
 * The caller must show it to the user and then forget it.
 */
export async function createRecoveryCode(
  vaultKey: CryptoKey,
  now: () => Date = () => new Date(),
): Promise<{ code: string; envelope: RecoveryEnvelope }> {
  const code = generateRecoveryCode();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(CRYPTO_PARAMS.kdf.saltBytes));
  const kek = await deriveRecoveryKey(code, salt);
  const wrapped = new Uint8Array(await subtle().wrapKey("raw", vaultKey, kek, { name: CRYPTO_PARAMS.wrap.name }));

  return {
    code,
    envelope: {
      wrappedVaultKey: bytesToBase64(wrapped),
      salt: bytesToBase64(salt),
      createdAt: now().toISOString(),
    },
  };
}

/** Recover the vault key from a printed code. Throws on a wrong or corrupted code. */
export async function recoverVaultKey(envelope: RecoveryEnvelope, code: string): Promise<CryptoKey> {
  if (!isWellFormedRecoveryCode(code)) {
    throw new Error("That doesn't look like a recovery code — check for missing characters.");
  }
  try {
    const kek = await deriveRecoveryKey(code, base64ToBytes(envelope.salt));
    return await subtle().unwrapKey(
      "raw",
      base64ToBytes(envelope.wrappedVaultKey) as BufferSource,
      kek,
      { name: CRYPTO_PARAMS.wrap.name },
      { name: CRYPTO_PARAMS.wrap.name, length: CRYPTO_PARAMS.wrap.length },
      true, // extractable: recovery exists so the key can be re-wrapped under new factors
      ["wrapKey", "unwrapKey"],
    );
  } catch (err) {
    throw new Error("That recovery code did not open this vault.", { cause: err });
  }
}

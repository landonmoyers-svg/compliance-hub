import { argon2id } from "hash-wasm";
import { CRYPTO_PARAMS } from "./params";
import { base64ToBytes, bytesToBase64, utf8ToBytes } from "./encoding";

/**
 * The key hierarchy — docs/SECURITY.md § 2.
 *
 *   Passphrase ──Argon2id──► Passphrase Key (PK) ─┐
 *                                                 ├─► KEK ──unwrap──► Vault Key (VK)
 *   WebAuthn PRF / device secret ─────────────────┘
 *
 * Two properties this module exists to guarantee:
 *
 *  1. **Both factors are required.** The key-encryption key (KEK) that unwraps
 *     VK is derived from PK *and* the device factor together. A stolen
 *     passphrase alone cannot unwrap VK; neither can a stolen device.
 *  2. **VK never leaves the client unwrapped.** The server only ever sees the
 *     `VaultKeyEnvelope` below: a wrapped VK plus non-secret KDF parameters.
 *
 * Combining PK and the device factor: SECURITY.md § 2 draws this as `PK ⊕ PRF`.
 * We use **HKDF-SHA-256 over `PK ‖ PRF`** instead of a raw XOR. It provides the
 * same "both factors required" property and is strictly more robust:
 *   • XOR requires both inputs to be exactly the same length; HKDF does not, so
 *     a device factor that isn't 32 bytes still works.
 *   • XOR is malleable — an attacker who learns PK and can influence the PRF
 *     output gains bit-for-bit control of the KEK. HKDF's extract step removes
 *     that structure.
 *   • HKDF gives domain separation via `info`, so this KEK can never collide
 *     with another key derived from the same material.
 * This deviation is deliberate and flagged for the Phase-1 cryptographic review.
 */

/**
 * Non-secret KDF parameters, stored server-side next to the wrapped VK.
 *
 * These are stored **per household rather than read from a constant** so the
 * cost can be raised later without locking anyone out: an existing vault keeps
 * unwrapping with the parameters it was created under, and is re-wrapped at the
 * next unlock. Hard-coding the cost would make it un-migratable.
 */
export interface KdfParams {
  algorithm: "argon2id";
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  /** base64. A salt is not a secret (SECURITY.md § 3). */
  salt: string;
}

/** What the server stores so an owner can unlock: opaque wrapped VK + how to redo the KDF. */
export interface VaultKeyEnvelope {
  /** base64 — AES-KW(KEK, VK). Useless without both client-side factors. */
  wrappedVaultKey: string;
  kdf: KdfParams;
}

/** The device-held second factor: WebAuthn PRF output, or a platform-protected device key. */
export type DeviceFactor = Uint8Array;

const KEK_INFO = "homevault:kek:v1";
const VK_BYTES = 32;

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto is unavailable in this environment.");
  return c.subtle;
}

/** Fresh random salt for a new household's passphrase KDF. */
export function generateKdfSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(CRYPTO_PARAMS.kdf.saltBytes));
}

/** The current tuned defaults for a *new* vault. Existing vaults use their stored params. */
export function defaultKdfParams(salt: Uint8Array = generateKdfSalt()): KdfParams {
  return {
    algorithm: "argon2id",
    memoryKiB: CRYPTO_PARAMS.kdf.argon2id.memoryKiB,
    iterations: CRYPTO_PARAMS.kdf.argon2id.iterations,
    parallelism: CRYPTO_PARAMS.kdf.argon2id.parallelism,
    salt: bytesToBase64(salt),
  };
}

/**
 * Best-effort zeroization of key material. JavaScript cannot guarantee a value
 * is gone (the GC may have copied it), but overwriting the buffer we control
 * shortens the window and is what SECURITY.md § 1 asks for on lock/close.
 */
export function zeroize(...buffers: Array<Uint8Array | undefined | null>): void {
  for (const b of buffers) if (b) b.fill(0);
}

/**
 * Stretch the passphrase into the Passphrase Key (PK) with Argon2id.
 * Runs in the client only — the passphrase never crosses the network.
 */
export async function derivePassphraseKey(passphrase: string, params: KdfParams): Promise<Uint8Array> {
  if (params.algorithm !== "argon2id") {
    throw new Error(`Unsupported KDF algorithm "${params.algorithm}".`);
  }
  const hash = await argon2id({
    password: passphrase,
    salt: base64ToBytes(params.salt),
    memorySize: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(hash);
}

/**
 * Derive the key-encryption key from BOTH factors. See the module note above on
 * why this is HKDF over the concatenation rather than a raw XOR.
 *
 * The returned CryptoKey is non-extractable: it can wrap and unwrap VK, but the
 * KEK bytes themselves cannot be read back out of WebCrypto.
 */
export async function deriveKeyEncryptionKey(
  passphraseKey: Uint8Array,
  deviceFactor: DeviceFactor,
  params: KdfParams,
): Promise<CryptoKey> {
  if (passphraseKey.length === 0 || deviceFactor.length === 0) {
    // Guard against a caller silently passing an empty factor, which would
    // reduce a two-factor KEK to a one-factor one.
    throw new Error("Both a passphrase key and a device factor are required to derive the KEK.");
  }

  const s = subtle();
  const ikm = new Uint8Array(passphraseKey.length + deviceFactor.length);
  ikm.set(passphraseKey, 0);
  ikm.set(deviceFactor, passphraseKey.length);

  try {
    const hkdfKey = await s.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveKey"]);
    return await s.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        // Reusing the household's KDF salt binds the KEK to this vault.
        salt: base64ToBytes(params.salt) as BufferSource,
        info: utf8ToBytes(KEK_INFO) as BufferSource,
      },
      hkdfKey,
      { name: CRYPTO_PARAMS.wrap.name, length: CRYPTO_PARAMS.wrap.length },
      false, // non-extractable: the KEK can wrap/unwrap but never be exported
      ["wrapKey", "unwrapKey"],
    );
  } finally {
    zeroize(ikm);
  }
}

/**
 * Create a brand-new household vault: generate VK, wrap it under both factors,
 * and return the envelope the server stores plus the live VK for this session.
 */
export async function createVaultKeyEnvelope(
  passphrase: string,
  deviceFactor: DeviceFactor,
  params: KdfParams = defaultKdfParams(),
): Promise<{ envelope: VaultKeyEnvelope; vaultKey: CryptoKey }> {
  const s = subtle();
  const vaultKey = await s.generateKey(
    { name: CRYPTO_PARAMS.wrap.name, length: CRYPTO_PARAMS.wrap.length },
    true, // extractable so it can be wrapped, and split into escrow shares
    ["wrapKey", "unwrapKey"],
  );

  const wrappedVaultKey = await wrapVaultKey(vaultKey, passphrase, deviceFactor, params);
  return { envelope: { wrappedVaultKey, kdf: params }, vaultKey };
}

/** Wrap an existing VK under the two factors (used on create, re-wrap, and passphrase change). */
export async function wrapVaultKey(
  vaultKey: CryptoKey,
  passphrase: string,
  deviceFactor: DeviceFactor,
  params: KdfParams,
): Promise<string> {
  let pk: Uint8Array | null = null;
  try {
    pk = await derivePassphraseKey(passphrase, params);
    const kek = await deriveKeyEncryptionKey(pk, deviceFactor, params);
    const wrapped = new Uint8Array(
      await subtle().wrapKey("raw", vaultKey, kek, { name: CRYPTO_PARAMS.wrap.name }),
    );
    return bytesToBase64(wrapped);
  } finally {
    zeroize(pk);
  }
}

/**
 * Unlock: recover VK from the stored envelope. Throws if either factor is wrong
 * — AES-KW is authenticated, so a bad KEK fails the unwrap rather than yielding
 * a garbage key.
 */
export async function openVaultKeyEnvelope(
  envelope: VaultKeyEnvelope,
  passphrase: string,
  deviceFactor: DeviceFactor,
): Promise<CryptoKey> {
  let pk: Uint8Array | null = null;
  try {
    pk = await derivePassphraseKey(passphrase, envelope.kdf);
    const kek = await deriveKeyEncryptionKey(pk, deviceFactor, envelope.kdf);
    return await subtle().unwrapKey(
      "raw",
      base64ToBytes(envelope.wrappedVaultKey) as BufferSource,
      kek,
      { name: CRYPTO_PARAMS.wrap.name },
      { name: CRYPTO_PARAMS.wrap.name, length: CRYPTO_PARAMS.wrap.length },
      true, // extractable: VK must be splittable into escrow shares for handover
      ["wrapKey", "unwrapKey"],
    );
  } catch (err) {
    // Deliberately uniform: never reveal *which* factor was wrong.
    throw new Error("Unlock failed: incorrect passphrase or device factor.", { cause: err });
  } finally {
    zeroize(pk);
  }
}

/**
 * Whether a vault's stored KDF cost is weaker than today's defaults — i.e. it
 * should be re-wrapped at the next successful unlock. This is the migration
 * path that storing params per-household buys us.
 */
export function needsKdfUpgrade(params: KdfParams): boolean {
  const target = CRYPTO_PARAMS.kdf.argon2id;
  return (
    params.memoryKiB < target.memoryKiB ||
    params.iterations < target.iterations ||
    params.parallelism < target.parallelism
  );
}

/** Change the passphrase without touching any record: re-wrap VK only. */
export async function rewrapVaultKey(
  vaultKey: CryptoKey,
  nextPassphrase: string,
  deviceFactor: DeviceFactor,
  params: KdfParams = defaultKdfParams(),
): Promise<VaultKeyEnvelope> {
  const wrappedVaultKey = await wrapVaultKey(vaultKey, nextPassphrase, deviceFactor, params);
  return { wrappedVaultKey, kdf: params };
}

export const VAULT_KEY_BYTES = VK_BYTES;

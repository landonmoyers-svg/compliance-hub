import { base64ToBytes } from "./encoding";
import type { DeviceFactor } from "./keys";
import { getDeviceFactor as getPrfFactor, isWebAuthnAvailable, type PasskeyBinding } from "./webauthn";

/**
 * Where the *device* half of the key hierarchy comes from (docs/SECURITY.md § 2:
 * "the WebAuthn PRF extension output, or — where PRF is unavailable — a
 * device-stored key protected by the platform authenticator").
 *
 * The two sources are NOT equally strong, and the app must never pretend they
 * are:
 *
 *   • `passkey-prf` (preferred) — the secret is computed inside the
 *     authenticator from a key that never leaves the hardware. Malware running
 *     in the page can obtain a PRF value only while the user is present and
 *     verifying; it can never steal the underlying key.
 *
 *   • `device-key` (fallback) — a key held by the browser for this origin. It is
 *     bound to this browser profile, not to hardware, and does not survive a
 *     cleared site-data. It is meaningfully weaker and is offered only so a
 *     household on a PRF-less authenticator is not locked out entirely.
 *
 * To keep the fallback as strong as the platform allows, the device key is a
 * **non-extractable HMAC key**: the factor is produced by *signing* a stable
 * salt with it, so the raw key bytes cannot be read out of the browser even by
 * script running on this origin. Storing raw random bytes would have been
 * simpler and strictly worse.
 */

export type DeviceFactorSource = "passkey-prf" | "device-key";

export interface DeviceFactorResult {
  factor: DeviceFactor;
  source: DeviceFactorSource;
}

const DB_NAME = "homevault";
const DB_VERSION = 1;
const STORE = "device-keys";
/** One device key per household, so clearing one vault doesn't affect another. */
const keyRecordId = (householdId: string) => `device-key:${householdId}`;

function idb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable, so a device key cannot be stored.");
  }
  return indexedDB;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb().open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB."));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

/**
 * Derive the device factor from a device key. Exported separately from the
 * IndexedDB plumbing so the derivation itself is unit-testable.
 *
 * HMAC-SHA-256 over the household's stable salt: deterministic (the same key +
 * salt always yields the same factor, which is what makes the vault reopenable)
 * and one-way (the factor reveals nothing about the key).
 */
export async function deriveFactorFromDeviceKey(deviceKey: CryptoKey, salt: Uint8Array): Promise<DeviceFactor> {
  const sig = await globalThis.crypto.subtle.sign("HMAC", deviceKey, salt as BufferSource);
  return new Uint8Array(sig);
}

/** Create a fresh, non-extractable device key. `extractable: false` is the point. */
export async function generateDeviceKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false, // non-extractable — the raw key can never be read back out
    ["sign"],
  );
}

/** Fetch this household's device key, creating and persisting one on first use. */
export async function getOrCreateDeviceKey(householdId: string): Promise<CryptoKey> {
  const db = await openDb();
  try {
    const existing = await tx<CryptoKey | undefined>(db, "readonly", (s) => s.get(keyRecordId(householdId)));
    if (existing) return existing;

    const created = await generateDeviceKey();
    // Structured clone stores the CryptoKey handle itself; the key material
    // stays inside the browser's crypto implementation.
    await tx(db, "readwrite", (s) => s.put(created, keyRecordId(householdId)));
    return created;
  } finally {
    db.close();
  }
}

/** True once this browser profile holds a device key for the household. */
export async function hasDeviceKey(householdId: string): Promise<boolean> {
  const db = await openDb();
  try {
    return (await tx<CryptoKey | undefined>(db, "readonly", (s) => s.get(keyRecordId(householdId)))) !== undefined;
  } finally {
    db.close();
  }
}

/** Forget the device key — used when the household unenrolls this browser. */
export async function forgetDeviceKey(householdId: string): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, "readwrite", (s) => s.delete(keyRecordId(householdId)));
  } finally {
    db.close();
  }
}

/**
 * How the vault should obtain its device factor. Stored per household (non-secret)
 * so unlock knows which path to take without guessing.
 */
export interface DeviceBinding {
  source: DeviceFactorSource;
  /** Present when `source === "passkey-prf"`. */
  passkey?: PasskeyBinding;
  /** base64 — the stable salt. The PRF salt, or the HMAC input for a device key. */
  salt: string;
  householdId: string;
}

/**
 * Resolve the device factor for an unlock. Deliberately does NOT silently fall
 * back from passkey to device key: a vault enrolled against hardware must keep
 * requiring hardware, or an attacker could downgrade it to the weaker factor.
 */
export async function resolveDeviceFactor(
  binding: DeviceBinding,
  opts: { rpId: string; challenge: Uint8Array },
): Promise<DeviceFactorResult> {
  if (binding.source === "passkey-prf") {
    if (!binding.passkey) throw new Error("Vault is bound to a passkey but no credential is recorded.");
    if (!isWebAuthnAvailable()) {
      throw new Error("This vault requires a passkey, which this browser does not support.");
    }
    const factor = await getPrfFactor({
      challenge: opts.challenge,
      rpId: opts.rpId,
      binding: binding.passkey,
    });
    return { factor, source: "passkey-prf" };
  }

  const deviceKey = await getOrCreateDeviceKey(binding.householdId);
  const factor = await deriveFactorFromDeviceKey(deviceKey, base64ToBytes(binding.salt));
  return { factor, source: "device-key" };
}

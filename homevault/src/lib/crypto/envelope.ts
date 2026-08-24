import { CRYPTO_PARAMS } from "./params";
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "./encoding";

/**
 * Envelope encryption — the zero-knowledge core. Every record gets a fresh
 * random data key (DK); the payload is AES-256-GCM(DK, plaintext); the DK is
 * wrapped under the household vault key (VK) with AES-KW. The server only ever
 * receives the three opaque outputs below. See docs/SECURITY.md § 2.
 *
 * Uses WebCrypto (crypto.subtle) exclusively — available in the browser and in
 * modern Node's `globalThis.crypto`. No key material is logged or persisted here.
 */

export interface SealedBytes {
  ciphertext: string; // base64 — AES-GCM(DK, payload)
  iv: string; // base64 — 12-byte GCM nonce
  wrappedDataKey: string; // base64 — AES-KW(VK, DK)
}

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto is unavailable in this environment.");
  return c.subtle;
};

/** Generate a household Vault Key (VK). In production VK is created once and only ever stored wrapped. */
export async function generateVaultKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: CRYPTO_PARAMS.wrap.name, length: CRYPTO_PARAMS.wrap.length }, true, [
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Import a raw 32-byte VK (e.g. reconstructed from Shamir shares during handover). */
export async function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", raw as BufferSource, { name: CRYPTO_PARAMS.wrap.name }, true, [
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Export a VK to raw bytes (only done client-side, e.g. to split into Shamir shares). */
export async function exportVaultKey(vk: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle().exportKey("raw", vk));
}

/**
 * Seal raw bytes — a scanned document, a photo, a PDF.
 *
 * Returns the ciphertext separately from the key material, because an
 * attachment's bytes are far too large to sit inside a record row: the blob goes
 * to storage, and only `iv` + `wrappedDataKey` travel with the record. The blob
 * store therefore holds something it cannot read and cannot identify.
 *
 * Each attachment gets its own data key, so one document can later be handed to
 * a recipient without surrendering the rest of the record.
 */
export async function sealBytes(
  bytes: Uint8Array,
  vk: CryptoKey,
  aad: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: string; wrappedDataKey: string }> {
  const s = subtle();
  const dk = await s.generateKey({ name: CRYPTO_PARAMS.content.name, length: CRYPTO_PARAMS.content.length }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(CRYPTO_PARAMS.content.ivBytes));
  const ct = new Uint8Array(
    await s.encrypt({ name: CRYPTO_PARAMS.content.name, iv, additionalData: aad as BufferSource }, dk, bytes as BufferSource),
  );
  const wrapped = new Uint8Array(await s.wrapKey("raw", dk, vk, { name: CRYPTO_PARAMS.wrap.name }));
  return { ciphertext: ct, iv: bytesToBase64(iv), wrappedDataKey: bytesToBase64(wrapped) };
}

/**
 * Open sealed bytes. Throws if the ciphertext was altered, if the wrong vault
 * key is supplied, or if the AAD doesn't match — which is what stops a blob
 * being swapped between records.
 */
export async function openBytes(
  ciphertext: Uint8Array,
  keys: { iv: string; wrappedDataKey: string },
  vk: CryptoKey,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const s = subtle();
  const dk = await s.unwrapKey(
    "raw",
    base64ToBytes(keys.wrappedDataKey) as BufferSource,
    vk,
    { name: CRYPTO_PARAMS.wrap.name },
    { name: CRYPTO_PARAMS.content.name },
    false,
    ["decrypt"],
  );
  const pt = await s.decrypt(
    { name: CRYPTO_PARAMS.content.name, iv: base64ToBytes(keys.iv) as BufferSource, additionalData: aad as BufferSource },
    dk,
    ciphertext as BufferSource,
  );
  return new Uint8Array(pt);
}

/**
 * Seal a payload object. `aad` (additional-authenticated-data) binds non-secret
 * metadata into the GCM tag so the server can't move a ciphertext under a
 * different label/category without the decrypt failing. Pass the serialized meta.
 */
export async function seal(payload: unknown, vk: CryptoKey, aad: Uint8Array): Promise<SealedBytes> {
  const s = subtle();
  const dk = await s.generateKey({ name: CRYPTO_PARAMS.content.name, length: CRYPTO_PARAMS.content.length }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(CRYPTO_PARAMS.content.ivBytes));
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  const ct = new Uint8Array(
    await s.encrypt({ name: CRYPTO_PARAMS.content.name, iv, additionalData: aad as BufferSource }, dk, plaintext as BufferSource),
  );
  const wrapped = new Uint8Array(await s.wrapKey("raw", dk, vk, { name: CRYPTO_PARAMS.wrap.name }));
  return { ciphertext: bytesToBase64(ct), iv: bytesToBase64(iv), wrappedDataKey: bytesToBase64(wrapped) };
}

/** Open a sealed payload. Throws if the AAD (metadata) doesn't match what was sealed, or VK is wrong. */
export async function open<T = unknown>(sealed: SealedBytes, vk: CryptoKey, aad: Uint8Array): Promise<T> {
  const s = subtle();
  const dk = await s.unwrapKey(
    "raw",
    base64ToBytes(sealed.wrappedDataKey) as BufferSource,
    vk,
    { name: CRYPTO_PARAMS.wrap.name },
    { name: CRYPTO_PARAMS.content.name },
    false,
    ["decrypt"],
  );
  const pt = await s.decrypt(
    { name: CRYPTO_PARAMS.content.name, iv: base64ToBytes(sealed.iv) as BufferSource, additionalData: aad as BufferSource },
    dk,
    base64ToBytes(sealed.ciphertext) as BufferSource,
  );
  return JSON.parse(bytesToUtf8(new Uint8Array(pt))) as T;
}

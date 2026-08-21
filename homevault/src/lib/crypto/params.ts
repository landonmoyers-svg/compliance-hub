/**
 * Cryptographic parameters, centralized so a review can audit them in one place
 * and so Phase-1 tuning (Argon2id cost) is a single edit. See docs/SECURITY.md.
 */
export const CRYPTO_PARAMS = {
  /** Payload/content encryption. */
  content: { name: "AES-GCM", length: 256 as const, ivBytes: 12 },
  /** Key wrapping (data key under vault key, vault key under passphrase key). */
  wrap: { name: "AES-KW" as const, length: 256 as const },
  /**
   * Passphrase stretching. Argon2id is the target (memory-hard). The scaffold
   * falls back to PBKDF2-SHA256 where an Argon2 WASM module isn't wired yet;
   * these iteration counts are a floor, not the Phase-1 production values.
   */
  kdf: {
    argon2id: { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 },
    pbkdf2Fallback: { hash: "SHA-256" as const, iterations: 600_000 },
    saltBytes: 16,
  },
} as const;

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
   * Passphrase stretching (Argon2id — memory-hard, via WASM in `crypto/keys.ts`).
   *
   * Tuned for Phase 1. Measured on an M-series Mac in Node at 32-byte output:
   *    64 MiB  t=3 → ~130 ms      256 MiB t=3 → ~510 ms
   *   128 MiB  t=3 → ~260 ms      512 MiB t=3 → ~1000 ms
   *
   * 128 MiB / t=3 / p=1 is chosen as the operating point: double the memory
   * hardness of the previous floor and well above the OWASP Argon2id minimum,
   * while still allocatable inside a mobile browser — 256 MiB+ risks allocation
   * failures on iOS Safari, which would lock a user out of their own vault on
   * their phone. Unlock is infrequent, so a few hundred ms is acceptable UX.
   *
   * IMPORTANT: these are the defaults for a *new* vault only. Each household
   * stores the parameters it was created under alongside its salt (see
   * `KdfParams` in crypto/keys.ts), so raising the cost here does not lock out
   * existing vaults — they unwrap with their stored values and are re-wrapped at
   * the next unlock (`needsKdfUpgrade`).
   */
  kdf: {
    argon2id: { memoryKiB: 128 * 1024, iterations: 3, parallelism: 1 },
    pbkdf2Fallback: { hash: "SHA-256" as const, iterations: 600_000 },
    saltBytes: 16,
  },
} as const;

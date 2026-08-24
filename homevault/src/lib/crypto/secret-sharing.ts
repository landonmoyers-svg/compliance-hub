/**
 * Shamir's Secret Sharing over GF(2^8) — the cryptographic foundation of estate
 * handover. The household Vault Key is split into `n` shares with threshold `t`
 * so that no single party (including HomeVault) can reconstruct it, and the
 * handover release conditions are exactly the conditions under which `t` shares
 * become available. See docs/HANDOVER.md § 0.
 *
 * GF(256) with the AES reduction polynomial 0x11b. Splitting is byte-wise: each
 * byte of the secret is the constant term of an independent random polynomial.
 *
 * NOTE: this is a clean reference implementation for the scaffold. A production
 * build should use a reviewed, constant-time library and add a per-share MAC to
 * detect corrupted/adversarial shares before reconstruction (Phase 1).
 */

// --- GF(256) log/exp tables (generator g = 3) ---
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // multiply by generator 3: x = x ^ (x << 1), reduce mod 0x11b
    const hi = x & 0x80;
    x = (x << 1) & 0xff;
    if (hi) x ^= 0x1b;
    x ^= EXP[i]; // x = x*2 ^ x = x*3
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function gdiv(a: number, b: number): number {
  if (b === 0) throw new Error("GF division by zero");
  if (a === 0) return 0;
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

/** Evaluate polynomial `coeffs` (constant term first) at `x` in GF(256). */
function evalPoly(coeffs: Uint8Array, x: number): number {
  let result = 0;
  // Horner's method, high degree → low.
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gmul(result, x) ^ coeffs[i];
  }
  return result;
}

export interface Share {
  /** Evaluation point (1..255); distinct per share, never 0. */
  x: number;
  /** Share bytes, one per secret byte. */
  y: Uint8Array;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/**
 * Split `secret` into `n` shares such that any `t` reconstruct it and any `t-1`
 * reveal nothing. Requires 2 ≤ t ≤ n ≤ 255.
 */
export function split(secret: Uint8Array, n: number, t: number): Share[] {
  if (t < 2 || t > n || n > 255) throw new Error("Require 2 ≤ threshold ≤ count ≤ 255");
  const shares: Share[] = [];
  for (let i = 1; i <= n; i++) shares.push({ x: i, y: new Uint8Array(secret.length) });

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // coeffs[0] is the secret byte; the rest are random → degree t-1 polynomial.
    const coeffs = new Uint8Array(t);
    coeffs[0] = secret[byteIdx];
    coeffs.set(randomBytes(t - 1), 1);
    for (const share of shares) {
      share.y[byteIdx] = evalPoly(coeffs, share.x);
    }
  }
  return shares;
}

/** Reconstruct the secret from `t` (or more) shares via Lagrange interpolation at x=0. */
export function combine(shares: Share[]): Uint8Array {
  if (shares.length < 2) throw new Error("Need at least 2 shares");
  const len = shares[0].y.length;
  if (!shares.every((s) => s.y.length === len)) throw new Error("Shares differ in length");
  if (new Set(shares.map((s) => s.x)).size !== shares.length) throw new Error("Duplicate share x-coordinates");

  const secret = new Uint8Array(len);
  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let acc = 0;
    for (let i = 0; i < shares.length; i++) {
      // Lagrange basis L_i(0) = Π_{j≠i} x_j / (x_j - x_i)   (subtraction == XOR in GF2^8)
      let num = 1;
      let den = 1;
      for (let j = 0; j < shares.length; j++) {
        if (j === i) continue;
        num = gmul(num, shares[j].x);
        den = gmul(den, shares[i].x ^ shares[j].x);
      }
      const lagrange = gdiv(num, den);
      acc ^= gmul(shares[i].y[byteIdx], lagrange);
    }
    secret[byteIdx] = acc;
  }
  return secret;
}

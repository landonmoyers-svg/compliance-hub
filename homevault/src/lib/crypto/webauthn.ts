import { base64ToBytes, bytesToBase64 } from "./encoding";
import type { DeviceFactor } from "./keys";

/**
 * WebAuthn / passkey binding — the *device* half of the key hierarchy
 * (docs/SECURITY.md § 2 and § 5 "stolen password").
 *
 * The passkey does two jobs, and it is worth keeping them distinct:
 *
 *  1. **Authentication** — proving who is making a request. Phishing-resistant
 *     because WebAuthn binds the assertion to this origin.
 *  2. **A factor in the key hierarchy** — via the **PRF extension**, the
 *     authenticator returns a stable, high-entropy secret derived from a salt we
 *     supply and a key that never leaves the hardware. That output is the
 *     `DeviceFactor` fed into `deriveKeyEncryptionKey`.
 *
 * Job 2 is what makes a stolen passphrase insufficient: the PRF output cannot be
 * phished or replayed off-device, and it is never sent to the server.
 *
 * NOTE ON TESTING: everything here requires a real authenticator and a secure
 * browser context, so it cannot be exercised by the Node unit tests. The pure,
 * testable half of the hierarchy lives in `keys.ts`; this module is deliberately
 * a thin adapter over the browser API so there is little untested logic. It must
 * be verified manually (or with a virtual authenticator in an E2E run) before
 * the Phase-1 review sign-off.
 */

/** `BufferSource` covers both ArrayBuffer and views; normalize to bytes. */
function toBytes(src: BufferSource): Uint8Array {
  return ArrayBuffer.isView(src)
    ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
    : new Uint8Array(src);
}

/**
 * Per-household PRF salt. Non-secret (like the KDF salt) and stored server-side,
 * but it MUST be stable: change it and the authenticator returns a different
 * secret, which would make the vault unopenable.
 */
export interface PasskeyBinding {
  /** base64 — the credential id to assert against. */
  credentialId: string;
  /** base64 — the salt evaluated by the PRF extension. Stable for the vault's life. */
  prfSalt: string;
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof PublicKeyCredential !== "undefined"
  );
}

/** Fresh, stable per-household PRF salt. Store it alongside the KDF salt. */
export function generatePrfSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

function assertSecureContext(): void {
  // WebAuthn silently requires HTTPS (or localhost). Fail with a clear message
  // rather than an opaque DOMException.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("Passkeys require a secure context (HTTPS or localhost).");
  }
}

/**
 * Enroll a passkey for this household and confirm the authenticator supports
 * PRF. We do NOT read a PRF value here: per spec, `create()` reports only
 * whether PRF is `enabled`, and some authenticators refuse to evaluate it during
 * registration. The first real value is read at unlock.
 *
 * Throws if PRF is unsupported — the caller must then fall back to a
 * device-stored key (see `SECURITY.md` § 2), not silently drop to one factor.
 */
export async function enrollPasskey(opts: {
  challenge: Uint8Array;
  rpId: string;
  rpName: string;
  userId: Uint8Array;
  userName: string;
  userDisplayName: string;
  prfSalt: Uint8Array;
}): Promise<PasskeyBinding> {
  assertSecureContext();
  if (!isWebAuthnAvailable()) throw new Error("This browser does not support passkeys (WebAuthn).");

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: opts.challenge as BufferSource,
      rp: { id: opts.rpId, name: opts.rpName },
      user: {
        id: opts.userId as BufferSource,
        name: opts.userName,
        displayName: opts.userDisplayName,
      },
      // ES256 then RS256 — the two every platform authenticator supports.
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        // Platform authenticator + discoverable credential, so the passkey is
        // hardware-bound to this device and usable without a username.
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      timeout: 120_000,
      extensions: { prf: {} },
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey enrollment was cancelled.");

  const ext = credential.getClientExtensionResults();
  if (!ext.prf?.enabled) {
    throw new Error(
      "This authenticator does not support the PRF extension, which HomeVault needs to bind the vault key to your device.",
    );
  }

  return {
    credentialId: bytesToBase64(new Uint8Array(credential.rawId)),
    prfSalt: bytesToBase64(opts.prfSalt),
  };
}

/**
 * Assert the passkey and return the PRF output to use as the device factor.
 *
 * The returned bytes are key material: pass them straight into
 * `deriveKeyEncryptionKey` and `zeroize` them afterwards. Never log, persist, or
 * transmit this value.
 */
export async function getDeviceFactor(opts: {
  challenge: Uint8Array;
  rpId: string;
  binding: PasskeyBinding;
}): Promise<DeviceFactor> {
  assertSecureContext();
  if (!isWebAuthnAvailable()) throw new Error("This browser does not support passkeys (WebAuthn).");

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: opts.challenge as BufferSource,
      rpId: opts.rpId,
      allowCredentials: [
        { type: "public-key", id: base64ToBytes(opts.binding.credentialId) as BufferSource },
      ],
      userVerification: "required",
      timeout: 120_000,
      extensions: {
        prf: { eval: { first: base64ToBytes(opts.binding.prfSalt) as BufferSource } },
      },
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Unlock was cancelled.");

  const prf = assertion.getClientExtensionResults().prf?.results?.first;
  if (!prf) {
    throw new Error("The authenticator did not return a PRF value, so the vault key cannot be unwrapped.");
  }

  return toBytes(prf);
}

/**
 * A fresh challenge. WebAuthn challenges exist to stop replay; for the PRF
 * key-derivation path the value only needs to be unpredictable, and a
 * server-issued challenge is required for the *authentication* path (so the
 * server can verify the signature). Callers doing real auth must pass the
 * server's challenge rather than one generated here.
 */
export function generateChallenge(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

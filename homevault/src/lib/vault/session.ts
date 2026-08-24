import { openVaultKeyEnvelope, zeroize, type VaultKeyEnvelope } from "../crypto/keys";
import type { DeviceFactor } from "../crypto/keys";

/**
 * The vault session — the only thing in the app that holds an unwrapped Vault
 * Key, and the enforcement point for docs/SECURITY.md § 1: "plaintext and
 * unwrapped keys exist only in the client, only while unlocked, and are zeroized
 * on lock/close."
 *
 * Deliberately separate from the *authentication* session. Being signed in
 * proves who you are and lets requests through RLS; it grants no ability to
 * decrypt anything (SECURITY.md § 4). Those are two independent states, and the
 * UI shows them as such.
 *
 * Honest limitation: an unwrapped VK lives here as a `CryptoKey`. WebCrypto owns
 * that key material, so JavaScript cannot overwrite it the way `zeroize` scrubs
 * a byte array — locking drops every reference and lets the implementation
 * reclaim it. Any raw bytes this module touches *are* zeroized.
 */

export type VaultState = "locked" | "unlocking" | "unlocked";

export interface VaultSnapshot {
  state: VaultState;
  /** Why the vault locked itself, for an honest message in the UI. */
  lastLockReason: LockReason | null;
  error: string | null;
}

export type LockReason = "manual" | "idle" | "page-hidden" | "unlock-failed";

/** 15 minutes. Short enough to matter, long enough not to train users to hate it. */
export const DEFAULT_IDLE_LOCK_MS = 15 * 60 * 1000;

export interface VaultSessionOptions {
  idleLockMs?: number;
  /** Injectable for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class VaultSession {
  private vaultKey: CryptoKey | null = null;
  private state: VaultState = "locked";
  private lastLockReason: LockReason | null = null;
  private error: string | null = null;
  private lastActivityAt: number;
  private timer: unknown = null;
  private listeners = new Set<() => void>();
  private snapshot: VaultSnapshot;

  private readonly idleLockMs: number;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(opts: VaultSessionOptions = {}) {
    this.idleLockMs = opts.idleLockMs ?? DEFAULT_IDLE_LOCK_MS;
    this.now = opts.now ?? (() => Date.now());
    this.setTimer =
      opts.setTimer ?? ((fn, ms) => (typeof setTimeout === "function" ? setTimeout(fn, ms) : null));
    this.clearTimer =
      opts.clearTimer ?? ((h) => { if (h !== null && typeof clearTimeout === "function") clearTimeout(h as never); });
    this.lastActivityAt = this.now();
    this.snapshot = this.buildSnapshot();
  }

  // --- React-friendly store surface (useSyncExternalStore) -----------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): VaultSnapshot => this.snapshot;

  private buildSnapshot(): VaultSnapshot {
    return { state: this.state, lastLockReason: this.lastLockReason, error: this.error };
  }

  private emit(): void {
    // Rebuild once per change so referential equality is stable between emits —
    // otherwise useSyncExternalStore loops forever.
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  // --- Lifecycle ----------------------------------------------------------

  /**
   * Unlock the vault. The device factor is zeroized here regardless of outcome:
   * the caller hands it over, and this owns it from that point.
   */
  async unlock(
    envelope: VaultKeyEnvelope,
    passphrase: string,
    deviceFactor: DeviceFactor,
  ): Promise<void> {
    this.state = "unlocking";
    this.error = null;
    this.emit();

    try {
      this.vaultKey = await openVaultKeyEnvelope(envelope, passphrase, deviceFactor);
      this.state = "unlocked";
      this.lastLockReason = null;
      this.touch();
    } catch (err) {
      this.vaultKey = null;
      this.state = "locked";
      this.lastLockReason = "unlock-failed";
      this.error = err instanceof Error ? err.message : "Unlock failed.";
      throw err;
    } finally {
      zeroize(deviceFactor);
      this.emit();
    }
  }

  /** Lock the vault and drop the key. Safe to call when already locked. */
  lock(reason: LockReason = "manual"): void {
    this.clearTimer(this.timer);
    this.timer = null;
    this.vaultKey = null;
    this.state = "locked";
    this.lastLockReason = reason;
    this.emit();
  }

  /**
   * The unwrapped VK. Throws rather than returning null when locked, so a caller
   * can never accidentally treat "no key" as "nothing to encrypt".
   */
  requireVaultKey(): CryptoKey {
    if (this.state !== "unlocked" || !this.vaultKey) {
      throw new Error("The vault is locked.");
    }
    this.touch();
    return this.vaultKey;
  }

  isUnlocked(): boolean {
    return this.state === "unlocked" && this.vaultKey !== null;
  }

  /** Record user activity and restart the idle countdown. */
  touch(): void {
    if (this.state !== "unlocked") return;
    this.lastActivityAt = this.now();
    this.clearTimer(this.timer);
    this.timer = this.setTimer(() => this.lockIfIdle(), this.idleLockMs);
  }

  /**
   * Lock if the idle window has elapsed. Checks the clock rather than trusting
   * the timer — a laptop that slept through the timeout must still come back
   * locked.
   */
  lockIfIdle(): void {
    if (this.state !== "unlocked") return;
    if (this.now() - this.lastActivityAt >= this.idleLockMs) this.lock("idle");
    else this.touch();
  }

  get msUntilIdleLock(): number {
    if (this.state !== "unlocked") return 0;
    return Math.max(0, this.idleLockMs - (this.now() - this.lastActivityAt));
  }
}

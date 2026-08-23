"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { VaultSession, type VaultSnapshot } from "./session";
import {
  createVaultKeyEnvelope,
  defaultKdfParams,
  type VaultKeyEnvelope,
} from "../crypto/keys";
import { deriveFactorFromDeviceKey, getOrCreateDeviceKey } from "../crypto/device-factor";
import { bytesToBase64, base64ToBytes } from "../crypto/encoding";

/**
 * React binding for the vault session. Holds one `VaultSession` for the app and
 * exposes it through `useSyncExternalStore`, so every component sees the same
 * locked/unlocked state and a lock takes effect everywhere at once.
 *
 * The envelope (wrapped VK + KDF params) is *non-secret* — it is exactly what
 * the server would store — so in demo mode it lives in `localStorage`. No key
 * material is persisted anywhere: VK exists only in memory, only while unlocked.
 */

const ENVELOPE_KEY = "homevault:demo:envelope";
const SALT_KEY = "homevault:demo:device-salt";
const DEMO_HOUSEHOLD = "demo-household";

interface VaultContextValue {
  snapshot: VaultSnapshot;
  /**
   * False during the server render and hydration, true once running on the
   * client. The server cannot know whether a vault exists, so anything that
   * branches on `hasVault` must wait for this or the markup will mismatch.
   */
  ready: boolean;
  /** Whether this browser already holds a vault (i.e. show unlock, not create). */
  hasVault: boolean;
  createVault(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  /** Throws when locked — callers must be inside an unlocked vault. */
  requireVaultKey(): CryptoKey;
  /** Wipe the demo vault from this browser. */
  reset(): void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/**
 * Whether a vault exists is a client-only fact, so it is exposed as an external
 * store rather than read during render. `useSyncExternalStore` uses the server
 * snapshot while hydrating and then switches to the real one, which is what
 * keeps the markup consistent — reading localStorage during render instead
 * makes the server and client disagree and React throws a hydration error.
 */
const envelopeListeners = new Set<() => void>();

function notifyEnvelopeChanged(): void {
  for (const l of envelopeListeners) l();
}

function subscribeEnvelope(onChange: () => void): () => void {
  envelopeListeners.add(onChange);
  // Another tab creating or resetting the vault should update this one too.
  window.addEventListener("storage", onChange);
  return () => {
    envelopeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

const getHasVault = () => localStorage.getItem(ENVELOPE_KEY) !== null;
/** The server has no idea whether this browser holds a vault. */
const getHasVaultOnServer = () => false;

const subscribeNever = () => () => {};
const isClient = () => true;
const isClientOnServer = () => false;

function readEnvelope(): VaultKeyEnvelope | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(ENVELOPE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultKeyEnvelope;
  } catch {
    return null;
  }
}

/** The stable per-household salt the device key is evaluated against. */
function readOrCreateDeviceSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_KEY);
  if (existing) return base64ToBytes(existing);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(SALT_KEY, bytesToBase64(salt));
  return salt;
}

/**
 * Obtain the device factor for the demo via the device-key path
 * (`crypto/device-factor.ts`). Passkey PRF is the production path; it needs a
 * platform authenticator, so the browser demo uses the sanctioned fallback —
 * still bound to this browser profile, still a real second factor.
 */
async function demoDeviceFactor(): Promise<Uint8Array> {
  const deviceKey = await getOrCreateDeviceKey(DEMO_HOUSEHOLD);
  return deriveFactorFromDeviceKey(deviceKey, readOrCreateDeviceSalt());
}

export function VaultProvider({ children }: { children: ReactNode }) {
  // One session for the app's lifetime. A lazy useState initializer (rather
  // than a ref) so the instance is created once and can be read during render.
  const [session] = useState(() => new VaultSession());

  const hasVault = useSyncExternalStore(subscribeEnvelope, getHasVault, getHasVaultOnServer);
  const ready = useSyncExternalStore(subscribeNever, isClient, isClientOnServer);

  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    // The server render is always "locked" — there is no vault on the server.
    session.getSnapshot,
  );

  const createVault = useCallback(
    async (passphrase: string) => {
      const factor = await demoDeviceFactor();
      const { envelope } = await createVaultKeyEnvelope(passphrase, factor, defaultKdfParams());
      localStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
      notifyEnvelopeChanged();
      // Unlock immediately so creating a vault leaves you inside it.
      await session.unlock(envelope, passphrase, await demoDeviceFactor());
    },
    [session],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      const envelope = readEnvelope();
      if (!envelope) throw new Error("No vault exists in this browser yet.");
      await session.unlock(envelope, passphrase, await demoDeviceFactor());
    },
    [session],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      snapshot,
      ready,
      hasVault,
      createVault,
      unlock,
      lock: () => session.lock("manual"),
      requireVaultKey: () => session.requireVaultKey(),
      reset: () => {
        session.lock("manual");
        localStorage.removeItem(ENVELOPE_KEY);
        localStorage.removeItem(SALT_KEY);
        notifyEnvelopeChanged();
      },
    }),
    [snapshot, ready, hasVault, createVault, unlock, session],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside a <VaultProvider>.");
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { VaultSession, type VaultSnapshot } from "./session";
import {
  createVaultKeyEnvelope,
  defaultKdfParams,
  rewrapVaultKey,
  type VaultKeyEnvelope,
} from "../crypto/keys";
import { createRecoveryCode, recoverVaultKey, type RecoveryEnvelope } from "../crypto/recovery";
import { deriveFactorFromDeviceKey, getOrCreateDeviceKey } from "../crypto/device-factor";
import { LocalVaultBackend, SupabaseVaultBackend, type VaultBackend, type StoredEnvelope } from "./backend";

/**
 * React binding for the vault. Owns the one `VaultSession`, and mediates every
 * operation that needs the unwrapped vault key.
 *
 * The unwrapped key never leaves this boundary: callers get `requireVaultKey()`
 * while unlocked, and the key is dropped on lock. Everything persisted goes out
 * through a `VaultBackend` as ciphertext.
 */

interface VaultContextValue {
  snapshot: VaultSnapshot;
  /** False during SSR/hydration, when the browser hasn't been consulted yet. */
  ready: boolean;
  /** Whether this account already has a vault (show unlock rather than setup). */
  hasVault: boolean;
  householdName: string | null;

  setUpVault(input: { householdName: string; displayName: string | null; passphrase: string }): Promise<string>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  requireVaultKey(): CryptoKey;

  /** Issue (or replace) the household's recovery code. Returns it once. */
  issueRecoveryCode(): Promise<string>;
  hasRecoveryCode(): Promise<boolean>;
  /** Get back in with a printed code, then set a new passphrase. */
  recoverWithCode(code: string, newPassphrase: string): Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/** Client-only facts, exposed as stores so hydration stays consistent. */
const subscribeNever = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function VaultProvider({
  backend,
  children,
}: {
  /** "supabase" for a real household; anything else uses this browser only. */
  backend: "supabase" | "demo";
  children: ReactNode;
}) {
  const [session] = useState(() => new VaultSession());
  const [store] = useState<VaultBackend>(() =>
    backend === "supabase" ? new SupabaseVaultBackend() : new LocalVaultBackend(),
  );

  const ready = useSyncExternalStore(subscribeNever, onClient, onServer);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  // Cached so unlock doesn't re-query on every keystroke; refreshed whenever the
  // stored envelope changes underneath us.
  const [stored, setStored] = useState<StoredEnvelope | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async (): Promise<StoredEnvelope | null> => {
    const next = await store.loadEnvelope();
    setStored(next);
    setLoaded(true);
    return next;
  }, [store]);

  // Load once on the client. Guarded against a late response landing after the
  // provider unmounts (or after a second load supersedes it).
  useEffect(() => {
    let cancelled = false;
    store
      .loadEnvelope()
      .then((next) => {
        if (cancelled) return;
        setStored(next);
        setLoaded(true);
      })
      .catch(() => {
        // A failed load is indistinguishable from "no vault yet" for the UI;
        // unlock/setup will surface a real error when the user acts.
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const ensureLoaded = useCallback(async (): Promise<StoredEnvelope | null> => {
    if (loaded) return stored;
    return refresh();
  }, [loaded, stored, refresh]);

  /** The device factor for a given member salt. See crypto/device-factor.ts. */
  const deviceFactor = useCallback(async (salt: Uint8Array) => {
    const key = await getOrCreateDeviceKey("homevault");
    return deriveFactorFromDeviceKey(key, salt);
  }, []);

  const setUpVault = useCallback<VaultContextValue["setUpVault"]>(
    async ({ householdName, displayName, passphrase }) => {
      const deviceSalt = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const factor = await deviceFactor(deviceSalt);
      const { envelope, vaultKey } = await createVaultKeyEnvelope(passphrase, factor, defaultKdfParams());

      await store.createHousehold({ householdName, displayName, envelope, deviceSalt });

      // Issue the recovery code straight away: a vault with no way back in is
      // one forgotten passphrase from losing everything.
      const { code, envelope: recovery } = await createRecoveryCode(vaultKey);
      await store.saveRecovery(recovery);

      await session.unlock(envelope, passphrase, await deviceFactor(deviceSalt));
      await refresh();
      return code;
    },
    [store, session, deviceFactor, refresh],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      const current = await ensureLoaded();
      if (!current) throw new Error("There is no vault on this account yet.");
      await session.unlock(current.envelope, passphrase, await deviceFactor(current.deviceSalt));
    },
    [ensureLoaded, session, deviceFactor],
  );

  const issueRecoveryCode = useCallback(async () => {
    const { code, envelope } = await createRecoveryCode(session.requireVaultKey());
    await store.saveRecovery(envelope);
    return code;
  }, [session, store]);

  const hasRecoveryCode = useCallback(async () => (await store.loadRecovery()) !== null, [store]);

  const recoverWithCode = useCallback(
    async (code: string, newPassphrase: string) => {
      const recovery: RecoveryEnvelope | null = await store.loadRecovery();
      if (!recovery) throw new Error("This household has no recovery code on file.");

      const vaultKey = await recoverVaultKey(recovery, code);

      // Recovery is only useful if it leaves a vault that opens normally again,
      // so re-wrap under the new passphrase and this device before finishing.
      const deviceSalt = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const envelope: VaultKeyEnvelope = await rewrapVaultKey(
        vaultKey,
        newPassphrase,
        await deviceFactor(deviceSalt),
        defaultKdfParams(),
      );
      await store.updateEnvelope(envelope, deviceSalt);
      await session.unlock(envelope, newPassphrase, await deviceFactor(deviceSalt));
      await refresh();
    },
    [store, session, deviceFactor, refresh],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      snapshot,
      ready,
      hasVault: stored !== null,
      householdName: stored?.householdName ?? null,
      setUpVault,
      unlock,
      lock: () => session.lock("manual"),
      requireVaultKey: () => session.requireVaultKey(),
      issueRecoveryCode,
      hasRecoveryCode,
      recoverWithCode,
    }),
    [snapshot, ready, stored, setUpVault, unlock, session, issueRecoveryCode, hasRecoveryCode, recoverWithCode],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used inside a <VaultProvider>.");
  return ctx;
}

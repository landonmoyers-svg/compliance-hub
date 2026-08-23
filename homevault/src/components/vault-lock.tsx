"use client";

import { useState } from "react";
import { Lock, LockOpen, ShieldCheck, Loader2 } from "lucide-react";
import { useVault } from "@/lib/vault/provider";
import { Badge, Card } from "./ui";

/**
 * The lock indicator in the app header, plus the unlock/create panel.
 *
 * These deliberately show the vault state as *separate* from being signed in
 * (SECURITY.md § 4: a session authenticates requests but holds no decryption
 * power). "Unlocked" here means this browser currently holds the vault key in
 * memory — nothing to do with a server session.
 */

export function VaultLockBadge() {
  const { snapshot, lock } = useVault();

  if (snapshot.state !== "unlocked") {
    return (
      <Badge tone="neutral">
        <Lock size={11} /> vault locked
      </Badge>
    );
  }

  return (
    <button
      onClick={lock}
      className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-xs font-medium text-success transition-colors hover:bg-success/25"
      title="Lock the vault — the key is dropped from memory"
    >
      <LockOpen size={11} /> vault unlocked · lock
    </button>
  );
}

/**
 * Shown wherever secrets would appear while the vault is locked. Handles both
 * first-run (create a vault) and returning (unlock).
 */
export function VaultUnlockPanel() {
  const { snapshot, ready, hasVault, createVault, unlock } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = snapshot.state === "unlocking";
  const creating = !hasVault;

  // Whether a vault exists is only knowable in the browser, so render a neutral
  // placeholder until the client has checked — otherwise the server's guess and
  // the client's answer disagree and hydration fails.
  if (!ready) {
    return (
      <Card className="mx-auto max-w-lg p-6">
        <div className="flex items-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Checking this device for a vault…</span>
        </div>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (creating && passphrase !== confirm) {
      setLocalError("The two passphrases don't match.");
      return;
    }
    if (creating && passphrase.length < 8) {
      setLocalError("Use at least 8 characters — this passphrase protects everything in the vault.");
      return;
    }

    try {
      if (creating) await createVault(passphrase);
      else await unlock(passphrase);
      setPassphrase("");
      setConfirm("");
    } catch {
      // The session records the real (deliberately vague) reason.
    }
  }

  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-accent" size={20} />
        <h2 className="font-semibold">{creating ? "Create your vault" : "Unlock your vault"}</h2>
      </div>

      <p className="mt-2 text-sm text-muted">
        {creating ? (
          <>
            Your passphrase is stretched with Argon2id in this browser and combined with a key held by this
            device. The result unwraps your vault key. Neither factor alone is enough, and neither ever leaves
            your device.
          </>
        ) : (
          <>
            Your vault key is unwrapped here in the browser from your passphrase plus this device&apos;s key.
            The server never sees either.
          </>
        )}
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete={creating ? "new-password" : "current-password"}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent/50"
            placeholder="Your vault passphrase"
            required
          />
        </label>

        {creating ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Confirm passphrase</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent/50"
              placeholder="Type it again"
              required
            />
          </label>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LockOpen size={15} />}
          {busy ? "Deriving key…" : creating ? "Create vault" : "Unlock"}
        </button>

        {localError ?? snapshot.error ? (
          <p className="text-sm text-danger">{localError ?? snapshot.error}</p>
        ) : null}

        {snapshot.lastLockReason === "idle" ? (
          <p className="text-xs text-muted">The vault locked itself after a period of inactivity.</p>
        ) : null}
      </form>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
        Demo: the vault lives in this browser only. The wrapped key is stored the way a server would store it
        — useless without your passphrase and this device. There is no password reset, by design.
      </p>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Lock, LockOpen, ShieldCheck, Loader2, KeyRound, Printer, AlertTriangle } from "lucide-react";
import { useVault } from "@/lib/vault/provider";
import { Badge, Card } from "./ui";

/**
 * The vault's lock state and the panels that change it: first-run setup,
 * unlock, and recovery.
 *
 * Throughout, "unlocked" means this browser is holding the vault key in memory.
 * It is deliberately shown as separate from being signed in — a session proves
 * who you are and carries no ability to decrypt (docs/SECURITY.md § 4).
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

const inputClass =
  "rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50";

export function VaultUnlockPanel() {
  const { ready, hasVault } = useVault();
  const [mode, setMode] = useState<"default" | "recover">("default");

  if (!ready) {
    return (
      <Card className="mx-auto max-w-lg p-6">
        <div className="flex items-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Checking this device for your vault…</span>
        </div>
      </Card>
    );
  }

  if (mode === "recover") return <RecoverPanel onCancel={() => setMode("default")} />;
  if (!hasVault) return <SetUpPanel />;
  return <UnlockPanel onForgot={() => setMode("recover")} />;
}

// ---------------------------------------------------------------------------

function SetUpPanel() {
  const { setUpVault, snapshot } = useVault();
  const [householdName, setHouseholdName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  if (code) return <RecoveryCodeCard code={code} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase !== confirm) return setError("The two passphrases don't match.");
    if (passphrase.length < 10) {
      return setError("Use at least 10 characters — this passphrase protects everything in the vault.");
    }
    setBusy(true);
    try {
      setCode(await setUpVault({ householdName, displayName: displayName || null, passphrase }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your vault.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-accent" size={20} />
        <h2 className="font-semibold">Set up your household vault</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        Your passphrase is stretched with Argon2id in this browser and combined with a key held by this device.
        Together they unwrap your vault key. Neither factor alone is enough, and neither ever leaves your device
        — which also means <b>nobody can reset this for you</b>.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Household name</span>
          <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} required
            placeholder="The Moyers household" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Your name (optional)</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Vault passphrase</span>
          <input type="password" autoComplete="new-password" value={passphrase} required
            onChange={(e) => setPassphrase(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Confirm passphrase</span>
          <input type="password" autoComplete="new-password" value={confirm} required
            onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </label>

        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          {busy ? "Creating your vault…" : "Create vault"}
        </button>
        {error ?? snapshot.error ? <p className="text-sm text-danger">{error ?? snapshot.error}</p> : null}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Shown exactly once, right after the code is generated. It is not stored
 * anywhere in readable form, so if the user closes this without writing it
 * down, the only remedy is to issue a new one from Settings.
 */
function RecoveryCodeCard({ code }: { code: string }) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="text-accent" size={20} />
        <h2 className="font-semibold">Write this down before you continue</h2>
      </div>

      <p className="mt-2 text-sm text-muted">
        This is your recovery code — the only way back into the vault if you forget your passphrase or lose this
        browser. Put it somewhere physical: the fire safe, a sealed envelope, with your other important papers.
      </p>

      <div className="mt-4 rounded-md border border-accent/30 bg-surface-2 p-4 text-center">
        <code className="select-all font-mono text-lg tracking-wider">{code}</code>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-muted">
          We can&apos;t show this again and we can&apos;t recover it — HomeVault never stores the code itself,
          only a copy of your vault key locked with it. That&apos;s the same property that stops us (or anyone
          who steals the database) from reading your vault.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface">
          <Printer size={14} /> Print
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          I&apos;ve saved it
        </label>
        <button disabled={!acknowledged} onClick={() => window.location.reload()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Continue
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function UnlockPanel({ onForgot }: { onForgot: () => void }) {
  const { unlock, snapshot, householdName } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const busy = snapshot.state === "unlocking";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await unlock(passphrase);
      setPassphrase("");
    } catch {
      // The session records the deliberately vague reason.
    }
  }

  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-accent" size={20} />
        <h2 className="font-semibold">Unlock {householdName ?? "your vault"}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        Your vault key is unwrapped here in the browser from your passphrase plus this device&apos;s key. The
        server never sees either.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input type="password" autoComplete="current-password" value={passphrase} required
          onChange={(e) => setPassphrase(e.target.value)} placeholder="Your vault passphrase" className={inputClass} />
        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LockOpen size={15} />}
          {busy ? "Deriving key…" : "Unlock"}
        </button>
        {snapshot.error ? <p className="text-sm text-danger">{snapshot.error}</p> : null}
        {snapshot.lastLockReason === "idle" ? (
          <p className="text-xs text-muted">The vault locked itself after a period of inactivity.</p>
        ) : null}
      </form>

      <button onClick={onForgot} className="mt-4 text-xs text-accent hover:underline">
        I&apos;ve forgotten my passphrase — use my recovery code
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function RecoverPanel({ onCancel }: { onCancel: () => void }) {
  const { recoverWithCode } = useVault();
  const [code, setCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase !== confirm) return setError("The two passphrases don't match.");
    if (passphrase.length < 10) return setError("Use at least 10 characters for the new passphrase.");
    setBusy(true);
    try {
      await recoverWithCode(code, passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="text-accent" size={20} />
        <h2 className="font-semibold">Recover your vault</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        Enter the recovery code you wrote down, and choose a new passphrase. Your records are not re-encrypted —
        only the key that opens them is re-wrapped.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Recovery code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} required
            placeholder="H7QK2-9WMXR-4TBND-P3FGZ-6VJC8-YS"
            className={`${inputClass} font-mono tracking-wider`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">New passphrase</span>
          <input type="password" autoComplete="new-password" value={passphrase} required
            onChange={(e) => setPassphrase(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Confirm new passphrase</span>
          <input type="password" autoComplete="new-password" value={confirm} required
            onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </label>

        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {busy ? "Recovering…" : "Recover and set new passphrase"}
        </button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </form>

      <button onClick={onCancel} className="mt-4 text-xs text-muted hover:text-foreground">
        ← Back to unlock
      </button>
    </Card>
  );
}

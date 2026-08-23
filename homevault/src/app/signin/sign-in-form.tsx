"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { Card } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Sign-in.
 *
 * This authenticates the *session* — it proves who you are so requests pass
 * Row-Level Security. It grants no ability to read anything: every secret is
 * still sealed under the vault key, which is unwrapped separately from your
 * passphrase and this device (docs/SECURITY.md § 4). The copy says so plainly,
 * because a user who thinks signing in "opened" their vault has the wrong model
 * of what protects them.
 */
export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // With email confirmation on, there is no session yet — say so rather
        // than bouncing to a page that will redirect straight back here.
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }

      // Refresh so Server Components re-run with the new session cookies.
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-accent" size={20} />
        <h1 className="text-lg font-semibold">
          {mode === "signup" ? "Create your HomeVault account" : "Sign in to HomeVault"}
        </h1>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent/50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent/50"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
          {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {notice ? <p className="text-sm text-success">{notice}</p> : null}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
            setNotice(null);
          }}
          className="text-xs text-accent hover:underline"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "First time here? Create an account"}
        </button>
      </form>

      <div className="mt-5 flex gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" />
        <p>
          Signing in is not the same as unlocking. This proves who you are to the server; your records stay
          encrypted until you unlock the vault with your passphrase on this device. A stolen session cannot
          decrypt anything.
        </p>
      </div>
    </Card>
  );
}

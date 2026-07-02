"use client";

import { useState } from "react";
import { ShieldCheck, Eye, EyeOff, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Step = "credentials" | "mfa" | "enroll_mfa";

export default function LoginPage() {
  const supabase = createClient();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [factorId, setFactorId] = useState("");   // the TOTP factor UUID
  const [challengeId, setChallengeId] = useState(""); // the challenge UUID
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      // Check if user has MFA factors enrolled
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.[0];

      if (totpFactor && totpFactor.status === "verified") {
        // MFA enrolled — need to challenge it
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: totpFactor.id });

        if (challengeError) {
          setError(challengeError.message);
          setLoading(false);
          return;
        }

        setFactorId(totpFactor.id);
        setChallengeId(challengeData.id);
        setStep("mfa");
      } else if (data.user) {
        // No MFA enrolled yet — prompt enrollment for security
        await enrollMFA();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function enrollMFA() {
    setLoading(true);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Compliance Hub",
        friendlyName: "Authenticator App",
      });

      if (enrollError || !data) {
        setError(enrollError?.message ?? "Failed to start MFA enrollment");
        setLoading(false);
        return;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep("enroll_mfa");
    } finally {
      setLoading(false);
    }
  }

  async function handleMFAVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (step === "enroll_mfa") {
        // Complete enrollment
        const { data: challengeData } = await supabase.auth.mfa.challenge({ factorId });
        if (!challengeData) { setError("Failed to challenge factor"); setLoading(false); return; }

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challengeData.id,
          code: totpCode.replace(/\s/g, ""),
        });
        if (verifyError) { setError(verifyError.message); setLoading(false); return; }
      } else {
        // Verify existing challenge
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId,
          code: totpCode.replace(/\s/g, ""),
        });
        if (verifyError) { setError(verifyError.message); setLoading(false); return; }
      }

      // Success — redirect to app
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <ShieldCheck className="size-10 text-primary" />
          <h1 className="text-xl font-semibold">Compliance Hub</h1>
          <p className="text-sm text-muted-foreground">
            {step === "credentials" ? "Sign in to your account" :
             step === "mfa" ? "Enter your authenticator code" :
             "Set up two-factor authentication"}
          </p>
        </div>

        {step === "credentials" && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    className="input w-full"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="input w-full pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
                <a href="/auth/forgot" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                  Forgot your password?
                </a>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "enroll_mfa" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="size-4" />
                Set up authenticator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with Google Authenticator, Authy, or 1Password, then enter the 6-digit code to confirm.
              </p>

              {qrCode && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="MFA QR code" className="size-48 rounded-lg border border-border" />
                </div>
              )}

              {secret && (
                <div className="rounded-lg bg-secondary/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Can't scan? Enter this key manually:</p>
                  <p className="font-mono text-sm tracking-widest">{secret}</p>
                </div>
              )}

              <form onSubmit={handleMFAVerify} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">6-digit code</label>
                  <input
                    className="input w-full text-center font-mono text-xl tracking-widest"
                    placeholder="000 000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading || totpCode.length < 6}>
                  {loading ? "Verifying…" : "Verify and continue"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "mfa" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="size-4" />
                Two-factor authentication
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleMFAVerify} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Open your authenticator app and enter the 6-digit code for Compliance Hub.
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Authenticator code</label>
                  <input
                    className="input w-full text-center font-mono text-xl tracking-widest"
                    placeholder="000 000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading || totpCode.length < 6}>
                  {loading ? "Verifying…" : "Verify"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep("credentials"); setTotpCode(""); setError(""); setChallengeId(""); setFactorId(""); }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Back to login
                </button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * Where Microsoft sends the sign-in popup back to.
 *
 * It does one thing: hand the authorization code to the window that opened it
 * and close. The code is exchanged for a token in that window (see
 * src/lib/ms-graph.ts), so nothing sensitive is rendered here and nothing is
 * sent to the Hub's own server.
 *
 * Only staff on a password account ever see this. Anyone signed into the Hub
 * with Microsoft already has a Microsoft token and never makes the round trip.
 */

import { useEffect, useState } from "react";

interface Handback {
  source: "hub-ms-auth";
  code?: string;
  state?: string;
  error?: string;
}

function readQuery(): Handback {
  if (typeof window === "undefined") return { source: "hub-ms-auth" };
  const q = new URLSearchParams(window.location.search);
  const error = q.get("error_description") ?? q.get("error");
  return {
    source: "hub-ms-auth",
    code: q.get("code") ?? undefined,
    state: q.get("state") ?? undefined,
    error: error ? error.split("\n")[0] : undefined,
  };
}

export default function MicrosoftAuthCallback() {
  // Read once, at mount: the query string doesn't change under us, and
  // deciding the message here keeps the effect to its one real side effect.
  const [payload] = useState(readQuery);
  const orphaned = typeof window !== "undefined" && !window.opener;

  useEffect(() => {
    if (!window.opener) return;
    window.opener.postMessage(payload, window.location.origin);
    if (!payload.error) {
      const t = setTimeout(() => window.close(), 400);
      return () => clearTimeout(t);
    }
  }, [payload]);

  const message = payload.error
    ? orphaned
      ? `Sign-in failed: ${payload.error}`
      : "Sign-in failed — you can close this window."
    : orphaned
      ? "Sign-in finished, but the Hub window that started it is gone. Close this and try again."
      : "Signed in. You can close this window.";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

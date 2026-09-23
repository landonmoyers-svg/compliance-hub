"use client";

/**
 * Where Microsoft sends the sign-in popup back to.
 *
 * It does one thing: hand the authorization code to the window that opened it
 * and close. The code is exchanged for a token in that window (see
 * src/lib/ms-graph.ts), so nothing sensitive is rendered here and nothing is
 * sent to the Hub's own server.
 */

import { useEffect, useState } from "react";

export default function MicrosoftAuthCallback() {
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const error = q.get("error_description") ?? q.get("error");
    const payload = {
      source: "hub-ms-auth",
      code: q.get("code") ?? undefined,
      state: q.get("state") ?? undefined,
      error: error ? error.split("\n")[0] : undefined,
    };

    if (window.opener) {
      window.opener.postMessage(payload, window.location.origin);
      setMessage(error ? "Sign-in failed — you can close this window." : "Signed in. You can close this window.");
      if (!error) setTimeout(() => window.close(), 400);
    } else {
      setMessage(error ? `Sign-in failed: ${payload.error}` : "Sign-in finished, but the Hub window that started it is gone. Close this and try again.");
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

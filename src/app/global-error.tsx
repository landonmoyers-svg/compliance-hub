"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Root error boundary — catches errors in the root layout itself (where the
 * segment error.tsx can't). Must render its own <html>/<body>. Kept dependency-
 * and style-token-free so it works even if the app shell failed to load.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: "global" });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0b0b12", color: "#e5e7eb" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>The app hit an unexpected error</h1>
          <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 16 }}>
            It has been logged. Try reloading; if it persists, contact your administrator.
          </p>
          {error.digest && <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Reference: {error.digest}</p>}
          <button onClick={reset} style={{ background: "#6366f1", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

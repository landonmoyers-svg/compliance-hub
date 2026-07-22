/**
 * Lightweight, dependency-free client error reporting. Fires from the app's
 * error boundaries to a server route that logs centrally (so errors surface in
 * Vercel logs even when nobody reports them) and forwards to Sentry when a DSN
 * is configured. Never throws — a reporter that can crash is worse than none.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    const payload = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      context,
    };
    if (typeof fetch !== "undefined") {
      void fetch("/api/monitoring/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* swallow — reporting must never break the app */
  }
}

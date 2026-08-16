"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Installs window-level handlers for errors that never reach a React error
 * boundary — uncaught exceptions and unhandled promise rejections. In a CRUD
 * app the dominant error class is a failed fetch or an RLS-rejected create/
 * update inside a submit handler; those reject a promise but never re-render an
 * error boundary, so without this they are invisible in production. Reports are
 * throttled + deduplicated by message so a repeating error can't flood the
 * monitoring endpoint. Renders nothing; mounted once from the provider stack.
 */
export function GlobalErrorListener() {
  useEffect(() => {
    const seen = new Map<string, number>();
    const THROTTLE_MS = 60_000;
    const shouldReport = (key: string): boolean => {
      const now = Date.now();
      const last = seen.get(key);
      if (last !== undefined && now - last < THROTTLE_MS) return false;
      if (seen.size > 200) seen.clear(); // bound memory on long sessions
      seen.set(key, now);
      return true;
    };

    const onError = (event: ErrorEvent) => {
      // Ignore resource-load errors (img/script/link 404s): they surface here
      // with a target but no error object or message, and aren't app faults.
      if (!event.error && !event.message) return;
      const msg = event.message || (event.error as Error | undefined)?.message || "";
      // Opaque cross-origin script errors carry no actionable detail.
      if (msg === "Script error." || msg === "Script error") return;
      if (!shouldReport(msg || "window.onerror")) return;
      reportError(event.error ?? msg, {
        kind: "window.onerror",
        source: event.filename,
        line: event.lineno,
        col: event.colno,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      if (!shouldReport("rejection:" + msg)) return;
      reportError(reason, { kind: "unhandledrejection" });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

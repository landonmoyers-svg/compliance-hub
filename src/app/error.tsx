"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { reportError } from "@/lib/report-error";

/**
 * Route-segment error boundary. Instead of a white screen when a page throws
 * (the "page is failing" class), show a friendly recovery UI and report the
 * error centrally so it's caught before a user has to.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, boundary: "route" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Something went wrong on this page</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          The issue has been logged. You can retry, or head back to the dashboard.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Try again
        </button>
        <a href="/" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
          Go to dashboard
        </a>
      </div>
    </div>
  );
}

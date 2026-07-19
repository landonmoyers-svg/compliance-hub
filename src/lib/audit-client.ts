/**
 * Fire-and-forget audit logging for read-type access from the client (page
 * views, document opens). The server derives the actor from the session and
 * rejects non-read actions, so this can't be abused to forge audit history.
 * Never throws — logging must not break the user's action.
 */
export function logAccess(payload: {
  action?: "view" | "export" | "acknowledge" | "sign";
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  details?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
}): void {
  try {
    void fetch("/api/audit/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true, // survive a navigation that unloads the page
    }).catch(() => {});
  } catch { /* never let logging break the UI */ }
}

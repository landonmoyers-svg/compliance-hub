"use client";

import { db } from "./index";
import type { AuditLog } from "./schema";

/**
 * Fire-and-forget audit logging. Writes an entry to the audit_logs table for
 * sensitive actions (user/role changes, payroll, reviews, discipline, settings,
 * exports). Never throws — a failed audit write must not break the user's action.
 *
 * A failed write is NOT swallowed silently: besides the console, it is reported
 * to the central monitoring sink (/api/monitoring/error → Vercel logs / Sentry)
 * so a dropped compliance audit entry is actually visible to operators.
 *
 * Note: this is a client-side convenience writer. The authoritative, tamper-
 * evident audit trail for HIPAA should ultimately be enforced server-side; this
 * gives us a real, queryable log today instead of mock data.
 */
export async function logAudit(entry: {
  actorName: string;
  actorEmail?: string;
  action: AuditLog["action"];
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string;
  details?: string;
  riskLevel?: AuditLog["riskLevel"];
  flagged?: boolean;
  flagReason?: string | null;
}): Promise<void> {
  try {
    await db().auditLogs.create({
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      entityLabel: entry.entityLabel,
      details: entry.details,
      riskLevel: entry.riskLevel ?? "low",
      flagged: entry.flagged ?? false,
      flagReason: entry.flagReason ?? null,
    });
  } catch (err) {
    console.error("audit log write failed", err);
    // Surface the dropped audit write centrally instead of swallowing it — a
    // missing compliance audit entry is itself a finding, not just console noise.
    try {
      void fetch("/api/monitoring/error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          message: `audit log write failed: ${entry.action}`,
          stack: err instanceof Error ? err.stack : String(err),
          url: typeof window !== "undefined" ? window.location.href : undefined,
          context: { kind: "audit_write_failure", action: entry.action, entityType: entry.entityType, actorEmail: entry.actorEmail },
        }),
      }).catch(() => {});
    } catch { /* never let logging break the UI */ }
  }
}

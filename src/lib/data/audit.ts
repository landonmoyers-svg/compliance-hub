"use client";

import { db } from "./index";
import type { AuditLog } from "./schema";

/**
 * Fire-and-forget audit logging. Writes an entry to the audit_logs table for
 * sensitive actions (user/role changes, payroll, reviews, discipline, settings,
 * exports). Never throws — a failed audit write must not break the user's action,
 * but it is logged to the console for debugging.
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
  }
}

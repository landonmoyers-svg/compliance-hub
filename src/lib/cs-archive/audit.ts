"use client";

/**
 * The audit trail for controlled-substance paper logs.
 *
 * Every time an identified record moves — out of this browser into SharePoint,
 * or back out of SharePoint to someone's computer — it is written down. Both
 * the attempt and what came of it, so a refusal by SharePoint is as visible as
 * a success; "nobody can tell who opened it" is not an answer anyone wants to
 * give an inspector, and neither is "we only log the ones that worked".
 *
 * The actor is filled in server-side from the session (see
 * /api/audit/view), so nothing here can claim to be somebody else. What this
 * adds is the other half of the identity: WHICH Microsoft account did the
 * reaching, which matters when the Hub login and the Microsoft login are not
 * guaranteed to be the same person.
 */

import { logAccess } from "@/lib/audit-client";
import { msAccount } from "@/lib/ms-graph";
import type { DeaRecord } from "@/lib/data/schema";
import { formatDate } from "@/lib/dates";

type Movement = "upload" | "download";
type Outcome = "attempted" | "succeeded" | "failed";

/** A human-readable name for the record, for someone reading the log later. */
export function logLabel(r: Pick<DeaRecord, "substanceName" | "recordDate" | "periodStart" | "periodEnd" | "recordType">): string {
  const period = r.periodStart && r.periodEnd
    ? `${formatDate(r.periodStart)}–${formatDate(r.periodEnd)}`
    : r.recordDate ? formatDate(r.recordDate) : "";
  return [r.substanceName ?? "Controlled substance", "log", period].filter(Boolean).join(" ");
}

export function auditLogMovement(opts: {
  movement: Movement;
  outcome: Outcome;
  recordId?: string;
  label: string;
  /** Where it went or came from. */
  location?: string;
  /** Only set when the record actually carries chart numbers. */
  identified: boolean;
  pages?: number;
  error?: string;
}) {
  const who = msAccount();
  const verb = opts.movement === "upload"
    ? { attempted: "Sending", succeeded: "Sent", failed: "Failed to send" }[opts.outcome]
    : { attempted: "Fetching", succeeded: "Fetched", failed: "Failed to fetch" }[opts.outcome];

  const details = [
    `${verb} the ${opts.identified ? "identified" : "de-identified"} record`,
    opts.movement === "upload" ? "to" : "from",
    opts.location ?? "SharePoint",
    who ? `as ${who}` : null,
    opts.pages ? `(${opts.pages} ${opts.pages === 1 ? "page" : "pages"})` : null,
    opts.error ? `— ${opts.error}` : null,
  ].filter(Boolean).join(" ");

  logAccess({
    action: "export",
    entityType: "dea_record",
    entityId: opts.recordId,
    entityLabel: opts.label,
    details,
    // A failed attempt on an identified record is the most interesting line in
    // the log, not the least: someone reached for patient data and was refused.
    riskLevel: opts.identified ? (opts.outcome === "failed" ? "critical" : "high") : "medium",
  });
}

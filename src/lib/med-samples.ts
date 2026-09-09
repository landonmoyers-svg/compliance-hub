import type { MedSample, MedSampleLog, DrugRep } from "@/lib/data/schema";
import {
  estimatePace, runwayFrom, unitCount,
  type PaceEstimate, type UsageEvent, type Runway,
} from "@/lib/usage-pace";

export {
  paceLabel, unitLabel, unitCount, confidenceNote, trendNote,
  RUNWAY_CRITICAL_DAYS, RUNWAY_WATCH_DAYS,
  type PaceEstimate, type Runway, type StockStatus, type Confidence, type Trend,
} from "@/lib/usage-pace";

/**
 * Medication samples on top of the shared usage-pace engine. Only the
 * sample-specific parts live here: what counts as usage, expiry, and the
 * restock request to the rep.
 */

const DAY = 86_400_000;

/** Samples leave stock when dispensed. Receipts and corrections are not usage. */
function usageEvents(logs: MedSampleLog[]): UsageEvent[] {
  return logs
    .filter((l) => l.action === "dispensed" && l.quantityDelta !== 0)
    .map((l) => ({ at: new Date(l.occurredAt ?? l.createdDate), qty: Math.abs(l.quantityDelta) }));
}

export function pace(logs: MedSampleLog[], now = new Date()): PaceEstimate {
  return estimatePace(usageEvents(logs), now);
}

export function runway(sample: MedSample, logs: MedSampleLog[], now = new Date()): Runway {
  return runwayFrom(sample.quantityOnHand ?? 0, sample.parLevel ?? 0, pace(logs, now), now);
}

export function daysUntil(date?: string | null, now = new Date()): number | null {
  if (!date) return null;
  const t = new Date(date.length <= 10 ? date + "T00:00:00" : date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now.getTime()) / DAY);
}

/** Samples expire hard and have to come off the shelf. */
export const EXPIRY_WARN_DAYS = 60;
export type ExpiryStatus = "expired" | "expiring" | "ok" | "unknown";

export function expiry(sample: MedSample, now = new Date()): { status: ExpiryStatus; days: number | null } {
  const days = daysUntil(sample.expirationDate, now);
  if (days === null) return { status: "unknown", days: null };
  if (days < 0) return { status: "expired", days };
  if (days <= EXPIRY_WARN_DAYS) return { status: "expiring", days };
  return { status: "ok", days };
}

/**
 * How many units to ask the rep for: enough to cover `coverDays` at the current
 * pace, less what is already on the shelf. Null when pace is unmeasured,
 * because guessing a quantity is worse than letting a human decide.
 */
export function suggestedRequest(sample: MedSample, logs: MedSampleLog[], coverDays = 60, now = new Date()): number | null {
  const p = pace(logs, now);
  if (p.basis !== "measured") return null;
  const need = p.perDayPlanning * coverDays - (sample.quantityOnHand ?? 0);
  return need > 0 ? Math.ceil(need) : 0;
}

/** A ready-to-send restock request. Nothing is sent automatically. */
export function restockMessage(sample: MedSample, rep: DrugRep | undefined, qty: number | null, siteName?: string): string {
  const who = rep?.name ? rep.name.split(" ")[0] : "there";
  const what = [sample.name, sample.strength].filter(Boolean).join(" ");
  const amount = qty && qty > 0 ? unitCount(qty, sample.unit) : "a resupply";
  const where = siteName ? ` for our ${siteName} office` : "";
  return `Hi ${who},\n\nWe're running low on ${what} samples${where} and would like to request ${amount} when convenient.\n\nThank you,\nLone Peak Psychiatry`;
}

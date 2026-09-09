import type { MedSample, MedSampleLog, DrugRep } from "@/lib/data/schema";

/**
 * Medication samples — pace, runway and restock.
 *
 * The whole point of this module is the question "will we run out this week?",
 * and the honest answer depends on how much dispensing history exists. A rate
 * computed from a single event is not a rate, so this deliberately returns
 * "unknown" rather than a confident-looking number it cannot support.
 */

const DAY = 86_400_000;

/** Longest window we average over. Beyond this, old pace stops being relevant. */
const MAX_WINDOW_DAYS = 90;
/** Shortest window we will average over — below this a couple of busy days
 *  would dominate and produce a wild rate. */
const MIN_WINDOW_DAYS = 14;
/** One dispense tells you nothing about pace; two over time is the minimum. */
const MIN_EVENTS = 2;
/** "Running out soon" threshold, per the requirement. */
export const RUNWAY_CRITICAL_DAYS = 7;
export const RUNWAY_WATCH_DAYS = 14;
/** Samples expire hard and have to come off the shelf. */
export const EXPIRY_WARN_DAYS = 60;

/**
 * Pluralise a stocking unit. "box" -> "boxes", and "each" is already plural —
 * naive +"s" produced "boxs", which is the kind of thing staff notice.
 */
export function unitLabel(n: number, unit: string): string {
  if (n === 1) return unit;
  const u = unit.toLowerCase();
  if (u === "each") return unit;
  if (/(s|x|z|ch|sh)$/.test(u)) return `${unit}es`;
  if (/[^aeiou]y$/.test(u)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}

export function unitCount(n: number, unit: string): string {
  return `${n} ${unitLabel(n, unit)}`;
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY;
}

export function daysUntil(date?: string | null, now = new Date()): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(daysBetween(now, d));
}

/** The event date, falling back to when the row was written. */
function eventDate(l: MedSampleLog): Date {
  return new Date(l.occurredAt ?? l.createdDate);
}

export type PaceBasis = "measured" | "insufficient_history" | "no_usage";

export interface Pace {
  basis: PaceBasis;
  /** Units per day. 0 when not measured. */
  perDay: number;
  perWeek: number;
  /** Days of dispensing history the rate was computed over. */
  windowDays: number;
  /** How many dispense events informed it. */
  events: number;
  /** Total units dispensed inside the window. */
  dispensed: number;
}

/**
 * Average daily dispensing, measured from the ledger.
 *
 * Denominator is the window length rather than the span between the first and
 * last dispense, so a product that was used heavily and then went quiet shows a
 * falling rate instead of staying pinned at its busiest week.
 */
export function pace(logs: MedSampleLog[], now = new Date()): Pace {
  const out = logs
    .filter((l) => l.action === "dispensed" && l.quantityDelta !== 0)
    .map((l) => ({ at: eventDate(l), qty: Math.abs(l.quantityDelta) }))
    .filter((e) => !Number.isNaN(e.at.getTime()) && e.at <= now)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (out.length === 0) {
    return { basis: "no_usage", perDay: 0, perWeek: 0, windowDays: 0, events: 0, dispensed: 0 };
  }

  const sinceFirst = daysBetween(out[0].at, now);
  const windowDays = Math.min(MAX_WINDOW_DAYS, Math.max(sinceFirst, MIN_WINDOW_DAYS));
  const cutoff = new Date(now.getTime() - windowDays * DAY);
  const inWindow = out.filter((e) => e.at >= cutoff);
  const dispensed = inWindow.reduce((s, e) => s + e.qty, 0);

  // Not enough to call it a pace: too few events, or the product is so new that
  // we are extrapolating from days rather than weeks.
  if (inWindow.length < MIN_EVENTS || sinceFirst < MIN_WINDOW_DAYS / 2) {
    return { basis: "insufficient_history", perDay: 0, perWeek: 0, windowDays, events: inWindow.length, dispensed };
  }
  if (dispensed <= 0) {
    return { basis: "no_usage", perDay: 0, perWeek: 0, windowDays, events: inWindow.length, dispensed: 0 };
  }

  const perDay = dispensed / windowDays;
  return { basis: "measured", perDay, perWeek: perDay * 7, windowDays, events: inWindow.length, dispensed };
}

export type StockStatus = "out" | "critical" | "watch" | "ok" | "unknown";

export interface Runway {
  status: StockStatus;
  /** Days of stock left at the measured pace. Null when pace is unknown. */
  daysLeft: number | null;
  /** Date stock is projected to reach zero. Null when pace is unknown. */
  runsOutOn: Date | null;
  pace: Pace;
  /** True when the simple par-level floor is breached, independent of pace. */
  belowPar: boolean;
}

export function runway(sample: MedSample, logs: MedSampleLog[], now = new Date()): Runway {
  const p = pace(logs, now);
  const qty = sample.quantityOnHand ?? 0;
  const belowPar = (sample.parLevel ?? 0) > 0 && qty <= (sample.parLevel ?? 0);

  if (qty <= 0) {
    return { status: "out", daysLeft: 0, runsOutOn: now, pace: p, belowPar };
  }
  if (p.basis !== "measured") {
    // No usable pace. Fall back to the par level so the row still says something.
    return { status: belowPar ? "critical" : "unknown", daysLeft: null, runsOutOn: null, pace: p, belowPar };
  }

  const daysLeft = qty / p.perDay;
  const status: StockStatus =
    daysLeft <= RUNWAY_CRITICAL_DAYS ? "critical" : daysLeft <= RUNWAY_WATCH_DAYS ? "watch" : "ok";
  return { status, daysLeft, runsOutOn: new Date(now.getTime() + daysLeft * DAY), pace: p, belowPar };
}

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
 * pace, less what is already on the shelf. Returns null when pace is unknown,
 * because guessing a quantity is worse than letting a human decide.
 */
export function suggestedRequest(sample: MedSample, logs: MedSampleLog[], coverDays = 60, now = new Date()): number | null {
  const p = pace(logs, now);
  if (p.basis !== "measured") return null;
  const need = p.perDay * coverDays - (sample.quantityOnHand ?? 0);
  return need > 0 ? Math.ceil(need) : 0;
}

/** Plain-English pace, e.g. "about 3 boxes a week". */
export function paceLabel(p: Pace, unit: string): string {
  if (p.basis === "no_usage") return "No dispensing recorded";
  if (p.basis === "insufficient_history") return "Not enough history yet";
  const w = p.perWeek;
  const u = (n: number) => unitCount(n, unit);
  if (w >= 1) return `about ${u(Math.round(w * 10) / 10)} a week`;
  const perMonth = p.perDay * 30;
  if (perMonth >= 1) return `about ${u(Math.round(perMonth * 10) / 10)} a month`;
  return "less than one a month";
}

/** A ready-to-send restock request. Nothing is sent automatically. */
export function restockMessage(sample: MedSample, rep: DrugRep | undefined, qty: number | null, siteName?: string): string {
  const who = rep?.name ? rep.name.split(" ")[0] : "there";
  const what = [sample.name, sample.strength].filter(Boolean).join(" ");
  const amount = qty && qty > 0 ? unitCount(qty, sample.unit) : "a resupply";
  const where = siteName ? ` for our ${siteName} office` : "";
  return `Hi ${who},\n\nWe're running low on ${what} samples${where} and would like to request ${amount} when convenient.\n\nThank you,\nLone Peak Psychiatry`;
}

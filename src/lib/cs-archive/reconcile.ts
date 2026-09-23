/**
 * Reconciling the paper logs.
 *
 * Two questions get asked of an old controlled-substance log, and they are not
 * the same question:
 *
 *   • VIAL BY VIAL — for each vial, does what went in account for what came
 *     out? A vial that was administered from before it was received, or that
 *     went past its own volume, is the kind of thing a DEA inspector finds.
 *   • THE PERIOD — does the closing balance written on the sheet equal the
 *     opening balance plus receipts minus what was administered and wasted?
 *     This catches a page that was mis-totalled or a page that is missing.
 *
 * Both run on the DE-IDENTIFIED entries the Hub holds: amounts, vials and
 * dates. No chart number is needed to balance a log, which is exactly why the
 * identifiers can stay in SharePoint.
 *
 * Nothing here decides anything. It reports differences for a person to look
 * at, and a difference is not automatically a discrepancy — a rounding
 * convention or a partial vial can explain one.
 */

import type { CsArchiveEntry } from "@/lib/data/schema";

/** Floating point: log amounts are written to 0.1 mL, so anything under this is noise. */
const EPSILON = 0.005;

export interface VialBalance {
  vialLabel: string;
  received: number;
  administered: number;
  wasted: number;
  destroyed: number;
  transferred: number;
  returned: number;
  /** received − (administered + wasted + destroyed + transferred + returned) */
  remaining: number;
  /** The last count written on the log for this vial, if one was ever taken. */
  countedRemaining: number | null;
  firstDate: string | null;
  lastDate: string | null;
  entryCount: number;
  issues: string[];
}

export interface PeriodTotals {
  opening: number | null;
  received: number;
  administered: number;
  wasted: number;
  /** opening + received − administered − wasted */
  expectedClosing: number | null;
  /** What the sheet says. */
  statedClosing: number | null;
  /** statedClosing − expectedClosing. Positive means more on hand than the maths allows. */
  difference: number | null;
  balances: boolean;
}

export interface Reconciliation {
  vials: VialBalance[];
  period: PeriodTotals;
  /** Rows too incomplete to count — no amount, or no vial. They are not ignored silently. */
  unusable: number;
  issues: string[];
}

const near = (a: number, b: number) => Math.abs(a - b) < EPSILON;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Sum a single action across entries. */
function sum(entries: CsArchiveEntry[], action: CsArchiveEntry["action"]): number {
  return round(entries.reduce((t, e) => (e.action === action && typeof e.amount === "number" ? t + e.amount : t), 0));
}

/**
 * Balance each vial on its own. Entries are read in date order where dates
 * exist, so "administered before received" can be spotted.
 */
export function reconcileVials(entries: CsArchiveEntry[]): VialBalance[] {
  const byVial = new Map<string, CsArchiveEntry[]>();
  for (const e of entries) {
    const label = (e.vialLabel ?? "").trim().toUpperCase();
    if (!label) continue;
    const list = byVial.get(label);
    if (list) list.push(e); else byVial.set(label, [e]);
  }

  const out: VialBalance[] = [];
  for (const [vialLabel, rows] of byVial) {
    const dated = [...rows].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
    const received = sum(rows, "received");
    const administered = sum(rows, "administered");
    const wasted = sum(rows, "wasted");
    const destroyed = sum(rows, "destroyed");
    const transferred = sum(rows, "transferred");
    const returned = sum(rows, "returned");
    const out_ = round(administered + wasted + destroyed + transferred + returned);
    const remaining = round(received - out_);

    const counts = dated.filter((e) => e.action === "count" && typeof e.amount === "number");
    const countedRemaining = counts.length ? (counts[counts.length - 1].amount as number) : null;

    const issues: string[] = [];
    if (received === 0 && out_ > 0) issues.push("used but never logged as received");
    // "used but never received" already says this; don't say it twice.
    else if (remaining < -EPSILON) issues.push(`more accounted for than received (over by ${Math.abs(remaining)})`);
    if (countedRemaining !== null && !near(countedRemaining, remaining)) {
      issues.push(`counted ${countedRemaining}, log implies ${remaining}`);
    }

    // Order of events: nothing should come out of a vial before it arrives.
    const firstReceipt = dated.find((e) => e.action === "received")?.date ?? null;
    if (firstReceipt) {
      const early = dated.find((e) => e.action !== "received" && e.date && e.date < firstReceipt);
      if (early) issues.push(`entry on ${early.date} predates the receipt on ${firstReceipt}`);
    }

    const dates = dated.map((e) => e.date).filter((d): d is string => !!d);
    out.push({
      vialLabel, received, administered, wasted, destroyed, transferred, returned,
      remaining, countedRemaining,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      entryCount: rows.length,
      issues,
    });
  }
  return out.sort((a, b) => a.vialLabel.localeCompare(b.vialLabel, undefined, { numeric: true }));
}

/**
 * Balance the period as a whole against the opening and closing figures
 * written on the sheet. Missing figures are reported as such, not guessed.
 */
export function reconcilePeriod(
  entries: CsArchiveEntry[],
  stated: { opening?: number | null; closing?: number | null },
): PeriodTotals {
  const opening = typeof stated.opening === "number" ? stated.opening : null;
  const closing = typeof stated.closing === "number" ? stated.closing : null;
  const received = sum(entries, "received");
  const administered = sum(entries, "administered");
  const wasted = sum(entries, "wasted");
  const expectedClosing = opening === null ? null : round(opening + received - administered - wasted);
  const difference = expectedClosing === null || closing === null ? null : round(closing - expectedClosing);
  return {
    opening, received, administered, wasted, expectedClosing, statedClosing: closing,
    difference,
    balances: difference !== null && near(difference, 0),
  };
}

/** Both views at once, plus what couldn't be counted. */
export function reconcile(
  entries: CsArchiveEntry[],
  stated: { opening?: number | null; closing?: number | null } = {},
): Reconciliation {
  const unusable = entries.filter((e) => typeof e.amount !== "number" || !(e.vialLabel ?? "").trim()).length;
  const vials = reconcileVials(entries);
  const period = reconcilePeriod(entries, stated);

  const issues: string[] = [];
  if (unusable > 0) issues.push(`${unusable} ${unusable === 1 ? "row is" : "rows are"} missing an amount or a vial — read them again before relying on these totals`);
  for (const v of vials) for (const i of v.issues) issues.push(`${v.vialLabel}: ${i}`);
  if (period.difference !== null && !period.balances) {
    issues.push(`period is off by ${period.difference > 0 ? "+" : ""}${period.difference} against the closing balance on the sheet`);
  }
  if (period.opening === null || period.statedClosing === null) {
    issues.push("no opening or closing balance entered — only the vial-by-vial view is meaningful");
  }
  return { vials, period, unusable, issues };
}

/** True when a reconciliation is clean enough to sign off. */
export function reconciles(r: Reconciliation): boolean {
  return r.unusable === 0 && r.vials.every((v) => v.issues.length === 0) && r.period.balances;
}

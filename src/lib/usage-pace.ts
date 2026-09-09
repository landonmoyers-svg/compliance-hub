/**
 * How fast stock is being consumed — and how much to trust that number.
 *
 * A flat average over all history is wrong in two directions at once: it reacts
 * too slowly when usage changes, and it presents a number from three data points
 * with the same confidence as one from thirty. This engine fixes both, and is
 * shared by medical supplies and medication samples so a "days left" figure
 * means the same thing everywhere in the app.
 *
 * Two mechanisms make it improve as data accumulates:
 *
 *   1. RECENCY WEIGHTING. Usage is bucketed by week and weighted with a 4-week
 *      half-life, so a product whose use has doubled reflects that within a
 *      couple of weeks instead of being dragged down by months of old averages.
 *
 *   2. A SAFETY MARGIN THAT SHRINKS. The runway is planned against
 *      `perDayPlanning = weighted mean + k x standard error`, where k falls as
 *      evidence grows (1.5 -> 0.8 -> 0.35). Early on, with a couple of noisy
 *      weeks, the planning rate sits well above the mean and warns early. As
 *      weeks accumulate and the standard error falls, the planning rate
 *      converges on the true mean. The forecast tightens on its own.
 */

const DAY = 86_400_000;
const BUCKET_DAYS = 7;
const MAX_BUCKETS = 12;          // ~3 months of weekly buckets
const HALF_LIFE_BUCKETS = 4;     // recent 4 weeks carry half the weight
const MIN_EVENTS = 2;
const MIN_SPAN_DAYS = 7;

export interface UsageEvent {
  at: Date;
  /** Units consumed. Always positive — receipts are not usage. */
  qty: number;
}

export type PaceBasis = "measured" | "insufficient_history" | "no_usage";
export type Confidence = "learning" | "fair" | "good" | "strong";
export type Trend = "rising" | "steady" | "falling";

export interface PaceEstimate {
  basis: PaceBasis;
  /** Recency-weighted best estimate of units consumed per day. */
  perDay: number;
  /** The rate the runway is planned against: perDay plus a shrinking margin. */
  perDayPlanning: number;
  perWeek: number;
  confidence: Confidence;
  trend: Trend;
  /** Weeks that actually contained data — what the estimate rests on. */
  weeksObserved: number;
  events: number;
  spanDays: number;
  totalUsed: number;
  /** Spread between weeks, as a fraction of the mean. High = erratic usage. */
  variability: number;
}

const EMPTY: PaceEstimate = {
  basis: "no_usage", perDay: 0, perDayPlanning: 0, perWeek: 0,
  confidence: "learning", trend: "steady", weeksObserved: 0,
  events: 0, spanDays: 0, totalUsed: 0, variability: 0,
};

/** How much padding to add per unit of standard error, by confidence. */
function marginFor(c: Confidence): number {
  switch (c) {
    case "strong": return 0.35;
    case "good": return 0.8;
    case "fair": return 1.5;
    default: return 1.5;
  }
}

function gradeConfidence(weeksObserved: number, events: number, spanDays: number): Confidence {
  if (weeksObserved >= 8 && events >= 8 && spanDays >= 56) return "strong";
  if (weeksObserved >= 4 && events >= 4 && spanDays >= 28) return "good";
  if (weeksObserved >= 2 && events >= MIN_EVENTS && spanDays >= MIN_SPAN_DAYS) return "fair";
  return "learning";
}

export function estimatePace(events: UsageEvent[], now = new Date()): PaceEstimate {
  const used = events
    .filter((e) => e.qty > 0 && !Number.isNaN(e.at.getTime()) && e.at <= now)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (used.length === 0) return EMPTY;

  const first = used[0].at;
  const spanDays = Math.max(0, (now.getTime() - first.getTime()) / DAY);
  const totalUsed = used.reduce((s, e) => s + e.qty, 0);

  if (used.length < MIN_EVENTS || spanDays < MIN_SPAN_DAYS) {
    return { ...EMPTY, basis: "insufficient_history", confidence: "learning",
             events: used.length, spanDays, totalUsed };
  }

  // Bucket by week counting back from now. Bucket 0 is the current week.
  // +1 because bucket 0 is the current week: an event exactly `spanDays` old
  // sits in bucket floor(span/7), which must be inside the range.
  const bucketsCovered = Math.min(MAX_BUCKETS, Math.floor(spanDays / BUCKET_DAYS) + 1);
  const totals = new Array(bucketsCovered).fill(0) as number[];
  for (const e of used) {
    const idx = Math.floor((now.getTime() - e.at.getTime()) / (BUCKET_DAYS * DAY));
    if (idx >= 0 && idx < bucketsCovered) totals[idx] += e.qty;
  }

  // Weekly rates, most recent first. Zero weeks are real information (nothing
  // was used) and are kept, as long as they fall inside the observed span.
  const rates = totals.map((t) => t / BUCKET_DAYS);
  const weeksObserved = totals.filter((t) => t > 0).length;

  // Recency-weighted mean: exponential decay by bucket age.
  let wSum = 0, wRate = 0;
  rates.forEach((r, i) => {
    const w = Math.pow(0.5, i / HALF_LIFE_BUCKETS);
    wSum += w; wRate += w * r;
  });
  const perDay = wSum > 0 ? wRate / wSum : 0;

  if (perDay <= 0 || totalUsed <= 0) {
    return { ...EMPTY, basis: "no_usage", events: used.length, spanDays, totalUsed };
  }

  // Spread between weeks -> standard error of the mean.
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const variance = rates.length > 1
    ? rates.reduce((s, r) => s + (r - mean) ** 2, 0) / (rates.length - 1)
    : 0;
  const sd = Math.sqrt(variance);
  const stdErr = rates.length > 0 ? sd / Math.sqrt(rates.length) : 0;
  const variability = mean > 0 ? sd / mean : 0;

  const confidence = gradeConfidence(weeksObserved, used.length, spanDays);
  const perDayPlanning = perDay + marginFor(confidence) * stdErr;

  // Trend: recent half against older half. Halves rather than thirds because a
  // single quiet week is common and shouldn't flip the reading on its own.
  const recentCount = Math.max(1, Math.floor(rates.length / 2));
  const recent = rates.slice(0, recentCount);
  const older = rates.slice(recentCount);
  const avg = (a: number[]) => (a.length ? a.reduce((s, r) => s + r, 0) / a.length : 0);
  const rNew = avg(recent), rOld = avg(older);
  const trend: Trend = older.length === 0 || rOld === 0
    ? "steady"
    : rNew > rOld * 1.25 ? "rising" : rNew < rOld * 0.75 ? "falling" : "steady";

  return {
    basis: "measured", perDay, perDayPlanning, perWeek: perDay * 7,
    confidence, trend, weeksObserved, events: used.length, spanDays, totalUsed, variability,
  };
}

/** Why the estimate is trusted as much as it is — shown to the user. */
export function confidenceNote(p: PaceEstimate): string {
  if (p.basis === "no_usage") return "No usage recorded yet.";
  if (p.basis === "insufficient_history") {
    return `Learning — ${p.events} ${p.events === 1 ? "entry" : "entries"} so far. A week or two of recording gives a usable rate.`;
  }
  const weeks = `${p.weeksObserved} ${p.weeksObserved === 1 ? "week" : "weeks"} of usage`;
  switch (p.confidence) {
    case "strong": return `Strong — based on ${weeks}. The forecast has settled.`;
    case "good": return `Good — based on ${weeks}. Still tightening as more is recorded.`;
    default: return `Early estimate — based on ${weeks}, so the warning errs on the cautious side.`;
  }
}

export function trendNote(p: PaceEstimate): string | null {
  if (p.basis !== "measured" || p.trend === "steady") return null;
  return p.trend === "rising" ? "Use is rising" : "Use is slowing";
}

/* ───────────────────────── runway & formatting ───────────────────────── */

export type StockStatus = "out" | "critical" | "watch" | "ok" | "unknown";

/** "Running out soon" — the threshold the warning is built around. */
export const RUNWAY_CRITICAL_DAYS = 7;
export const RUNWAY_WATCH_DAYS = 14;

export interface Runway {
  status: StockStatus;
  /** Days of stock left at the PLANNING rate. Null when pace is unmeasured. */
  daysLeft: number | null;
  /** Days left at the central estimate — the optimistic end of the range. */
  daysLeftBest: number | null;
  runsOutOn: Date | null;
  pace: PaceEstimate;
  belowPar: boolean;
}

/**
 * Days of cover. Planned against the conservative rate so a thin history warns
 * early; as confidence grows the two converge and the warning sharpens.
 */
export function runwayFrom(
  quantityOnHand: number, parLevel: number, pace: PaceEstimate, now = new Date(),
): Runway {
  const qty = quantityOnHand ?? 0;
  const belowPar = (parLevel ?? 0) > 0 && qty <= (parLevel ?? 0);

  if (qty <= 0) {
    return { status: "out", daysLeft: 0, daysLeftBest: 0, runsOutOn: now, pace, belowPar };
  }
  if (pace.basis !== "measured" || pace.perDayPlanning <= 0) {
    return { status: belowPar ? "critical" : "unknown", daysLeft: null, daysLeftBest: null, runsOutOn: null, pace, belowPar };
  }

  const daysLeft = qty / pace.perDayPlanning;
  const daysLeftBest = pace.perDay > 0 ? qty / pace.perDay : null;
  const status: StockStatus =
    daysLeft <= RUNWAY_CRITICAL_DAYS ? "critical" : daysLeft <= RUNWAY_WATCH_DAYS ? "watch" : "ok";
  return { status, daysLeft, daysLeftBest, runsOutOn: new Date(now.getTime() + daysLeft * DAY), pace, belowPar };
}

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

/** Plain-English pace, e.g. "about 3 boxes a week". */
export function paceLabel(p: PaceEstimate, unit: string): string {
  if (p.basis === "no_usage") return "No usage recorded";
  if (p.basis === "insufficient_history") return "Learning usage";
  const round = (n: number) => Math.round(n * 10) / 10;
  if (p.perWeek >= 1) return `about ${unitCount(round(p.perWeek), unit)} a week`;
  const perMonth = p.perDay * 30;
  if (perMonth >= 1) return `about ${unitCount(round(perMonth), unit)} a month`;
  return "less than one a month";
}

/** How many to order for `coverDays` of stock. Null when pace is unmeasured. */
export function suggestedOrder(
  quantityOnHand: number, pace: PaceEstimate, coverDays = 60,
): number | null {
  if (pace.basis !== "measured") return null;
  const need = pace.perDayPlanning * coverDays - (quantityOnHand ?? 0);
  return need > 0 ? Math.ceil(need) : 0;
}

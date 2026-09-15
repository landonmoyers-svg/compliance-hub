import { RUNWAY_WATCH_DAYS, type PaceEstimate } from "@/lib/usage-pace";

/**
 * Lot-level stock: what to use first, what will expire before it's used, and
 * how much to order.
 *
 * These answers only exist at the lot level. A product row with one expiry date
 * can't tell you that the box of 10 expiring in October will be half wasted at
 * your current pace while the box behind it is fine — and receiving a new box
 * used to overwrite the old box's expiry entirely.
 *
 * Rates. Two different rates from the pace engine are used on purpose:
 *  - WASTE is projected at the central estimate (`perDay`). Projecting it at the
 *    padded planning rate would assume faster use than is likely and understate
 *    what will expire.
 *  - RUNWAY and ORDER SIZE use the padded `perDayPlanning`, so a thin history
 *    warns and orders on the cautious side. See usage-pace.ts.
 */

const DAY = 86_400_000;

/** Below this many units a projected waste is treated as rounding noise. */
const WASTE_NOISE_UNITS = 1;
export const EXPIRY_SOON_DAYS = 45;
export const DEFAULT_LEAD_TIME_DAYS = 7;
export const DEFAULT_TARGET_COVER_DAYS = 30;
/** An order marked placed but not received after this long gets flagged. */
export const ORDER_OVERDUE_DAYS = 21;

export interface LotLike {
  id: string;
  lotNumber?: string | null;
  expirationDate?: string | null;
  quantityRemaining: number;
  receivedAt?: string | null;
  createdDate?: string;
}

function parseDay(date?: string | null): number | null {
  if (!date) return null;
  const t = new Date(date.length <= 10 ? `${date}T00:00:00` : date).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Whole calendar days until a lot's expiry date: 0 on the expiry day itself,
 * negative only once that date has passed.
 *
 * Calendar days, not timestamps. Comparing expiry-at-midnight with the current
 * time made an item on its expiry day come out at -0.5 -> -1 -> "expired" while
 * it was still in date, so the last good day's stock was refused. Math.round
 * absorbs 23/25-hour DST days.
 */
export function daysToExpiry(lot: Pick<LotLike, "expirationDate">, now = new Date()): number | null {
  const t = parseDay(lot.expirationDate);
  if (t === null) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const exp = new Date(t);
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate()).getTime();
  return Math.round((expDay - today) / DAY);
}

/** First-expired, first-out. Lots with no expiry go last; ties by oldest receipt. */
export function fefoOrder<T extends LotLike>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const ea = parseDay(a.expirationDate), eb = parseDay(b.expirationDate);
    if (ea !== eb) {
      if (ea === null) return 1;
      if (eb === null) return -1;
      return ea - eb;
    }
    const ra = parseDay(a.receivedAt ?? a.createdDate) ?? 0;
    const rb = parseDay(b.receivedAt ?? b.createdDate) ?? 0;
    return ra - rb;
  });
}

export interface Allocation<T extends LotLike> {
  takes: { lot: T; take: number }[];
  /** Units requested that no in-date lot could cover. */
  shortfall: number;
  /** Expired lots passed over — these should be pulled, not used. */
  skippedExpired: T[];
}

/**
 * Take `qty` from stock, soonest-expiring first. Expired lots are never drawn
 * from: expired supplies shouldn't reach a patient, so they're reported back to
 * be pulled instead of silently consumed.
 */
export function allocateUse<T extends LotLike>(lots: T[], qty: number, now = new Date()): Allocation<T> {
  const takes: { lot: T; take: number }[] = [];
  const skippedExpired: T[] = [];
  let left = Math.max(0, qty);
  for (const lot of fefoOrder(lots.filter((l) => l.quantityRemaining > 0))) {
    const d = daysToExpiry(lot, now);
    if (d !== null && d < 0) { skippedExpired.push(lot); continue; }
    if (left <= 0) continue;
    const take = Math.min(left, lot.quantityRemaining);
    takes.push({ lot, take });
    left -= take;
  }
  return { takes, shortfall: left, skippedExpired };
}

export type LotStatus = "expired" | "at_risk" | "soon" | "ok" | "no_expiry";

export interface LotProjection<T extends LotLike> {
  lot: T;
  daysToExpiry: number | null;
  status: LotStatus;
  /** Days until this lot is expected to be started. Null without a pace. */
  startsInDays: number | null;
  /** Units expected to be used before expiry. Null without a pace. */
  projectedUsed: number | null;
  /** Units expected to expire unused. Null without a pace (except expired lots). */
  projectedWaste: number | null;
}

export interface ExpiryPlan<T extends LotLike> {
  basis: "projected" | "dates_only";
  lots: LotProjection<T>[];
  onHand: number;
  /** Already past expiry — unusable now. */
  expiredUnits: number;
  /** Still in date but expected to expire before use. Null without a pace. */
  projectedWaste: number | null;
  /** Stock that will actually get used: on hand, less expired and projected waste. */
  usableOnHand: number;
  /** The lot to act on first, if any: expired, else the soonest at risk. */
  firstAction: LotProjection<T> | null;
}

/**
 * Walk lots in FEFO order at the current pace. Time only advances by units
 * actually used — a lot that expires part-way through is abandoned at its
 * expiry, and the next lot starts then.
 */
export function projectExpiry<T extends LotLike>(lots: T[], pace: PaceEstimate, now = new Date(), soonDays = EXPIRY_SOON_DAYS): ExpiryPlan<T> {
  const active = fefoOrder(lots.filter((l) => l.quantityRemaining > 0));
  const onHand = active.reduce((s, l) => s + l.quantityRemaining, 0);
  const rate = pace.basis === "measured" ? pace.perDay : 0;
  const projected = rate > 0;

  const out: LotProjection<T>[] = [];
  let expiredUnits = 0;
  let waste = 0;
  let t = 0;

  for (const lot of active) {
    const d = daysToExpiry(lot, now);
    const q = lot.quantityRemaining;

    if (d !== null && d < 0) {
      expiredUnits += q;
      out.push({ lot, daysToExpiry: d, status: "expired", startsInDays: null, projectedUsed: 0, projectedWaste: q });
      continue;
    }

    if (!projected) {
      const status: LotStatus = d === null ? "no_expiry" : d <= soonDays ? "soon" : "ok";
      out.push({ lot, daysToExpiry: d, status, startsInDays: null, projectedUsed: null, projectedWaste: null });
      continue;
    }

    // A lot expiring in d days is treated as usable for d days — i.e. used up
    // *before* its expiry date, which is how staff are told to rotate stock.
    const startsInDays = t;
    let used: number;
    if (d === null) {
      used = q;
    } else {
      used = Math.min(q, Math.max(0, d - t) * rate);
    }
    let lotWaste = q - used;
    if (lotWaste < WASTE_NOISE_UNITS) { lotWaste = 0; used = q; }
    t += used / rate;
    waste += lotWaste;

    const status: LotStatus =
      d === null ? "no_expiry" : lotWaste > 0 ? "at_risk" : d <= soonDays ? "soon" : "ok";
    out.push({ lot, daysToExpiry: d, status, startsInDays, projectedUsed: used, projectedWaste: lotWaste });
  }

  const usableOnHand = Math.max(0, onHand - expiredUnits - (projected ? waste : 0));
  const firstAction =
    out.find((p) => p.status === "expired") ??
    out.find((p) => p.status === "at_risk") ??
    null;

  return {
    basis: projected ? "projected" : "dates_only",
    lots: out,
    onHand,
    expiredUnits,
    projectedWaste: projected ? waste : null,
    usableOnHand,
    firstAction,
  };
}

/**
 * Typical shelf life at delivery, learned from what has actually been received:
 * the median of (expiry − received) across past lots. It sharpens as deliveries
 * accumulate, and is what stops an order being sized larger than can be used
 * before the new lot expires.
 */
export function learnedShelfLifeDays(lots: LotLike[]): { days: number; samples: number } | null {
  const spans = lots
    .map((l) => {
      const e = parseDay(l.expirationDate), r = parseDay(l.receivedAt ?? l.createdDate);
      return e !== null && r !== null ? (e - r) / DAY : null;
    })
    .filter((d): d is number => d !== null && d > 0)
    .sort((a, b) => a - b);
  if (spans.length === 0) return null;
  const mid = Math.floor(spans.length / 2);
  const median = spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2;
  return { days: Math.round(median), samples: spans.length };
}

export interface OrderInput {
  lots: LotLike[];
  pace: PaceEstimate;
  parLevel?: number | null;
  leadTimeDays?: number | null;
  targetCoverDays?: number | null;
  packSize?: number | null;
  pendingOrderQty?: number | null;
  /** The product's usual order quantity — a fallback when pace can't size it. */
  usualOrderQty?: number | null;
  now?: Date;
}

export interface OrderRecommendation {
  /** True when stock is low enough that an order should go in. */
  needed: boolean;
  qty: number | null;
  basis: "pace" | "usual" | "none";
  /** Plain-English working, shown to the user. */
  reasons: string[];
  capped: boolean;
  leadTimeDays: number;
  targetCoverDays: number;
  usableOnHand: number;
  pending: number;
  shelfLife: { days: number; samples: number } | null;
}

export function recommendOrder(input: OrderInput): OrderRecommendation {
  const now = input.now ?? new Date();
  const { pace } = input;
  const leadTimeDays = input.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  const targetCoverDays = input.targetCoverDays ?? DEFAULT_TARGET_COVER_DAYS;
  const pack = input.packSize && input.packSize > 0 ? input.packSize : 1;
  const pending = Math.max(0, input.pendingOrderQty ?? 0);
  const par = input.parLevel ?? 0;

  const plan = projectExpiry(input.lots, pace, now);
  const usable = plan.usableOnHand;
  const shelfLife = learnedShelfLifeDays(input.lots);
  const belowPar = par > 0 && usable + pending <= par;
  const base = { leadTimeDays, targetCoverDays, usableOnHand: usable, pending, shelfLife };

  if (pace.basis === "measured" && pace.perDayPlanning > 0) {
    const coverDays = (usable + pending) / pace.perDayPlanning;
    const needed = coverDays <= leadTimeDays + RUNWAY_WATCH_DAYS || belowPar;
    const reasons: string[] = [];
    const demand = pace.perDayPlanning * (leadTimeDays + targetCoverDays);
    reasons.push(`Covering ${leadTimeDays} days until it arrives plus ${targetCoverDays} days of use ≈ ${round1(demand)} needed.`);
    if (plan.expiredUnits > 0 || (plan.projectedWaste ?? 0) > 0) {
      reasons.push(`Counting ${round1(usable)} usable on hand — ${round1(plan.onHand - usable)} won't be used before expiry, so they don't count.`);
    } else {
      reasons.push(`${round1(usable)} on hand.`);
    }
    if (pending > 0) reasons.push(`${round1(pending)} already on order.`);

    const raw = demand - usable - pending;
    if (raw <= 0) {
      return { ...base, needed, qty: 0, basis: "pace", reasons: [...reasons, "Nothing more is needed yet."], capped: false };
    }
    let qty = Math.ceil(raw / pack) * pack;
    if (pack > 1) reasons.push(`Rounded up to whole packs of ${pack}.`);

    let capped = false;
    if (shelfLife && pace.perDay > 0) {
      // The new lot starts being used once usable stock runs out (or on arrival,
      // whichever is later), and expires shelfLife days after it arrives.
      const startUse = Math.max(leadTimeDays, usable / pace.perDay);
      const window = leadTimeDays + shelfLife.days - startUse;
      const cap = Math.floor(pace.perDay * Math.max(0, window));
      if (qty > cap) {
        capped = true;
        const packs = Math.floor(cap / pack) * pack;
        qty = packs >= pack ? packs : pack;
        reasons.push(
          packs >= pack
            ? `Capped at ${qty}: deliveries usually last about ${shelfLife.days} days, so more would likely expire first.`
            : `Even one pack may partly expire — deliveries usually last about ${shelfLife.days} days at this pace.`,
        );
      }
    }
    return { ...base, needed, qty, basis: "pace", reasons, capped };
  }

  const out = usable <= 0;
  if ((belowPar || out) && input.usualOrderQty && input.usualOrderQty > 0) {
    return {
      ...base, needed: true, qty: input.usualOrderQty, basis: "usual", capped: false,
      reasons: ["Not enough usage recorded yet to size an order from pace — this is your usual order quantity."],
    };
  }
  if (belowPar || out) {
    return {
      ...base, needed: true, qty: null, basis: "none", capped: false,
      reasons: ["Not enough usage recorded yet to size an order. Record use for a week or two and a quantity will be suggested."],
    };
  }
  return { ...base, needed: false, qty: null, basis: "none", capped: false, reasons: [] };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * An order link that is safe to render as an href: http(s) only. Anything else
 * (javascript:, data:, a bare string) returns null. The database enforces the
 * same rule.
 */
export function safeOrderUrl(value?: string | null): string | null {
  const v = (value ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** A web search to find the product page the first time, before a link is saved. */
export function productSearchUrl(name: string, vendor?: string | null, sku?: string | null): string {
  const q = [vendor, sku, name].filter((s) => s && s.trim()).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Has an order been sitting "placed" long enough to chase? */
export function orderOverdue(lastOrderedAt?: string | null, now = new Date()): number | null {
  const t = parseDay(lastOrderedAt);
  if (t === null) return null;
  const days = Math.floor((now.getTime() - t) / DAY);
  return days >= ORDER_OVERDUE_DAYS ? days : null;
}

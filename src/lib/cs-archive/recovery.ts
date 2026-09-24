/**
 * Working out what's still missing.
 *
 * Reconstructing controlled-substance records is weeks of requests and
 * replies, and the useful question throughout isn't "what have we got" — it's
 * "what have we still got nothing for". That's a gap calculation: take the
 * span a registration was in use, subtract everything covered, and whatever is
 * left is the list of things to chase.
 *
 * Only RECOVERED spans count as covered. A period that has been requested from
 * a distributor but hasn't arrived is still a gap — it is simply a gap someone
 * is already working on. Treating a request as coverage is how a
 * reconstruction quietly declares itself finished while holding nothing.
 */

import type { RecordRecoveryItem } from "@/lib/data/schema";

export interface Span { start: string; end: string }

const day = 86_400_000;
const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Merge overlapping or touching spans into the fewest that cover the same days. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans]
    .filter((s) => s.start && s.end && toDate(s.end) >= toDate(s.start))
    .sort((a, b) => a.start.localeCompare(b.start));

  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    // Touching counts as overlapping: a span ending on the 3rd and one
    // starting on the 4th leave no day uncovered between them.
    if (last && toDate(s.start) <= toDate(last.end) + day) {
      if (toDate(s.end) > toDate(last.end)) last.end = s.end;
    } else {
      out.push({ start: s.start, end: s.end });
    }
  }
  return out;
}

/** The parts of `whole` that `covered` doesn't reach. */
export function gapsIn(whole: Span, covered: Span[]): Span[] {
  if (toDate(whole.end) < toDate(whole.start)) return [];
  const gaps: Span[] = [];
  let cursor = toDate(whole.start);

  for (const s of mergeSpans(covered)) {
    const start = toDate(s.start);
    const end = toDate(s.end);
    if (end < cursor) continue;                 // entirely before what's left
    if (start > toDate(whole.end)) break;       // entirely after
    if (start > cursor) gaps.push({ start: toIso(cursor), end: toIso(Math.min(start - day, toDate(whole.end))) });
    cursor = Math.max(cursor, end + day);
    if (cursor > toDate(whole.end)) break;
  }
  if (cursor <= toDate(whole.end)) gaps.push({ start: toIso(cursor), end: whole.end });
  return gaps;
}

export interface RecoveryPicture {
  /** The span that should be covered: from the registration taking effect to its end. */
  whole: Span | null;
  recovered: Span[];
  /** Requested but not yet arrived — still gaps, just ones being chased. */
  inFlight: Span[];
  gaps: Span[];
  /** 0–1. Null when the registration has no start date to measure against. */
  coverage: number | null;
}

const days = (s: Span) => Math.round((toDate(s.end) - toDate(s.start)) / day) + 1;
const total = (spans: Span[]) => spans.reduce((n, s) => n + days(s), 0);

/**
 * What is and isn't covered for one registration and one kind of record.
 *
 * `until` is normally today: a registration still in use has to be accounted
 * for up to now, not up to the last thing anybody filed.
 */
export function recoveryPicture(
  items: RecordRecoveryItem[],
  registration: { recordsFrom?: string | null; effectiveFrom?: string | null; retiredOn?: string | null },
  until: string,
): RecoveryPicture {
  // Measured from when THIS practice's records under the number begin, not
  // from the current renewal term. A registration on its third term has
  // records going back two renewals, and measuring from the certificate would
  // quietly put those years outside the window so they never show up as gaps.
  const start = (registration.recordsFrom ?? registration.effectiveFrom)?.slice(0, 10);
  if (!start) return { whole: null, recovered: [], inFlight: [], gaps: [], coverage: null };

  const end = (registration.retiredOn?.slice(0, 10) ?? until);
  const whole: Span = { start, end: end < start ? start : end };

  const span = (i: RecordRecoveryItem): Span => ({ start: i.periodStart.slice(0, 10), end: i.periodEnd.slice(0, 10) });
  const recovered = mergeSpans(items.filter((i) => i.status === "recovered").map(span));
  const inFlight = mergeSpans(items.filter((i) => i.status === "requested").map(span));

  // A span marked not applicable is not a hole — there was nothing to keep.
  const notApplicable = items.filter((i) => i.status === "not_applicable").map(span);
  const gaps = gapsIn(whole, [...recovered, ...notApplicable]);

  return {
    whole,
    recovered,
    inFlight,
    gaps,
    coverage: days(whole) > 0 ? Math.min(1, total([...recovered, ...notApplicable]) / days(whole)) : null,
  };
}

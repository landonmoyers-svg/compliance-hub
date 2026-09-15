import {
  fefoOrder, allocateUse, projectExpiry, learnedShelfLifeDays, recommendOrder,
  safeOrderUrl, productSearchUrl, orderOverdue, type LotLike,
} from "../stock-lots";
import type { PaceEstimate } from "../usage-pace";

const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = 86_400_000;
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString().slice(0, 10);
const agoIso = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const lot = (id: string, qty: number, expDays: number | null, receivedAgo = 10): LotLike =>
  ({ id, quantityRemaining: qty, expirationDate: expDays === null ? null : inDays(expDays), receivedAt: agoIso(receivedAgo) });

/** A measured pace with an explicit central and planning rate — isolates the lot maths. */
const measured = (perDay: number, planning = perDay): PaceEstimate => ({
  basis: "measured", perDay, perDayPlanning: planning, perWeek: perDay * 7,
  confidence: "good", trend: "steady", weeksObserved: 6, events: 12, spanDays: 42, totalUsed: perDay * 42, variability: 0.2,
});
const unmeasured: PaceEstimate = {
  basis: "insufficient_history", perDay: 0, perDayPlanning: 0, perWeek: 0,
  confidence: "learning", trend: "steady", weeksObserved: 0, events: 1, spanDays: 3, totalUsed: 2, variability: 0,
};

/* ── first-expired, first-out ── */
chk("FEFO: soonest first, no-expiry last",
  fefoOrder([lot("late", 1, 90), lot("none", 1, null), lot("soon", 1, 10)]).map((l) => l.id),
  ["soon", "late", "none"]);
chk("FEFO: same expiry -> oldest receipt first",
  fefoOrder([lot("newer", 1, 30, 2), lot("older", 1, 30, 20)]).map((l) => l.id),
  ["older", "newer"]);

const a1 = allocateUse([lot("late", 10, 90), lot("soon", 3, 10)], 5, NOW);
chk("use draws the soonest lot first, then the next",
  a1.takes.map((t) => [t.lot.id, t.take]), [["soon", 3], ["late", 2]]);
chk("no shortfall when stock covers it", a1.shortfall, 0);

const a2 = allocateUse([lot("expired", 20, -3), lot("good", 4, 30)], 6, NOW);
chk("expired lots are never drawn from", a2.takes.map((t) => t.lot.id), ["good"]);
chk("expired lot is reported to pull", a2.skippedExpired.map((l) => l.id), ["expired"]);
chk("shortfall when in-date stock runs out", a2.shortfall, 2);

/* ── expiry is a calendar day ── */
const onExpiryDay = allocateUse([lot("today", 5, 0)], 2, NOW);
chk("stock on its expiry day is still usable", onExpiryDay.takes.map((t) => t.lot.id), ["today"]);
chk("…and is not reported as expired", onExpiryDay.skippedExpired.length, 0);
chk("the day after, it is expired", allocateUse([lot("yday", 5, -1)], 2, NOW).skippedExpired.length, 1);

/* ── expiry projection ── */
const noPace = projectExpiry([lot("exp", 2, -1), lot("soon", 4, 20), lot("ok", 6, 200), lot("none", 3, null)], unmeasured, NOW);
chk("without pace: dates only", noPace.basis, "dates_only");
chk("without pace: statuses by date", noPace.lots.map((p) => p.status), ["expired", "soon", "ok", "no_expiry"]);
chk("without pace: no waste guessed for in-date stock", noPace.projectedWaste, null);
chk("without pace: expired stock still excluded from usable", noPace.usableOnHand, 13);

// 1/day. Lot A: 12 units expiring in 5 days -> only 5 get used, 7 expire.
// Lot B starts on day 5, expires day 8 -> 3 used, 7 expire.
const partial = projectExpiry([lot("A", 12, 5), lot("B", 10, 8), lot("C", 6, 400)], measured(1), NOW);
chk("projected", partial.basis, "projected");
chk("lot A: 5 used, 7 wasted", [partial.lots[0].projectedUsed, partial.lots[0].projectedWaste], [5, 7]);
chk("lot B starts when A is abandoned at expiry", partial.lots[1].startsInDays, 5);
chk("lot B: 3 used, 7 wasted", [partial.lots[1].projectedUsed, partial.lots[1].projectedWaste], [3, 7]);
chk("lot C fully used, not at risk", [partial.lots[2].projectedWaste, partial.lots[2].status], [0, "ok"]);
chk("total projected waste", partial.projectedWaste, 14);
chk("usable excludes projected waste", partial.usableOnHand, 14);
chk("first action is the first at-risk lot", partial.firstAction?.lot.id, "A");

// 0.95/day for 10 days = 9.5 of 10 used; the 0.5 left over is rounding, not waste.
const noise = projectExpiry([lot("X", 10, 10)], measured(0.95), NOW);
chk("sub-unit waste is noise, not a warning", [noise.projectedWaste, noise.lots[0].status === "at_risk"], [0, false]);

const expiredFirst = projectExpiry([lot("A", 12, 5), lot("dead", 2, -1)], measured(1), NOW);
chk("an expired lot outranks an at-risk one", expiredFirst.firstAction?.lot.id, "dead");

/* ── learned shelf life ── */
const sl = learnedShelfLifeDays([
  { id: "1", quantityRemaining: 0, receivedAt: agoIso(100), expirationDate: inDays(80) },   // 180
  { id: "2", quantityRemaining: 0, receivedAt: agoIso(50), expirationDate: inDays(150) },   // 200
  { id: "3", quantityRemaining: 0, receivedAt: agoIso(10), expirationDate: inDays(210) },   // 220
  { id: "4", quantityRemaining: 0, receivedAt: agoIso(5), expirationDate: null },           // ignored
]);
chk("shelf life = median of past deliveries", sl, { days: 200, samples: 3 });
chk("no dated deliveries -> nothing learned", learnedShelfLifeDays([lot("a", 1, null)]), null);

/* ── order recommendation ── */
const base = { lots: [lot("L", 10, 400)], pace: measured(1), now: NOW };
const r1 = recommendOrder(base);
chk("low stock -> order needed", r1.needed, true);
chk("qty = rate x (lead 7 + cover 30) - usable 10", r1.qty, 27);
chk("sized from pace", r1.basis, "pace");

chk("pending order is subtracted", recommendOrder({ ...base, pendingOrderQty: 20 }).qty, 7);
chk("a pending order that covers it clears the warning", recommendOrder({ ...base, pendingOrderQty: 20 }).needed, false);
chk("rounded up to whole packs", recommendOrder({ ...base, packSize: 12 }).qty, 36);
chk("well stocked -> nothing needed",
  [recommendOrder({ ...base, lots: [lot("L", 100, 400)] }).needed, recommendOrder({ ...base, lots: [lot("L", 100, 400)] }).qty],
  [false, 0]);

// Deliveries historically last 20 days. Usable 10 at 1/day -> new lot starts on
// day max(7, 10) = 10 and expires on day 7 + 20 = 27 -> at most 17 usable.
const shortLife = [
  { ...lot("L", 10, 13, 7) },
  { id: "old1", quantityRemaining: 0, receivedAt: agoIso(60), expirationDate: inDays(-40) },
  { id: "old2", quantityRemaining: 0, receivedAt: agoIso(40), expirationDate: inDays(-20) },
];
const capped = recommendOrder({ ...base, lots: shortLife });
chk("order capped so the new lot won't expire first", [capped.qty, capped.capped], [17, true]);

const wasteful = recommendOrder({ ...base, lots: [lot("A", 12, 5), lot("B", 10, 400)] });
chk("stock that will expire doesn't count as cover", wasteful.usableOnHand, 15);
chk("so the order is larger", wasteful.qty, 22);

chk("planning rate sizes the order, not the central rate",
  recommendOrder({ ...base, pace: measured(1, 1.5) }).qty, Math.ceil(1.5 * 37 - 10));

const lowNoPace = recommendOrder({ lots: [lot("L", 1, 400)], pace: unmeasured, parLevel: 5, usualOrderQty: 24, now: NOW });
chk("no pace + below par -> usual order qty", [lowNoPace.needed, lowNoPace.qty, lowNoPace.basis], [true, 24, "usual"]);
const lowNoUsual = recommendOrder({ lots: [lot("L", 1, 400)], pace: unmeasured, parLevel: 5, now: NOW });
chk("no pace, no usual qty -> needed but not sized", [lowNoUsual.needed, lowNoUsual.qty], [true, null]);
chk("no pace, stock fine -> not needed",
  recommendOrder({ lots: [lot("L", 50, 400)], pace: unmeasured, parLevel: 5, now: NOW }).needed, false);

/* ── links ── */
chk("https link kept", safeOrderUrl(" https://www.henryschein.com/p/123 "), "https://www.henryschein.com/p/123");
chk("javascript: rejected", safeOrderUrl("javascript:alert(1)"), null);
chk("data: rejected", safeOrderUrl("data:text/html,<script>"), null);
chk("bare text rejected", safeOrderUrl("henryschein.com/p/123"), null);
chk("search link encodes the query",
  productSearchUrl("Nitrile Gloves, M", "McKesson", "123-45"),
  "https://www.google.com/search?q=McKesson%20123-45%20Nitrile%20Gloves%2C%20M");
chk("order not received after 25 days is flagged", orderOverdue(agoIso(25), NOW), 25);
chk("recent order not flagged", orderOverdue(agoIso(5), NOW), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

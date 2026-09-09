import { pace, runway, suggestedRequest, paceLabel } from "../med-samples";
import { estimatePace, runwayFrom, type UsageEvent } from "../usage-pace";
import type { MedSample, MedSampleLog } from "../data/schema";

const NOW = new Date("2026-09-09T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};
const log = (n: number, daysAgo: number, action = "dispensed"): MedSampleLog =>
  ({ id: String(Math.random()), createdDate: ago(daysAgo), sampleId: "s", action: action as MedSampleLog["action"],
     quantityDelta: action === "received" ? n : -n, balanceAfter: null, occurredAt: ago(daysAgo) });
const sample = (qty: number, par = 0): MedSample =>
  ({ id: "s", createdDate: ago(60), name: "Test", form: "box", quantityOnHand: qty, unit: "box",
     parLevel: par, aiIdentified: false, active: true } as MedSample);

// 1. No history at all
chk("no logs -> no_usage", pace([], NOW).basis, "no_usage");
chk("no logs -> runway unknown", runway(sample(5), [], NOW).status, "unknown");

// 2. A single event is not a rate
chk("one event -> insufficient", pace([log(2, 5)], NOW).basis, "insufficient_history");
chk("one event -> no daysLeft", runway(sample(5), [log(2, 5)], NOW).daysLeft, null);

// 3. Steady use: 28 boxes over 28 days = 1/day; 5 on hand = 5 days -> critical
const steady = [log(7, 25), log(7, 18), log(7, 11), log(7, 4)];
const p = pace(steady, NOW);
chk("steady basis", p.basis, "measured");
chk("steady perDay", Math.round(p.perDay * 100) / 100, 1);
chk("5 on hand -> 5 days left", Math.round(runway(sample(5), steady, NOW).daysLeft!), 5);
chk("5 on hand -> critical", runway(sample(5), steady, NOW).status, "critical");
chk("40 on hand -> ok", runway(sample(40), steady, NOW).status, "ok");
chk("10 on hand -> watch", runway(sample(10), steady, NOW).status, "watch");

// 4. Zero stock always wins
chk("0 on hand -> out", runway(sample(0), steady, NOW).status, "out");

// 5. Receipts must not count as usage
const withReceipt = [...steady, log(50, 3, "received")];
chk("receipt ignored in pace", Math.round(pace(withReceipt, NOW).perDay * 100) / 100, 1);

// 6. Going quiet lowers the rate (denominator is the window, not the active span)
const stale = [log(7, 85), log(7, 80)];
const ps = pace(stale, NOW);
chk("stale usage measured", ps.basis, "measured");
chk("stale rate is low", ps.perDay < 0.2, true);

// 7. Below par with no pace still warns
chk("below par, no pace -> critical", runway(sample(1, 5), [], NOW).status, "critical");

// 8. Restock suggestion = 60 days cover less stock on hand
chk("suggest 60d cover", suggestedRequest(sample(5), steady, 60, NOW), 55);
chk("suggest 0 when well stocked", suggestedRequest(sample(100), steady, 60, NOW), 0);
chk("suggest null without pace", suggestedRequest(sample(5), [log(1, 2)], 60, NOW), null);

// 9. Labels
chk("label weekly", paceLabel(pace(steady, NOW), "box"), "about 7 boxes a week");


/* ── the engine: does it actually get smarter with more data? ── */
const ev = (qty: number, daysAgo: number): UsageEvent => ({ at: new Date(NOW.getTime() - daysAgo * 86400000), qty });

// Same average rate, more weeks of evidence -> tighter planning margin.
// Real usage is noisy. Uniform data has zero variance and therefore zero
// margin at any sample size, which would test nothing — both series carry the
// same spread around a mean of ~7/week, differing only in how many weeks.
const WEEKLY = [5, 9, 6, 8, 7, 7, 6, 8, 5, 9];
const thin = WEEKLY.slice(0, 2).map((q, i) => ev(q, 7 * i + 4));
const thick = WEEKLY.map((q, i) => ev(q, 7 * i + 4));
const pThin = estimatePace(thin, NOW), pThick = estimatePace(thick, NOW);
chk("thin history is measured", pThin.basis, "measured");
chk("thick history is measured", pThick.basis, "measured");
chk("confidence grows with data", [pThin.confidence, pThick.confidence], ["fair", "strong"]);
const padThin = pThin.perDayPlanning / pThin.perDay;
const padThick = pThick.perDayPlanning / pThick.perDay;
chk("safety margin shrinks as evidence grows", padThick < padThin, true);
chk("thick estimate is close to the true rate", Math.abs(pThick.perDay - 1) < 0.2, true);

// Erratic usage should carry a wider margin than steady usage at the same mean.
const steadyEv = Array.from({ length: 8 }, (_, i) => ev(7, 7 * i + 4));
const spikyEv = [ev(1, 53), ev(1, 46), ev(26, 39), ev(1, 32), ev(1, 25), ev(20, 18), ev(1, 11), ev(5, 4)];
const pSteady = estimatePace(steadyEv, NOW), pSpiky = estimatePace(spikyEv, NOW);
chk("erratic usage is more variable", pSpiky.variability > pSteady.variability, true);
chk("erratic usage plans above its mean", pSpiky.perDayPlanning > pSpiky.perDay, true);

// Recency weighting: a product whose use doubled recently should read high.
const doubled = [ev(3, 53), ev(3, 46), ev(3, 39), ev(3, 32), ev(3, 25), ev(12, 18), ev(12, 11), ev(12, 4)];
const pDouble = estimatePace(doubled, NOW);
chk("rising use is detected", pDouble.trend, "rising");
chk("recency weighting favours the new rate", pDouble.perDay > 1.0, true);

// Going quiet should pull the rate DOWN, not leave it pinned high.
const quiet = [ev(20, 81), ev(20, 74), ev(20, 67)];
const pQuiet = estimatePace(quiet, NOW);
chk("quiet product trends down", pQuiet.trend, "falling");
chk("quiet product rate decays", pQuiet.perDay < 1.0, true);

// Runway is planned conservatively, never optimistically.
const rw = runwayFrom(10, 0, pThin, NOW);
chk("planning runway <= best-case runway", (rw.daysLeft ?? 0) <= (rw.daysLeftBest ?? 0), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

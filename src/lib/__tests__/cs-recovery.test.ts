import { gapsIn, mergeSpans, recoveryPicture } from "../cs-archive/recovery";
import type { RecordRecoveryItem } from "../data/schema";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const item = (p: Partial<RecordRecoveryItem>): RecordRecoveryItem => ({
  id: Math.random().toString(36).slice(2), createdDate: "2026-01-01T00:00:00Z",
  registrationId: "reg", recordKind: "purchase", status: "missing",
  periodStart: "2024-01-01", periodEnd: "2024-01-31", ...p,
} as RecordRecoveryItem);

/* ------------------------------------------------------------ merging */

chk("overlapping spans merge", mergeSpans([
  { start: "2024-01-01", end: "2024-03-31" },
  { start: "2024-03-01", end: "2024-05-31" },
]), [{ start: "2024-01-01", end: "2024-05-31" }]);

// A span ending the 31st and one starting the 1st leave no day uncovered.
chk("touching spans merge", mergeSpans([
  { start: "2024-01-01", end: "2024-01-31" },
  { start: "2024-02-01", end: "2024-02-29" },
]), [{ start: "2024-01-01", end: "2024-02-29" }]);

chk("a real gap is preserved", mergeSpans([
  { start: "2024-01-01", end: "2024-01-31" },
  { start: "2024-03-01", end: "2024-03-31" },
]), [{ start: "2024-01-01", end: "2024-01-31" }, { start: "2024-03-01", end: "2024-03-31" }]);

chk("a span inside another disappears into it", mergeSpans([
  { start: "2024-01-01", end: "2024-12-31" },
  { start: "2024-06-01", end: "2024-06-30" },
]), [{ start: "2024-01-01", end: "2024-12-31" }]);

/* --------------------------------------------------------------- gaps */

const year = { start: "2024-01-01", end: "2024-12-31" };

chk("nothing covered means the whole span is a gap", gapsIn(year, []), [year]);

chk("a gap in the middle is found", gapsIn(year, [
  { start: "2024-01-01", end: "2024-03-31" },
  { start: "2024-07-01", end: "2024-12-31" },
]), [{ start: "2024-04-01", end: "2024-06-30" }]);

chk("a gap at the start is found", gapsIn(year, [{ start: "2024-04-01", end: "2024-12-31" }]),
  [{ start: "2024-01-01", end: "2024-03-31" }]);

chk("a gap at the end is found", gapsIn(year, [{ start: "2024-01-01", end: "2024-09-30" }]),
  [{ start: "2024-10-01", end: "2024-12-31" }]);

chk("fully covered leaves nothing", gapsIn(year, [{ start: "2023-01-01", end: "2025-12-31" }]), []);

chk("coverage outside the span doesn't count as covering it",
  gapsIn(year, [{ start: "2022-01-01", end: "2022-12-31" }]), [year]);

/* ------------------------------------------------- the whole picture */

const reg = { effectiveFrom: "2024-01-01", retiredOn: "2024-12-31" };

const picture = recoveryPicture([
  item({ status: "recovered", periodStart: "2024-01-01", periodEnd: "2024-06-30" }),
  item({ status: "requested", periodStart: "2024-07-01", periodEnd: "2024-09-30" }),
], reg, "2026-09-23");

chk("recovered spans are covered", picture.recovered, [{ start: "2024-01-01", end: "2024-06-30" }]);
// The whole point: a request is not a record.
chk("a requested period is still a gap", picture.gaps, [{ start: "2024-07-01", end: "2024-12-31" }]);
chk("but it's shown as in flight", picture.inFlight, [{ start: "2024-07-01", end: "2024-09-30" }]);
chk("coverage is the recovered half", Math.round((picture.coverage ?? 0) * 100), 50);

// Nothing to keep is not a hole.
const withNa = recoveryPicture([
  item({ status: "recovered", periodStart: "2024-01-01", periodEnd: "2024-06-30" }),
  item({ status: "not_applicable", periodStart: "2024-07-01", periodEnd: "2024-12-31" }),
], reg, "2026-09-23");
chk("a period with nothing to keep isn't a gap", withNa.gaps, []);
chk("and counts as covered", withNa.coverage, 1);

// A registration still in use is accounted for up to today, not to its last filing.
const live = recoveryPicture([
  item({ status: "recovered", periodStart: "2024-01-01", periodEnd: "2024-12-31" }),
], { effectiveFrom: "2024-01-01", retiredOn: null }, "2026-09-23");
chk("an open registration runs to today", live.whole?.end, "2026-09-23");
chk("so the untouched stretch shows up", live.gaps, [{ start: "2025-01-01", end: "2026-09-23" }]);

chk("no start date means nothing can be measured", recoveryPicture([], { effectiveFrom: null }, "2026-09-23").coverage, null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

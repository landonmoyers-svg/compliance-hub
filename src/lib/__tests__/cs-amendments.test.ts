import { amendableRecords, buildChains, currentOnly, isSuperseded, supersededBy } from "../cs-archive/amendments";
import { reconcilePeriod } from "../cs-archive/reconcile";
import type { CsArchiveEntry, DeaRecord } from "../data/schema";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const rec = (id: string, recordDate: string, amends?: string, entries: CsArchiveEntry[] = []): DeaRecord => ({
  id, createdDate: `${recordDate}T12:00:00Z`, recordType: "administration_log",
  recordDate, amendsRecordId: amends, entries,
} as DeaRecord);

const entry = (amount: number): CsArchiveEntry => ({
  date: "2024-03-01", vialLabel: "M1A1", action: "administered", amount,
  unit: "mg", staff: null, witness: null, pageRef: null, note: null,
});

/* ------------------------------------------------------------- chains */

const a = rec("a", "2024-03-01");
const b = rec("b", "2024-03-10", "a");   // corrects a
const c = rec("c", "2024-03-20", "b");   // corrects the correction
const other = rec("z", "2024-04-01");

const chains = buildChains([a, b, c, other]);
chk("one chain per log, plus the unrelated one", chains.length, 2);

const chain = chains.find((x) => ["a", "b", "c"].includes(x.current.id))!;
chk("newest version is the one in force", chain.current.id, "c");
chk("both earlier versions are kept, newest first", chain.superseded.map((r) => r.id), ["b", "a"]);
chk("nothing is dropped", chain.superseded.length + 1, 3);

chk("chains sort newest first", buildChains([a, b, c, other]).map((x) => x.current.id), ["z", "c"]);

chk("a log nobody amended stands alone", buildChains([other]), [{ current: other, superseded: [] }]);

/* ------------------------------------- what reconciliation may count */

chk("only the version in force counts", currentOnly([a, b, c, other]).map((r) => r.id), ["z", "c"]);

// The reason this exists: an amended log plus its correction double the period.
const original = rec("o", "2024-03-01", undefined, [entry(100)]);
const fixed = rec("f", "2024-03-05", "o", [entry(60)]);
const naive = reconcilePeriod([...original.entries!, ...fixed.entries!], { opening: 200, closing: 140 });
chk("counting both versions invents a discrepancy", naive.balances, false);
const correct = reconcilePeriod(currentOnly([original, fixed]).flatMap((r) => r.entries ?? []), { opening: 200, closing: 140 });
chk("counting only the current version balances", correct.balances, true);

/* ------------------------------------------------------------ labels */

chk("superseded records know it", [isSuperseded(a, [a, b, c]), isSuperseded(c, [a, b, c])], [true, false]);
chk("and know what replaced them", supersededBy(a, [a, b, c])?.id, "b");
chk("the current version has no replacement", supersededBy(c, [a, b, c]), null);

/* ------------------------------------------- what may be amended */

chk("only versions in force may be amended",
  amendableRecords([a, b, c, other], ["administration_log", "vial_log", "count_sheet"]).map((r) => r.id),
  ["z", "c"]);

chk("non-paper records can't be amended this way",
  amendableRecords([{ ...other, recordType: "order_222" } as DeaRecord], ["administration_log"]).length, 0);

/* ------------------------------------------------------- bad data */

const orphan = rec("x", "2024-05-01", "does-not-exist");
chk("an amendment pointing at nothing still shows up", buildChains([orphan]).map((x) => x.current.id), ["x"]);

const loopA = rec("p", "2024-06-01", "q");
const loopB = rec("q", "2024-06-02", "p");
chk("a circular link doesn't hang", buildChains([loopA, loopB]).length >= 1, true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

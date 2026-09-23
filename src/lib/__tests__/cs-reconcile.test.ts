import { reconcile, reconcileVials, reconcilePeriod, reconciles } from "../cs-archive/reconcile";
import type { CsArchiveEntry } from "../data/schema";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const e = (p: Partial<CsArchiveEntry>): CsArchiveEntry => ({
  date: null, vialLabel: null, action: "administered", amount: null,
  unit: "mg", staff: null, witness: null, pageRef: null, note: null, ...p,
});

/* ------------------------------------------------------- vial by vial */

const clean: CsArchiveEntry[] = [
  e({ date: "2024-01-03", vialLabel: "M1A1", action: "received", amount: 500 }),
  e({ date: "2024-01-05", vialLabel: "M1A1", action: "administered", amount: 200 }),
  e({ date: "2024-01-09", vialLabel: "M1A1", action: "administered", amount: 250 }),
  e({ date: "2024-01-09", vialLabel: "M1A1", action: "wasted", amount: 50 }),
];
const v = reconcileVials(clean)[0];
chk("received totalled", v.received, 500);
chk("administered totalled", v.administered, 450);
chk("wasted totalled", v.wasted, 50);
chk("vial balances to zero", v.remaining, 0);
chk("clean vial has no issues", v.issues, []);
chk("first and last date", [v.firstDate, v.lastDate], ["2024-01-03", "2024-01-09"]);

const over = reconcileVials([
  e({ vialLabel: "M1B2", action: "received", amount: 500 }),
  e({ vialLabel: "M1B2", action: "administered", amount: 600 }),
])[0];
chk("over-withdrawn vial is flagged", over.issues, ["more accounted for than received (over by 100)"]);

const never = reconcileVials([e({ vialLabel: "M1C3", action: "administered", amount: 100 })])[0];
chk("never-received vial is flagged", never.issues, ["used but never logged as received"]);

const backwards = reconcileVials([
  e({ date: "2024-02-10", vialLabel: "M1D1", action: "received", amount: 500 }),
  e({ date: "2024-02-02", vialLabel: "M1D1", action: "administered", amount: 100 }),
])[0];
chk("use before receipt is flagged", backwards.issues, ["entry on 2024-02-02 predates the receipt on 2024-02-10"]);

const counted = reconcileVials([
  e({ date: "2024-03-01", vialLabel: "M1E1", action: "received", amount: 500 }),
  e({ date: "2024-03-04", vialLabel: "M1E1", action: "administered", amount: 100 }),
  e({ date: "2024-03-05", vialLabel: "M1E1", action: "count", amount: 380 }),
])[0];
chk("physical count kept", counted.countedRemaining, 380);
chk("count that disagrees is flagged", counted.issues, ["counted 380, log implies 400"]);

chk("vials sorted by label", reconcileVials([
  e({ vialLabel: "M1A10", action: "received", amount: 1 }),
  e({ vialLabel: "M1A2", action: "received", amount: 1 }),
]).map((x) => x.vialLabel), ["M1A2", "M1A10"]);

chk("rows with no vial are skipped, not counted", reconcileVials([e({ action: "administered", amount: 5 })]).length, 0);

/* ----------------------------------------------------------- the period */

chk("period balances", reconcilePeriod(clean, { opening: 0, closing: 0 }), {
  opening: 0, received: 500, administered: 450, wasted: 50,
  expectedClosing: 0, statedClosing: 0, difference: 0, balances: true,
});

const off = reconcilePeriod(clean, { opening: 0, closing: 25 });
chk("period difference is reported", [off.difference, off.balances], [25, false]);

const noFigures = reconcilePeriod(clean, {});
chk("no opening means no expected closing", [noFigures.expectedClosing, noFigures.difference, noFigures.balances], [null, null, false]);

chk("tenths of a mL don't create a phantom difference",
  reconcilePeriod([
    e({ vialLabel: "A", action: "received", amount: 0.1 }),
    e({ vialLabel: "A", action: "received", amount: 0.2 }),
  ], { opening: 0, closing: 0.3 }).balances, true);

/* -------------------------------------------------------------- together */

const full = reconcile(clean, { opening: 0, closing: 0 });
chk("clean log has no issues", full.issues, []);
chk("clean log reconciles", reconciles(full), true);

const messy = reconcile([...clean, e({ date: "2024-01-11", action: "administered", amount: 50 })], { opening: 0, closing: 0 });
chk("unreadable row counted", messy.unusable, 1);
chk("unreadable row raises an issue", messy.issues[0], "1 row is missing an amount or a vial — read them again before relying on these totals");
chk("unreadable row blocks sign-off", reconciles(messy), false);

const noBalances = reconcile(clean, {});
chk("missing balances says so", noBalances.issues.includes("no opening or closing balance entered — only the vial-by-vial view is meaningful"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

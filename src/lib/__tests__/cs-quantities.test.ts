import { checkQuantities, checkQuantity, totalMg, unitsFromPacks } from "../cs-archive/quantities";
import type { CsArchiveEntry } from "../data/schema";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const e = (p: Partial<CsArchiveEntry>): CsArchiveEntry => ({
  date: "2026-05-08", vialLabel: null, action: "received", amount: null, unit: "vials",
  staff: null, witness: null, pageRef: null, note: null, ...p,
});

/* ------------------------------------------------------------ deriving */

chk("units from packs", unitsFromPacks({ packs: 15, unitsPerPack: 10 }), 150);
chk("a bare count isn't a pack", unitsFromPacks({ packs: null, unitsPerPack: 10 }), null);
chk("a pack of zero is nonsense", unitsFromPacks({ packs: 15, unitsPerPack: 0 }), null);

chk("total mg from packs", totalMg({ packs: 15, unitsPerPack: 10, containerMg: 500, amount: null }), 75000);
chk("total mg from a plain count", totalMg({ packs: null, unitsPerPack: null, containerMg: 500, amount: 20 }), 10000);
chk("no strength, no total", totalMg({ packs: 15, unitsPerPack: 10, containerMg: null, amount: null }), null);

/* ------------------------------ the one this exists for */

// 15 boxes of 10 arrived; someone wrote 15 vials. The number is right and the
// quantity is out by a factor of ten.
const misread = e({ packs: 15, unitsPerPack: 10, containerMg: 500, amount: 15, concentration: "50 mg/mL x 10 mL" });
const w = checkQuantity(misread);
chk("the pack-count-as-unit-count error is caught", w.map((x) => x.kind), ["order_of_magnitude"]);
chk("and it says what it thinks happened", w[0].message,
  "Recorded 15, but 15 packs of 10 is 150 — the pack count may have been written where the unit count belongs.");

// A short delivery is a different thing and should read differently.
const short = e({ packs: 15, unitsPerPack: 10, containerMg: 500, amount: 149, concentration: "50 mg/mL x 10 mL" });
chk("a near miss is a plain mismatch, not an order of magnitude",
  checkQuantity(short).map((x) => x.kind), ["pack_mismatch"]);
chk("and it allows for the innocent explanation", checkQuantity(short)[0].message.includes("partial pack or short delivery"), true);

chk("a correct receipt raises nothing",
  checkQuantity(e({ packs: 15, unitsPerPack: 10, containerMg: 500, amount: 150, concentration: "50 mg/mL x 10 mL" })), []);

// A single pack can't produce the order-of-magnitude confusion.
chk("one pack of one is not suspicious",
  checkQuantity(e({ packs: 1, unitsPerPack: 1, containerMg: 500, amount: 1, concentration: "x" })), []);

/* ------------------------------------------------------ completeness */

chk("a receipt with no strength is flagged",
  checkQuantity(e({ amount: 20 })).map((x) => x.kind), ["incomplete"]);
chk("a receipt with strength isn't",
  checkQuantity(e({ amount: 20, containerMg: 500 })), []);
// Only receipts need strength; an administration line is in mg already.
chk("an administration line isn't asked for a pack size",
  checkQuantity(e({ action: "administered", amount: 200, unit: "mg" })), []);

/* ---------------------------------------------------------- in bulk */

const batch = checkQuantities([
  e({ packs: 15, unitsPerPack: 10, containerMg: 500, amount: 15, concentration: "x" }),
  e({ action: "administered", amount: 100, unit: "mg" }),
  e({ amount: 5 }),
]);
chk("warnings carry the line they came from", batch.map((b) => [b.index, b.warning.kind]),
  [[0, "order_of_magnitude"], [2, "incomplete"]]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

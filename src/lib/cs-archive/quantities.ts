/**
 * Checking that a recorded quantity means what it says.
 *
 * "15" is not a quantity. An order line reading 15 boxes of 10 and a stock log
 * reading 15 vials are the same number and a tenfold difference — and writing
 * them the same way is how 135 vials of ketamine end up unrecorded, visible
 * only because the shipment weighed nine pounds.
 *
 * So a receipt records what arrived in the form it arrived in: how many packs,
 * how many units in a pack, how much is in a unit. Everything else is derived,
 * and where a line carries both a pack count and a unit count, the two are
 * checked against each other at the point of entry rather than at the point of
 * inspection.
 *
 * The checks WARN. A pack that was opened, a partial delivery or a supplier
 * who ships 9 in a box of 10 are all real, and a record that cannot express
 * them is a record people work around.
 */

import type { CsArchiveEntry } from "@/lib/data/schema";

/** Units a line accounts for, from its pack description. Null when not a pack. */
export function unitsFromPacks(entry: Pick<CsArchiveEntry, "packs" | "unitsPerPack">): number | null {
  const { packs, unitsPerPack } = entry;
  if (typeof packs !== "number" || typeof unitsPerPack !== "number") return null;
  if (packs < 0 || unitsPerPack <= 0) return null;
  return packs * unitsPerPack;
}

/** Total milligrams a line accounts for, where enough is known to say. */
export function totalMg(entry: Pick<CsArchiveEntry, "packs" | "unitsPerPack" | "containerMg" | "amount">): number | null {
  const units = unitsFromPacks(entry);
  if (units !== null && typeof entry.containerMg === "number") return units * entry.containerMg;
  if (typeof entry.amount === "number" && typeof entry.containerMg === "number") return entry.amount * entry.containerMg;
  return null;
}

export interface QuantityWarning {
  kind: "pack_mismatch" | "order_of_magnitude" | "incomplete";
  message: string;
}

/**
 * Look for the ways a quantity goes wrong.
 *
 * The one worth having is `order_of_magnitude`: a recorded count that equals
 * the PACK count, when the pack holds more than one. That is exactly the shape
 * of recording 15 boxes as 15 vials, and it is invisible in any single number.
 */
export function checkQuantity(entry: CsArchiveEntry): QuantityWarning[] {
  const warnings: QuantityWarning[] = [];
  const expected = unitsFromPacks(entry);
  const recorded = entry.amount;

  if (expected !== null && typeof recorded === "number" && recorded !== expected) {
    if (recorded === entry.packs && (entry.unitsPerPack ?? 1) > 1) {
      warnings.push({
        kind: "order_of_magnitude",
        message: `Recorded ${recorded}, but ${entry.packs} packs of ${entry.unitsPerPack} is ${expected} — the pack count may have been written where the unit count belongs.`,
      });
    } else {
      warnings.push({
        kind: "pack_mismatch",
        message: `Recorded ${recorded}, but ${entry.packs} × ${entry.unitsPerPack} is ${expected}. A partial pack or short delivery explains it; a typo also does.`,
      });
    }
  }

  // A receipt whose strength is unknown can't be reconciled in milligrams, and
  // two products that are both "500 mg a vial" are not interchangeable.
  if (entry.action === "received" && !entry.concentration && typeof entry.containerMg !== "number") {
    warnings.push({
      kind: "incomplete",
      message: "No strength recorded for this receipt — note the concentration and the amount per container.",
    });
  }

  return warnings;
}

/** Every warning across a set of entries, with the line each came from. */
export function checkQuantities(entries: CsArchiveEntry[]): { index: number; warning: QuantityWarning }[] {
  return entries.flatMap((entry, index) => checkQuantity(entry).map((warning) => ({ index, warning })));
}

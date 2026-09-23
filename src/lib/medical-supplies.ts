import type { MedicalSupply, MedicalSupplyLog, MedicalSupplyLot } from "@/lib/data/schema";
import { projectExpiry, recommendOrder, type ExpiryPlan, type OrderRecommendation } from "@/lib/stock-lots";
import { estimatePace, runwayFrom, type PaceEstimate, type UsageEvent, type Runway } from "@/lib/usage-pace";

export {
  paceLabel, unitLabel, unitCount, confidenceNote, trendNote, suggestedOrder,
  RUNWAY_CRITICAL_DAYS, RUNWAY_WATCH_DAYS,
  type PaceEstimate, type Runway, type StockStatus,
} from "@/lib/usage-pace";

/**
 * Consumable supplies on the shared usage-pace engine, so "days left" means the
 * same thing here as it does for medication samples.
 *
 * Only `used` counts as demand. A `discarded` entry also removes stock, but it
 * is an incident rather than a rate — folding it in would inflate the forecast
 * every time a box was dropped. Receipts and count corrections are not usage.
 */
function usageEvents(logs: MedicalSupplyLog[]): UsageEvent[] {
  return logs
    .filter((l) => l.action === "used" && l.quantityDelta !== 0)
    .map((l) => ({ at: new Date(l.occurredAt ?? l.createdDate), qty: Math.abs(l.quantityDelta) }));
}

export function supplyPace(logs: MedicalSupplyLog[], now = new Date()): PaceEstimate {
  return estimatePace(usageEvents(logs), now);
}

export function supplyRunway(item: MedicalSupply, logs: MedicalSupplyLog[], now = new Date()): Runway {
  return runwayFrom(item.quantityOnHand ?? 0, item.parLevel ?? 0, supplyPace(logs, now), now);
}

/* ───────────────────── lots, expiry, ordering (per item) ───────────────────── */


/** Id prefix for a not-yet-saved lot that stands in for pre-lot stock. */
export const LEGACY_LOT_PREFIX = "legacy-";

/**
 * The lots holding an item's stock. Stock recorded before lot tracking existed
 * (an on-hand count with one lot/expiry on the product row, and no lot rows) is
 * represented as a single stand-in lot, so it still counts, still expires, and
 * gets turned into a real lot the first time it's touched.
 */
export function lotsFor(item: MedicalSupply, allLots: MedicalSupplyLot[]): MedicalSupplyLot[] {
  const own = allLots.filter((l) => l.supplyId === item.id);
  if (own.length > 0 || (item.quantityOnHand ?? 0) <= 0) return own;
  return [{
    id: `${LEGACY_LOT_PREFIX}${item.id}`,
    createdDate: item.createdDate,
    supplyId: item.id,
    lotNumber: item.lotNumber ?? null,
    expirationDate: item.expirationDate ?? null,
    quantityReceived: item.quantityOnHand,
    quantityRemaining: item.quantityOnHand,
    receivedAt: item.createdDate,
    note: null,
  }];
}

export interface SupplyStock {
  lots: MedicalSupplyLot[];
  pace: PaceEstimate;
  plan: ExpiryPlan<MedicalSupplyLot>;
  /** Runway computed on USABLE stock — units that will expire don't count as cover. */
  runway: Runway;
  order: OrderRecommendation;
}

export function supplyStock(
  item: MedicalSupply, logs: MedicalSupplyLog[], allLots: MedicalSupplyLot[], now = new Date(),
): SupplyStock {
  const lots = lotsFor(item, allLots);
  const pace = supplyPace(logs.filter((l) => l.supplyId === item.id), now);
  const plan = projectExpiry(lots, pace, now);
  const runway = runwayFrom(plan.usableOnHand, item.parLevel ?? 0, pace, now);
  const order = recommendOrder({
    lots, pace, now,
    parLevel: item.parLevel,
    leadTimeDays: item.leadTimeDays,
    targetCoverDays: item.targetCoverDays,
    packSize: item.packSize,
    pendingOrderQty: item.pendingOrderQty,
    usualOrderQty: item.reorderQuantity,
  });
  return { lots, pace, plan, runway, order };
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Stock that will expire here but is used faster at another site should move
 * there. Same product = same SKU, or the same name when neither has a SKU.
 */
export function transferHint(
  item: MedicalSupply, stock: SupplyStock, items: MedicalSupply[], stockById: Map<string, SupplyStock>,
): { other: MedicalSupply; ratio: number | null } | null {
  if (!item.locationId || !((stock.plan.projectedWaste ?? 0) > 0)) return null;
  const sku = (item.sku ?? "").trim().toLowerCase();
  let best: { other: MedicalSupply; ratio: number | null } | null = null;
  for (const o of items) {
    if (o.id === item.id || !o.locationId || o.locationId === item.locationId) continue;
    const oSku = (o.sku ?? "").trim().toLowerCase();
    const same = sku && oSku ? sku === oSku : normName(o.name) === normName(item.name);
    if (!same) continue;
    const op = stockById.get(o.id)?.pace;
    if (!op || op.basis !== "measured" || op.perDay <= 0) continue;
    const mine = stock.pace.basis === "measured" ? stock.pace.perDay : 0;
    const ratio = mine > 0 ? op.perDay / mine : null;
    if (ratio !== null && ratio < 1.5) continue;
    if (!best || (ratio ?? Infinity) > (best.ratio ?? Infinity)) best = { other: o, ratio };
  }
  return best;
}

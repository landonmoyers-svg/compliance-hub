import type { MedicalSupply, MedicalSupplyLog } from "@/lib/data/schema";
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

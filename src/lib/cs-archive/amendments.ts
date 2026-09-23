/**
 * Amendment chains for filed paper logs.
 *
 * The archive is append-only, so a correction can't overwrite what it corrects
 * — it is filed as a new record pointing back at the old one. Left alone that
 * produces a register of near-identical rows with no way to tell which is
 * current, which is worse than useless for a DEA record.
 *
 * So the register is drawn as CHAINS: one row per log, showing the newest
 * version, with everything it superseded nested beneath it and still readable.
 * Nothing is hidden and nothing is deleted.
 *
 * The part that matters beyond tidiness: `currentOnly` is what reconciliation
 * must count. Add up an amended log AND its correction and the period totals
 * double, inventing a discrepancy that never happened — or masking a real one.
 */

import type { DeaRecord } from "@/lib/data/schema";

export interface AmendmentChain {
  /** The version in force: the newest record in the chain. */
  current: DeaRecord;
  /** Everything it replaced, newest superseded first. Never empty-checked away. */
  superseded: DeaRecord[];
}

/** Records sorted newest first, by the date on the log then by when it was filed. */
function newestFirst(a: DeaRecord, b: DeaRecord): number {
  return (b.recordDate ?? b.createdDate).localeCompare(a.recordDate ?? a.createdDate)
    || b.createdDate.localeCompare(a.createdDate);
}

/**
 * Group records into chains. A record that amends another joins that one's
 * chain, however long the chain is — an amendment can itself be amended.
 */
export function buildChains(records: DeaRecord[]): AmendmentChain[] {
  const byId = new Map(records.map((r) => [r.id, r]));

  // Walk back to the original each record descends from. A missing or circular
  // link resolves to the record itself rather than looping forever — bad data
  // should degrade to a visible extra row, not hang the page.
  function rootOf(r: DeaRecord): string {
    const seen = new Set<string>([r.id]);
    let cur = r;
    while (cur.amendsRecordId) {
      const parent = byId.get(cur.amendsRecordId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      cur = parent;
    }
    return cur.id;
  }

  const groups = new Map<string, DeaRecord[]>();
  for (const r of records) {
    const root = rootOf(r);
    const g = groups.get(root);
    if (g) g.push(r); else groups.set(root, [r]);
  }

  const chains: AmendmentChain[] = [];
  for (const members of groups.values()) {
    // The one nothing else amends is the version in force. If several qualify
    // (two corrections of the same log, filed independently), the newest wins
    // and the rest are shown as superseded — visible, not silently dropped.
    const amended = new Set(members.map((m) => m.amendsRecordId).filter(Boolean) as string[]);
    const sorted = [...members].sort(newestFirst);
    const current = sorted.find((m) => !amended.has(m.id)) ?? sorted[0];
    chains.push({ current, superseded: sorted.filter((m) => m.id !== current.id) });
  }
  return chains.sort((a, b) => newestFirst(a.current, b.current));
}

/**
 * Only the records in force. THIS is what totals and reconciliation run on;
 * counting superseded versions too would double the period.
 */
export function currentOnly(records: DeaRecord[]): DeaRecord[] {
  return buildChains(records).map((c) => c.current);
}

/** True when this record has been replaced by a later filing. */
export function isSuperseded(record: DeaRecord, records: DeaRecord[]): boolean {
  return records.some((r) => r.amendsRecordId === record.id);
}

/** How a superseded version should be labelled in the register. */
export function supersededBy(record: DeaRecord, records: DeaRecord[]): DeaRecord | null {
  return records.find((r) => r.amendsRecordId === record.id) ?? null;
}

/**
 * Which records a new amendment may point at. A log can't amend itself, and
 * pointing at an already-superseded version would fork the chain — corrections
 * attach to what is currently in force.
 */
export function amendableRecords(records: DeaRecord[], paperLogTypes: readonly string[]): DeaRecord[] {
  return buildChains(records)
    .map((c) => c.current)
    .filter((r) => paperLogTypes.includes(r.recordType))
    .sort(newestFirst);
}

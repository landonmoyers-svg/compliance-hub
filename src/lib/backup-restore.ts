/**
 * Restore from a Data Backup export (the ZIP the Backup page downloads, or its
 * backup.json). Deliberately insert-only: it puts back records that have gone
 * missing and never overwrites what's there now — a record that was edited
 * since the backup keeps its current version (earlier versions of governed
 * records are in version history). That makes a restore safe to run on a live
 * system, and "Check a backup" doubles as the restore test HIPAA expects.
 */

export type BackupRecord = { id: string; createdDate?: string } & Record<string, unknown>;
export type BackupData = Record<string, BackupRecord[]>;

/** Read backup.json out of a backup ZIP, or a bare backup.json. */
export async function readBackupFile(file: File): Promise<BackupData> {
  let text: string;
  if (file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip")) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(file);
    const entry = zip.file("backup.json") ?? zip.file(/(^|\/)backup\.json$/)[0];
    if (!entry) throw new Error("This ZIP has no backup.json — is it a Lone Peak Compliance backup?");
    text = await entry.async("string");
  } else {
    text = await file.text();
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Not a Lone Peak Compliance backup.");
  const out: BackupData = {};
  for (const [name, rows] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    out[name] = rows.filter((r): r is BackupRecord => !!r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string");
  }
  if (Object.keys(out).length === 0) throw new Error("The backup contains no datasets.");
  return out;
}

export interface DatasetDiff {
  name: string;
  inBackup: number;
  current: number;
  /** In the backup, gone from the live data — restorable. */
  missing: BackupRecord[];
  /** Present in both but different now (kept as-is; not overwritten). */
  changed: number;
  /** Created after the backup (untouched). */
  newer: number;
  /** Dataset no longer exists in the app (can't restore). */
  unknown?: boolean;
}

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val)
    ? Object.fromEntries(Object.entries(val as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null).sort(([a], [b]) => a.localeCompare(b)))
    : val));

export function diffBackup(backup: BackupData, current: Record<string, BackupRecord[] | undefined>): DatasetDiff[] {
  return Object.entries(backup).map(([name, rows]) => {
    const live = current[name];
    if (!live) return { name, inBackup: rows.length, current: 0, missing: [], changed: 0, newer: 0, unknown: true };
    const byId = new Map(live.map((r) => [r.id, r]));
    const backupIds = new Set(rows.map((r) => r.id));
    let changed = 0;
    const missing: BackupRecord[] = [];
    for (const r of rows) {
      const now = byId.get(r.id);
      if (!now) missing.push(r);
      else if (stable(now) !== stable(r)) changed += 1;
    }
    return { name, inBackup: rows.length, current: live.length, missing, changed, newer: live.filter((r) => !backupIds.has(r.id)).length };
  }).sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));
}

export interface RestoreOutcome { name: string; inserted: number; failed: { id: string; error: string }[] }

/**
 * Insert the missing records, dataset by dataset, in repeated passes: a record
 * that references another missing record (e.g. a response → its incident)
 * fails until its parent is back, so we retry failures until a pass makes no
 * progress.
 */
export async function restoreMissing(
  diffs: DatasetDiff[],
  restore: (name: string, rows: BackupRecord[]) => Promise<{ inserted: number; failed: { id: string; error: string }[] }>,
  onProgress?: (msg: string) => void,
): Promise<RestoreOutcome[]> {
  const pending = new Map(diffs.filter((d) => d.missing.length && !d.unknown).map((d) => [d.name, d.missing]));
  const outcome = new Map<string, RestoreOutcome>(Array.from(pending.keys()).map((n) => [n, { name: n, inserted: 0, failed: [] }]));
  for (let pass = 1; pass <= 4 && pending.size; pass++) {
    let progress = 0;
    for (const [name, rows] of Array.from(pending)) {
      onProgress?.(`Restoring ${name}${pass > 1 ? ` (pass ${pass})` : ""}…`);
      const res = await restore(name, rows);
      progress += res.inserted;
      const o = outcome.get(name)!;
      o.inserted += res.inserted;
      const failedIds = new Set(res.failed.map((f) => f.id));
      const left = rows.filter((r) => failedIds.has(r.id));
      o.failed = res.failed;
      if (left.length) pending.set(name, left); else pending.delete(name);
    }
    if (progress === 0) break;
  }
  return Array.from(outcome.values());
}

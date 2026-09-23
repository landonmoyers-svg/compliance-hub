"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, RotateCcw, CheckCircle2, AlertTriangle, FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/data";
import type { Collection } from "@/lib/data";
import { diffBackup, readBackupFile, restoreMissing, type BackupRecord, type DatasetDiff, type RestoreOutcome } from "@/lib/backup-restore";
import { humanizeLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AnyCollection = Collection<BackupRecord & { createdDate: string }>;
const client = () => db() as unknown as Record<string, AnyCollection | undefined>;

/**
 * Check a backup against the live data, and put back anything that's gone.
 * Insert-only — never overwrites a record that exists now.
 */
export function RestorePanel() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<DatasetDiff[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RestoreOutcome[] | null>(null);

  const check = async (file: File) => {
    setFileName(file.name); setDiffs(null); setResult(null);
    try {
      setBusy("Reading the backup…");
      const backup = await readBackupFile(file);
      const current: Record<string, BackupRecord[] | undefined> = {};
      for (const name of Object.keys(backup)) {
        const col = client()[name];
        if (typeof col?.list !== "function") continue;
        setBusy(`Comparing ${humanizeLabel(name)}…`);
        current[name] = (await col.list().catch(() => undefined)) as BackupRecord[] | undefined;
      }
      const d = diffBackup(backup, current);
      setDiffs(d);
      setPicked(new Set(d.filter((x) => x.missing.length && !x.unknown).map((x) => x.name)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
      setFileName(null);
    } finally {
      setBusy(null);
    }
  };

  const chosen = (diffs ?? []).filter((d) => picked.has(d.name));
  const toRestore = chosen.reduce((n, d) => n + d.missing.length, 0);

  const run = async () => {
    if (!toRestore) return;
    if (!window.confirm(`Put back ${toRestore} missing record${toRestore === 1 ? "" : "s"} from ${fileName}? Nothing that exists now will be changed.`)) return;
    try {
      const out = await restoreMissing(chosen, (name, rows) => client()[name]!.restore(rows as (BackupRecord & { createdDate: string })[]), setBusy);
      setResult(out);
      chosen.forEach((d) => void qc.invalidateQueries({ queryKey: [d.name] }));
      const ok = out.reduce((n, o) => n + o.inserted, 0);
      const bad = out.reduce((n, o) => n + o.failed.length, 0);
      if (bad) toast.warning(`Restored ${ok}; ${bad} couldn't be restored — see the list.`);
      else toast.success(`Restored ${ok} record${ok === 1 ? "" : "s"}.`);
      setDiffs(null);
    } catch (e) {
      toast.error(`Restore stopped: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(null);
    }
  };

  const totals = diffs && {
    missing: diffs.reduce((n, d) => n + d.missing.length, 0),
    changed: diffs.reduce((n, d) => n + d.changed, 0),
    datasets: diffs.length,
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><RotateCcw className="size-4 text-primary" /> Check or restore a backup</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a backup ZIP (or its <span className="font-medium text-foreground">backup.json</span>). It&apos;s compared with the live data first — nothing changes until you press Restore — so this is also how you <span className="font-medium text-foreground">test a restore</span>. Restore only puts back records that are missing; anything edited since keeps its current version.
        </p>
        <input ref={input} type="file" accept=".zip,.json,application/zip,application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void check(f); e.target.value = ""; }} />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={!!busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ?? (fileName ? "Choose another backup" : "Choose a backup file")}
        </Button>

        {diffs && totals && (
          <div className="space-y-3">
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${totals.missing ? "border-warning/40 bg-warning/10" : "border-success/40 bg-success/10"}`}>
              {totals.missing ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
              <span>
                <strong>{fileName}</strong> read cleanly — {totals.datasets} datasets.{" "}
                {totals.missing ? `${totals.missing} record${totals.missing === 1 ? " is" : "s are"} in the backup but missing now.` : "Nothing in it is missing from the live data."}
                {totals.changed ? ` ${totals.changed} have been edited since (they'll be left as they are).` : ""}
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-3 py-2" /><th className="px-3 py-2">Dataset</th><th className="px-3 py-2 text-right">In backup</th><th className="px-3 py-2 text-right">Now</th><th className="px-3 py-2 text-right">Missing</th><th className="px-3 py-2 text-right">Edited since</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {diffs.filter((d) => d.inBackup || d.current).map((d) => (
                    <tr key={d.name} className={d.missing.length ? "" : "text-muted-foreground"}>
                      <td className="px-3 py-1.5">
                        {d.missing.length > 0 && !d.unknown && (
                          <input type="checkbox" aria-label={`Restore ${d.name}`} checked={picked.has(d.name)}
                            onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(d.name); else n.delete(d.name); return n; })} />
                        )}
                      </td>
                      <td className="px-3 py-1.5">{humanizeLabel(d.name)}{d.unknown && <Badge variant="secondary" className="ml-2">no longer in the app</Badge>}</td>
                      <td className="px-3 py-1.5 text-right">{d.inBackup}</td>
                      <td className="px-3 py-1.5 text-right">{d.unknown ? "—" : d.current}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{d.missing.length || ""}</td>
                      <td className="px-3 py-1.5 text-right">{d.changed || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totals.missing > 0 && (
              <Button onClick={run} disabled={!toRestore || !!busy}><RotateCcw /> Restore {toRestore} missing record{toRestore === 1 ? "" : "s"}</Button>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-1 rounded-md border border-border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><FileSearch className="size-4" /> Restore result</p>
            {result.map((r) => (
              <p key={r.name}>
                {humanizeLabel(r.name)}: {r.inserted} restored
                {r.failed.length > 0 && <span className="text-destructive"> · {r.failed.length} failed ({Array.from(new Set(r.failed.map((f) => f.error))).slice(0, 2).join("; ")})</span>}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

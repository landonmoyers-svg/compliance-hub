"use client";

import { useState } from "react";
import { CopyCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRemove, useUpdate } from "@/lib/data/hooks";
import type { CollectionName } from "@/lib/data/client";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

export interface DupItem { id: string; createdDate?: string }
export interface DupDescribe { title: string; subtitle?: string; badges?: string[]; hasFile?: boolean }

/** Normalize a string for duplicate-key comparison (lowercase, alphanumerics only). */
export const dupNorm = (s?: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const isEmptyVal = (v: unknown): boolean => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Fill the kept record's EMPTY fields from the duplicates being removed. Never
 *  overwrites a value the kept record already has; skips id/createdDate. */
function mergePatch<T extends DupItem>(kept: T, dropped: T[]): Partial<T> {
  const patch: Record<string, unknown> = {};
  const keys = new Set<string>();
  for (const o of [kept, ...dropped]) for (const k of Object.keys(o as object)) keys.add(k);
  for (const k of keys) {
    if (k === "id" || k === "createdDate") continue;
    if (!isEmptyVal((kept as Record<string, unknown>)[k])) continue;
    for (const o of dropped) {
      const v = (o as Record<string, unknown>)[k];
      if (!isEmptyVal(v)) { patch[k] = v; break; }
    }
  }
  return patch as Partial<T>;
}

/**
 * Drop-in "Find duplicates" button + review/delete modal for any list page.
 * The page supplies how to key records (records sharing a key are duplicates),
 * how to describe them, and an optional completeness score used to pre-select
 * which one to keep. Deletion is explicit and always keeps one per set.
 */
export function DuplicateFinder<T extends DupItem>({
  items,
  collection,
  keyOf,
  describe,
  score,
  label = "Find duplicates",
  variant = "outline",
}: {
  items: T[];
  collection: CollectionName;
  keyOf: (item: T) => string | null;
  describe: (item: T) => DupDescribe;
  score?: (item: T) => number;
  label?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  const remove = useRemove(collection);
  const update = useUpdate(collection);
  const [groups, setGroups] = useState<{ key: string; items: T[] }[] | null>(null);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [merge, setMerge] = useState(true);
  const [saving, setSaving] = useState(false);

  function scan() {
    const map = new Map<string, T[]>();
    for (const it of items) {
      const k = keyOf(it);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    const gs = [...map.entries()].filter(([, v]) => v.length > 1).map(([key, v]) => ({ key, items: v }));
    if (gs.length === 0) { toast.info("No duplicates found."); return; }
    const sc = score ?? (() => 0);
    const best: Record<string, string> = {};
    for (const g of gs) {
      best[g.key] = [...g.items].sort((a, b) => sc(b) - sc(a) || (b.createdDate ?? "").localeCompare(a.createdDate ?? ""))[0].id;
    }
    setKeep(best);
    setGroups(gs);
  }

  const toDelete = (groups ?? []).flatMap((g) => g.items.filter((it) => it.id !== keep[g.key]).map((it) => it.id));

  async function apply() {
    if (!groups) return;
    setSaving(true);
    let n = 0;
    try {
      for (const g of groups) {
        const keptId = keep[g.key];
        const dropped = g.items.filter((it) => it.id !== keptId);
        if (merge) {
          const keptItem = g.items.find((it) => it.id === keptId);
          if (keptItem) {
            const patch = mergePatch(keptItem, dropped);
            if (Object.keys(patch).length > 0) { try { await update.mutateAsync({ id: keptId, patch }); } catch { /* skip merge */ } }
          }
        }
        for (const it of dropped) { try { await remove.mutateAsync(it.id); n++; } catch { /* skip */ } }
      }
    } finally {
      setSaving(false);
      setGroups(null);
      toast.success(`${merge ? "Merged & deleted" : "Deleted"} ${n} duplicate${n === 1 ? "" : "s"}.`);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={scan}><CopyCheck className="size-4" /> {label}</Button>
      {groups && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && setGroups(null)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card text-foreground shadow-xl">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">Duplicates ({groups.length} {groups.length === 1 ? "set" : "sets"})</h2>
                <p className="text-xs text-muted-foreground">For each set, pick the one to keep — the rest are deleted. The most complete is pre-selected.</p>
              </div>
              <button onClick={() => setGroups(null)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {groups.map((g) => (
                <div key={g.key} className="space-y-1.5 rounded-lg border border-border p-3">
                  {g.items.map((it) => {
                    const d = describe(it);
                    const kept = keep[g.key] === it.id;
                    return (
                      <label key={it.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm", kept ? "border-primary/50 bg-primary/5" : "border-border/60 opacity-70")}>
                        <input type="radio" name={`dup-${g.key}`} className="mt-1" checked={kept} onChange={() => setKeep((m) => ({ ...m, [g.key]: it.id }))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{d.title}</span>
                            {d.badges?.map((b) => <Badge key={b} variant="secondary">{b}</Badge>)}
                            {d.hasFile && <Badge variant="outline" className="text-primary">has file</Badge>}
                            {kept ? <span className="text-xs font-medium text-primary">Keep</span> : <span className="text-xs text-destructive">Delete</span>}
                          </div>
                          {d.subtitle && <div className="truncate text-xs text-muted-foreground">{d.subtitle}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
                <input type="checkbox" className="size-4" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
                Merge details into the kept record
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{toDelete.length} to delete</span>
                <Button variant="outline" onClick={() => setGroups(null)} disabled={saving}>Cancel</Button>
                <Button onClick={apply} disabled={saving || toDelete.length === 0}>{saving ? "Working…" : `${merge ? "Merge & delete" : "Delete"} ${toDelete.length}`}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

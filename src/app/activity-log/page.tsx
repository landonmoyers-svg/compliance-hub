"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Sparkles, User, Undo2, Search } from "lucide-react";
import { useCollection, useUpdate } from "@/lib/data/hooks";
import { db } from "@/lib/data";
import type { CollectionName } from "@/lib/data/client";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { formatDate } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import { toast } from "sonner";

interface Entry {
  id: string; time: string; day: string;
  actorType: "user" | "ai"; actorName: string; assistant?: string;
  action: string; summary: string;
  reversible: boolean; undone: boolean;
  entityType?: string; entityId?: string;
  source: "ai" | "audit";
}

const dayKey = (iso: string) => iso.slice(0, 10);
const timeOf = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };

export default function ActivityLogPage() {
  const { profile } = useAuth();
  const activityQ = useCollection("activityLog");
  const auditQ = useCollection("auditLogs");
  const updateActivity = useUpdate("activityLog");
  const qc = useQueryClient();

  const [filter, setFilter] = useState<"all" | "ai" | "user">("all");
  const [search, setSearch] = useState("");

  const entries = useMemo<Entry[]>(() => {
    const ai: Entry[] = (activityQ.data ?? []).map((a) => ({
      id: a.id, time: a.createdDate, day: dayKey(a.createdDate),
      actorType: a.actorType, actorName: a.actorName ?? "Sage", assistant: a.assistant ?? undefined,
      action: a.action, summary: a.summary, reversible: a.reversible && !a.undone, undone: a.undone,
      entityType: a.entityType ?? undefined, entityId: a.entityId ?? undefined, source: "ai",
    }));
    const audit: Entry[] = (auditQ.data ?? []).map((a) => ({
      id: a.id, time: a.createdDate, day: dayKey(a.createdDate),
      actorType: "user", actorName: a.actorName, action: a.action,
      summary: a.details || `${a.action} ${a.entityLabel ?? a.entityType ?? ""}`.trim(),
      reversible: false, undone: false, entityType: a.entityType, entityId: a.entityId ?? undefined, source: "audit",
    }));
    return [...ai, ...audit].sort((x, y) => y.time.localeCompare(x.time));
  }, [activityQ.data, auditQ.data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => (filter === "all" || e.actorType === filter) && (!q || e.summary.toLowerCase().includes(q) || e.actorName.toLowerCase().includes(q)));
  }, [entries, filter, search]);

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of filtered) { if (!m.has(e.day)) m.set(e.day, []); m.get(e.day)!.push(e); }
    return Array.from(m.entries());
  }, [filtered]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => ({
    today: entries.filter((e) => e.day === todayKey).length,
    aiToday: entries.filter((e) => e.day === todayKey && e.actorType === "ai").length,
    undoable: entries.filter((e) => e.reversible).length,
  }), [entries, todayKey]);

  async function undo(e: Entry) {
    if (!e.reversible || !e.entityType || !e.entityId) return;
    if (!confirm(`Undo this AI action? This will delete the "${e.summary}" record it created.`)) return;
    try {
      await db()[e.entityType as CollectionName].remove(e.entityId);
      await updateActivity.mutateAsync({ id: e.id, patch: { undone: true, undoneAt: new Date().toISOString(), undoneBy: profile?.fullName ?? undefined } });
      await qc.invalidateQueries({ queryKey: [e.entityType] });
      toast.success("Undone — the AI's record was removed.");
    } catch {
      toast.error("Couldn't undo. The record may already be gone or referenced elsewhere.");
    }
  }

  const loading = activityQ.isLoading || auditQ.isLoading;
  const anyError = activityQ.isError || auditQ.isError;
  const refetchAll = () => { void activityQ.refetch(); void auditQ.refetch(); };

  if (anyError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Daily Activity Log" />
        <ErrorState message="We couldn't load this page's data." onRetry={() => void refetchAll()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Daily Activity Log" description="Every meaningful task by a person or Sage (the assistant), compiled by day. Sage's actions can be undone." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Actions today" value={stats.today} icon={Activity} loading={loading} />
        <StatCard label="AI actions today" value={stats.aiToday} icon={Sparkles} loading={loading} />
        <StatCard label="Undoable AI actions" value={stats.undoable} icon={Undo2} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search activity…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {(["all", "ai", "user"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                {f === "ai" ? "AI" : f}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : byDay.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="space-y-5">
              {byDay.map(([day, list]) => (
                <div key={day}>
                  <div className="sticky top-0 z-10 mb-1 bg-card py-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day === todayKey ? "Today" : formatDate(day, "EEEE, MMM d, yyyy")} <span className="text-muted-foreground/60">· {list.length}</span></h3>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((e) => (
                      <div key={`${e.source}-${e.id}`} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${e.actorType === "ai" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                          {e.actorType === "ai" ? <Sparkles className="size-3.5" /> : <User className="size-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${e.undone ? "text-muted-foreground line-through" : ""}`}>{e.summary}</p>
                          <p className="text-xs text-muted-foreground">{e.actorName}{e.assistant ? ` · ${humanizeLabel(e.assistant)}` : ""} · {timeOf(e.time)}{e.undone ? " · undone" : ""}</p>
                        </div>
                        {e.actorType === "ai" && <Badge variant="outline" className="shrink-0">AI</Badge>}
                        {e.reversible && (
                          <Button size="sm" variant="ghost" onClick={() => void undo(e)} title="Undo this AI action"><Undo2 className="size-4" /></Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

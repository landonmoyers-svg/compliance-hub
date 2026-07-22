"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { EmergencyScenarios } from "@/components/emergency/emergency-scenarios";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { formatDate, isExpired, daysUntil, dateInputToISO } from "@/lib/dates";
import type { EmergencyDrill } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { toast } from "sonner";

const STATUS_VARIANT = {
  scheduled: "secondary",
  completed: "success",
  cancelled: "destructive",
} as const;


/* ----------------------------- dialog ------------------------------- */

interface DrillForm {
  drillTitle: string;
  drillType: string;
  scheduledDate: string;
  status: EmergencyDrill["status"];
  participantCount: string;
}

const EMPTY: DrillForm = {
  drillTitle: "",
  drillType: "fire",
  scheduledDate: "",
  status: "scheduled",
  participantCount: "0",
};

function DrillDialog({
  initial,
  prefill,
  onClose,
  onSave,
  saving,
}: {
  initial?: EmergencyDrill;
  prefill?: Partial<DrillForm>;
  onClose: () => void;
  onSave: (data: DrillForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<DrillForm>(
    initial
      ? {
          drillTitle: initial.drillTitle,
          drillType: initial.drillType,
          scheduledDate: initial.scheduledDate ?? "",
          status: initial.status,
          participantCount: String(initial.participantCount),
        }
      : { ...EMPTY, ...prefill },
  );

  const set =
    (k: keyof DrillForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const participantNum = parseInt(form.participantCount, 10);
  const participantValid = form.participantCount === "" || (!isNaN(participantNum) && participantNum >= 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit drill" : "Schedule drill"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Drill title *</label>
            <input className="input w-full" value={form.drillTitle} onChange={set("drillTitle")} placeholder="e.g. Annual Fire Evacuation" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <input className="input w-full" value={form.drillType} onChange={set("drillType")} placeholder="fire, tornado, lockdown…" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select className="input w-full" value={form.status} onChange={set("status")}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date</label>
              <input type="date" className="input w-full" value={form.scheduledDate} onChange={set("scheduledDate")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Participants</label>
              <input type="number" min="0" className="input w-full" value={form.participantCount} onChange={set("participantCount")} />
              {!participantValid && <p className="text-xs text-destructive">Must be ≥ 0</p>}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.drillTitle.trim() || !participantValid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function EmergencyPreparednessPage() {
  const { data, isLoading, isError, refetch } = useCollection("emergencyDrills");
  const createMut = useCreate("emergencyDrills");
  const updateMut = useUpdate("emergencyDrills");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<EmergencyDrill["status"] | "all">("all");
  const [editing, setEditing] = useState<EmergencyDrill | null | "new">(null);
  const [drillPrefill, setDrillPrefill] = useState<Partial<DrillForm> | null>(null);
  const [saving, setSaving] = useState(false);

  const drills = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return drills.filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (q && !d.drillTitle.toLowerCase().includes(q) && !d.drillType.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [drills, search, filterStatus]);

  const { sorted, sort, toggle } = useSort(filtered, {
    title: (d) => d.drillTitle,
    type: (d) => d.drillType,
    date: (d) => d.scheduledDate,
    participants: (d) => d.participantCount,
    status: (d) => d.status,
  });

  const stats = useMemo(() => {
    const upcoming = drills.filter((d) => {
      const days = daysUntil(d.scheduledDate);
      return d.status === "scheduled" && days !== null && days >= 0;
    });
    const overdue = drills.filter((d) => d.status === "scheduled" && isExpired(d.scheduledDate));
    return {
      scheduled: drills.filter((d) => d.status === "scheduled").length,
      completed: drills.filter((d) => d.status === "completed").length,
      overdue: overdue.length,
      upcoming: upcoming.length,
    };
  }, [drills]);

  async function handleSave(form: DrillForm) {
    setSaving(true);
    try {
      const payload = {
        drillTitle: form.drillTitle.trim(),
        drillType: form.drillType.trim() || "fire",
        scheduledDate: form.scheduledDate ? dateInputToISO(form.scheduledDate) : undefined,
        status: form.status,
        participantCount: parseInt(form.participantCount, 10) || 0,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Drill updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Drill scheduled");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save drill");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Emergency Preparedness" />
        <ErrorState message="We couldn't load drills." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <DrillDialog
          initial={editing === "new" ? undefined : editing}
          prefill={editing === "new" ? (drillPrefill ?? undefined) : undefined}
          onClose={() => { setEditing(null); setDrillPrefill(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Emergency Preparedness"
        description="A written response plan, a backing policy, and a recent drill for every emergency scenario your practice must be ready for."
      />

      {/* Readiness + scenarios (plans, SOPs) */}
      <EmergencyScenarios onScheduleDrill={(label, drillType) => {
        setDrillPrefill({ drillTitle: `${label} Drill`, drillType, status: "scheduled", scheduledDate: "", participantCount: "0" });
        setEditing("new");
      }} />

      {/* Drills & testing — its own section */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-base font-semibold">Drills &amp; testing</h2>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> Schedule drill</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Scheduled" value={stats.scheduled} icon={AlertTriangle} tone="warning" loading={isLoading} />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Upcoming (next 30d)" value={stats.upcoming} icon={AlertTriangle} loading={isLoading} />
        <StatCard label="Completed" value={stats.completed} icon={AlertTriangle} tone="success" loading={isLoading} />
      </div>

      {stats.overdue > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {stats.overdue} drill{stats.overdue > 1 ? "s are" : " is"} past the scheduled date and still marked as scheduled. Update the status or reschedule.
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search drills…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "scheduled", "completed", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {humanizeLabel(s)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No drills found"
              description={search || filterStatus !== "all" ? "Try adjusting your filter." : "Schedule your first emergency drill."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Schedule drill</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggle} />
                    <SortHeader label="Participants" sortKey="participants" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => {
                    const days = daysUntil(d.scheduledDate);
                    const overdue = d.status === "scheduled" && isExpired(d.scheduledDate);
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Title" className="py-3 pr-4 font-medium">{d.drillTitle}</td>
                        <td data-label="Type" className="py-3 pr-4 capitalize">{humanizeLabel(d.drillType)}</td>
                        <td data-label="Date" className="py-3 pr-4">
                          {d.scheduledDate ? (
                            <div>
                              <div className={overdue ? "text-destructive" : ""}>{formatDate(d.scheduledDate)}</div>
                              {d.status === "scheduled" && days !== null && (
                                <div className="text-xs text-muted-foreground">
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d away`}
                                </div>
                              )}
                            </div>
                          ) : "—"}
                        </td>
                        <td data-label="Participants" className="py-3 pr-4">{d.participantCount}</td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditing(d)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={overdue ? "destructive" : STATUS_VARIANT[d.status]}>
                              {overdue ? "Overdue" : humanizeLabel(d.status)}
                            </Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

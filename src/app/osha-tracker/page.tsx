"use client";

import { useState, useMemo } from "react";
import { ClipboardCheck, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { OSHARecord } from "@/lib/data/schema";
import { toast } from "sonner";

const STATUS_VARIANT = {
  open: "warning",
  in_progress: "warning",
  closed: "success",
} as const;

const RECORD_TYPE_LABEL: Record<OSHARecord["recordType"], string> = {
  injury: "Injury",
  illness: "Illness",
  hazcom: "HazCom",
  training: "Training",
  inspection: "Inspection",
  corrective_action: "Corrective action",
};

const RECORDABILITY_VARIANT = {
  not_reviewed: "secondary",
  recordable: "destructive",
  non_recordable: "success",
} as const;

/* ----------------------------- dialog ------------------------------- */

interface RecordForm {
  recordTitle: string;
  recordType: OSHARecord["recordType"];
  eventDate: string;
  description: string;
  status: OSHARecord["status"];
  recordabilityStatus: OSHARecord["recordabilityStatus"];
}

const EMPTY: RecordForm = {
  recordTitle: "",
  recordType: "inspection",
  eventDate: "",
  description: "",
  status: "open",
  recordabilityStatus: "not_reviewed",
};

function RecordDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: OSHARecord;
  onClose: () => void;
  onSave: (data: RecordForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RecordForm>(
    initial
      ? {
          recordTitle: initial.recordTitle,
          recordType: initial.recordType,
          eventDate: initial.eventDate ?? "",
          description: initial.description ?? "",
          status: initial.status,
          recordabilityStatus: initial.recordabilityStatus,
        }
      : EMPTY,
  );

  const set =
    (k: keyof RecordForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit OSHA record" : "New OSHA record"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Title *</label>
            <input className="input w-full" value={form.recordTitle} onChange={set("recordTitle")} placeholder="Brief title" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Record type</label>
            <select className="input w-full" value={form.recordType} onChange={set("recordType")}>
              {(Object.entries(RECORD_TYPE_LABEL) as [OSHARecord["recordType"], string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Event date</label>
            <input type="date" className="input w-full" value={form.eventDate} onChange={set("eventDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.status} onChange={set("status")}>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Recordability</label>
            <select className="input w-full" value={form.recordabilityStatus} onChange={set("recordabilityStatus")}>
              <option value="not_reviewed">Not reviewed</option>
              <option value="recordable">Recordable</option>
              <option value="non_recordable">Non-recordable</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <textarea className="input w-full resize-none" rows={3} value={form.description} onChange={set("description")} placeholder="Details about the incident or inspection" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.recordTitle.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function OSHATrackerPage() {
  const { data, isLoading, isError, refetch } = useCollection("oshaRecords");
  const createMut = useCreate("oshaRecords");
  const updateMut = useUpdate("oshaRecords");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<OSHARecord["recordType"] | "all">("all");
  const [filterStatus, setFilterStatus] = useState<OSHARecord["status"] | "all">("all");
  const [editing, setEditing] = useState<OSHARecord | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const records = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (filterType !== "all" && r.recordType !== filterType) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (q && !r.recordTitle.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, search, filterType, filterStatus]);

  const { sorted, sort, toggle } = useSort(filtered, {
    title: (r) => r.recordTitle,
    type: (r) => RECORD_TYPE_LABEL[r.recordType],
    eventDate: (r) => r.eventDate,
    status: (r) => r.status,
    recordability: (r) => r.recordabilityStatus,
  });

  const stats = useMemo(() => ({
    open: records.filter((r) => r.status === "open").length,
    recordable: records.filter((r) => r.recordabilityStatus === "recordable").length,
    injuries: records.filter((r) => r.recordType === "injury" || r.recordType === "illness").length,
    total: records.length,
  }), [records]);

  async function handleSave(form: RecordForm) {
    setSaving(true);
    try {
      const payload = {
        recordTitle: form.recordTitle.trim(),
        recordType: form.recordType,
        eventDate: form.eventDate ? dateInputToISO(form.eventDate) : undefined,
        description: form.description.trim() || undefined,
        status: form.status,
        recordabilityStatus: form.recordabilityStatus,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Record updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Record created");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="OSHA Tracker" />
        <ErrorState message="We couldn't load OSHA records." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <RecordDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="OSHA Tracker"
        description="Log and track OSHA-recordable events, inspections, HazCom, and corrective actions."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New record
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Open" value={stats.open} icon={ClipboardCheck} tone="warning" loading={isLoading} />
        <StatCard label="Recordable events" value={stats.recordable} icon={ClipboardCheck} tone={stats.recordable ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="Injuries / illnesses" value={stats.injuries} icon={ClipboardCheck} tone={stats.injuries ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Total records" value={stats.total} icon={ClipboardCheck} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search records…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as OSHARecord["recordType"] | "all")}
            >
              <option value="all">All types</option>
              {(Object.entries(RECORD_TYPE_LABEL) as [OSHARecord["recordType"], string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              className="input"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as OSHARecord["status"] | "all")}
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No records found"
              description={search || filterType !== "all" || filterStatus !== "all" ? "Try adjusting your filters." : "No OSHA records yet."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New record</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Event date" sortKey="eventDate" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <SortHeader label="Recordability" sortKey="recordability" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td data-label="Title" className="py-3 pr-4 font-medium">{r.recordTitle}</td>
                      <td data-label="Type" className="py-3 pr-4">{RECORD_TYPE_LABEL[r.recordType]}</td>
                      <td data-label="Event date" className="py-3 pr-4">{r.eventDate ? formatDate(r.eventDate) : "—"}</td>
                      <td data-label="Status" className="py-3 pr-4">
                        <button type="button" onClick={() => setEditing(r)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                          <Badge variant={STATUS_VARIANT[r.status]}>
                            {r.status === "in_progress" ? "In progress" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </Badge>
                        </button>
                      </td>
                      <td data-label="Recordability" className="py-3 pr-4">
                        <button type="button" onClick={() => setEditing(r)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                          <Badge variant={RECORDABILITY_VARIANT[r.recordabilityStatus]}>
                            {r.recordabilityStatus === "not_reviewed" ? "Not reviewed" : r.recordabilityStatus === "recordable" ? "Recordable" : "Non-recordable"}
                          </Badge>
                        </button>
                      </td>
                      <td data-label="" className="py-3">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

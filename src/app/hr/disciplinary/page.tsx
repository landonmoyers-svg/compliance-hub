"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, Plus, Search, X, Check } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { formatDate } from "@/lib/dates";
import type { DisciplinaryAction, Employee } from "@/lib/data/schema";
import { humanizeLabel } from "@/lib/format";
import { toast } from "sonner";

type ActionType = DisciplinaryAction["actionType"];
type Status = DisciplinaryAction["status"];

const TYPE_LABEL: Record<ActionType, string> = {
  verbal_warning: "Verbal warning",
  written_warning: "Written warning",
  final_warning: "Final warning",
  pip: "PIP",
  suspension: "Suspension",
  termination: "Termination",
  other: "Other",
};

const TYPE_VARIANT: Record<ActionType, "secondary" | "warning" | "destructive"> = {
  verbal_warning: "secondary",
  written_warning: "warning",
  final_warning: "warning",
  pip: "warning",
  suspension: "destructive",
  termination: "destructive",
  other: "secondary",
};

const STATUS_VARIANT: Record<Status, "warning" | "success" | "destructive" | "secondary"> = {
  active: "warning",
  resolved: "success",
  escalated: "destructive",
  archived: "secondary",
};

const ACTION_TYPES = Object.keys(TYPE_LABEL) as ActionType[];

function employeeName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

interface FormState {
  employeeId: string;
  actionType: ActionType;
  reason: string;
  description: string;
  issuedDate: string;
  followUpDate: string;
  witnessNames: string;
  status: Status;
}

const EMPTY_FORM: FormState = {
  employeeId: "",
  actionType: "verbal_warning",
  reason: "",
  description: "",
  issuedDate: "",
  followUpDate: "",
  witnessNames: "",
  status: "active",
};

/* ─── form dialog ───────────────────────────────────────────── */

function ActionDialog({
  initial,
  employees,
  onClose,
  onSave,
  saving,
}: {
  initial?: DisciplinaryAction;
  employees: Employee[];
  onClose: () => void;
  onSave: (form: FormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          employeeId: initial.employeeId,
          actionType: initial.actionType,
          reason: initial.reason,
          description: initial.description ?? "",
          issuedDate: initial.issuedDate ?? "",
          followUpDate: initial.followUpDate ?? "",
          witnessNames: (initial.witnessNames ?? []).join(", "),
          status: initial.status,
        }
      : EMPTY_FORM,
  );

  const dateError =
    form.issuedDate && form.followUpDate && form.followUpDate < form.issuedDate
      ? "Follow-up date must be on or after the issued date."
      : null;

  const canSave = !!form.reason.trim() && !dateError && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit disciplinary action" : "Record disciplinary action"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Employee</label>
            <select className="input w-full" value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}>
              <option value="">Select an employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{employeeName(emp)}{emp.title ? ` — ${emp.title}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Action type</label>
            <select className="input w-full" value={form.actionType} onChange={(e) => setForm((p) => ({ ...p, actionType: e.target.value as ActionType }))}>
              {ACTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Status }))}>
              {(["active", "resolved", "escalated", "archived"] as const).map((s) => (
                <option key={s} value={s}>{humanizeLabel(s)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Reason *</label>
            <input className="input w-full" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Short summary of the reason" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Date issued</label>
            <input type="date" className="input w-full" value={form.issuedDate} onChange={(e) => setForm((p) => ({ ...p, issuedDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Follow-up date</label>
            <input type="date" className="input w-full" value={form.followUpDate} min={form.issuedDate || undefined} onChange={(e) => setForm((p) => ({ ...p, followUpDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Witnesses</label>
            <input className="input w-full" value={form.witnessNames} onChange={(e) => setForm((p) => ({ ...p, witnessNames: e.target.value }))} placeholder="Comma-separated names" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <textarea className="input w-full min-h-[80px] resize-y" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Document the incident and action taken…" />
          </div>
          {dateError && <p className="sm:col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{dateError}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!canSave}>
            {saving ? "Saving…" : <><Check className="size-3" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── resolve dialog ────────────────────────────────────────── */

function ResolveDialog({
  record,
  onClose,
  onResolve,
  saving,
}: {
  record: DisciplinaryAction;
  onClose: () => void;
  onResolve: (note: string) => void;
  saving: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Resolve action</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">{record.employeeName} — {TYPE_LABEL[record.actionType]}</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Resolution note</label>
            <textarea className="input w-full min-h-[80px] resize-y" value={note} onChange={(e) => setNote(e.target.value)} placeholder="How was this resolved? (optional)" autoFocus />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onResolve(note.trim())} disabled={saving}>
            {saving ? "Saving…" : <><Check className="size-3" /> Mark resolved</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────── */

export default function DisciplinaryPage() {
  const { profile, user } = useAuth();
  const myName = profile?.fullName ?? user?.fullName ?? "";

  const actionsQ = useCollection("disciplinaryActions");
  const employeesQ = useCollection("employees");
  const createAction = useCreate("disciplinaryActions");
  const updateAction = useUpdate("disciplinaryActions");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [editing, setEditing] = useState<DisciplinaryAction | null | "new">(null);
  const [resolving, setResolving] = useState<DisciplinaryAction | null>(null);
  const [saving, setSaving] = useState(false);

  const records = useMemo(() => actionsQ.data ?? [], [actionsQ.data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (q && !r.employeeName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [records, search, filterStatus]);

  const stats = useMemo(() => ({
    total: records.length,
    active: records.filter((r) => r.status === "active").length,
    activePips: records.filter((r) => r.actionType === "pip" && r.status === "active").length,
    terminations: records.filter((r) => r.actionType === "termination").length,
  }), [records]);

  async function handleSave(form: FormState) {
    if (!form.reason.trim()) { toast.error("Reason is required."); return; }
    if (form.issuedDate && form.followUpDate && form.followUpDate < form.issuedDate) {
      toast.error("Follow-up date must be on or after the issued date.");
      return;
    }
    const emp = employees.find((e) => e.id === form.employeeId);
    const witnessNames = form.witnessNames.split(",").map((w) => w.trim()).filter(Boolean);

    setSaving(true);
    try {
      const patch = {
        employeeId: form.employeeId,
        employeeName: emp ? employeeName(emp) : (editing && editing !== "new" ? editing.employeeName : ""),
        actionType: form.actionType,
        reason: form.reason.trim(),
        description: form.description.trim() || undefined,
        witnessNames,
        issuedDate: form.issuedDate || null,
        followUpDate: form.followUpDate || null,
        status: form.status,
      };

      if (editing && editing !== "new") {
        await updateAction.mutateAsync({ id: editing.id, patch });
        toast.success("Disciplinary action updated");
      } else {
        await createAction.mutateAsync({
          ...patch,
          issuedByName: myName || undefined,
          resolutionNote: null,
        });
        toast.success("Disciplinary action recorded");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save disciplinary action");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(note: string) {
    if (!resolving) return;
    setSaving(true);
    try {
      await updateAction.mutateAsync({
        id: resolving.id,
        patch: { status: "resolved", resolutionNote: note || null },
      });
      toast.success("Marked resolved");
      setResolving(null);
    } catch {
      toast.error("Failed to resolve action");
    } finally {
      setSaving(false);
    }
  }

  if (actionsQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Disciplinary Actions" />
        <ErrorState message="We couldn't load disciplinary records." onRetry={() => void actionsQ.refetch()} />
      </div>
    );
  }

  const loading = actionsQ.isLoading || employeesQ.isLoading;

  return (
    <div className="space-y-6">
      {editing && (
        <ActionDialog
          initial={editing === "new" ? undefined : editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {resolving && (
        <ResolveDialog
          record={resolving}
          onClose={() => setResolving(null)}
          onResolve={handleResolve}
          saving={saving}
        />
      )}

      <PageHeader
        title="Disciplinary Actions"
        description="Verbal warnings, written warnings, PIPs, and formal disciplinary records. Stored confidentially — HR and admin only."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add record</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total records" value={stats.total} icon={AlertTriangle} loading={loading} />
        <StatCard label="Active cases" value={stats.active} icon={AlertTriangle} tone={stats.active > 0 ? "warning" : "default"} loading={loading} />
        <StatCard label="Active PIPs" value={stats.activePips} icon={AlertTriangle} tone={stats.activePips > 0 ? "warning" : "default"} loading={loading} />
        <StatCard label="Terminations" value={stats.terminations} icon={AlertTriangle} tone={stats.terminations > 0 ? "destructive" : "default"} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search by employee name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search disciplinary records"
              />
            </div>
            {(["all", "active", "resolved", "escalated", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
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
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No records found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "No disciplinary actions on record."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add record</Button>}
            />
          ) : (
            <div className="space-y-4">
              {filtered.map((r) => (
                <div key={r.id} className="rounded-lg border border-border bg-secondary/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{r.employeeName || "—"}</p>
                        <Badge variant={TYPE_VARIANT[r.actionType]}>{TYPE_LABEL[r.actionType]}</Badge>
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          title="Open to manage"
                          className="cursor-pointer"
                        >
                          <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{humanizeLabel(r.status)}</Badge>
                        </button>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Issued {formatDate(r.issuedDate)}{r.issuedByName ? ` by ${r.issuedByName}` : ""}
                        {r.followUpDate && ` · Follow-up: ${formatDate(r.followUpDate)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                      {r.status === "active" && (
                        <Button size="sm" variant="outline" onClick={() => setResolving(r)}>Resolve</Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-medium">{r.reason}</p>
                  {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
                  {r.witnessNames && r.witnessNames.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Witnesses: {r.witnessNames.join(", ")}</p>
                  )}
                  {r.resolutionNote && (
                    <p className="mt-2 rounded-md bg-success/10 px-3 py-2 text-sm text-muted-foreground">Resolution: {r.resolutionNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

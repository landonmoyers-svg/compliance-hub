"use client";

import { useState, useMemo } from "react";
import { ShieldAlert, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { RiskManagementCase } from "@/lib/data/schema";
import { toast } from "sonner";

const SEVERITY_VARIANT = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "secondary",
} as const;

const STATUS_VARIANT = {
  open: "warning",
  investigating: "warning",
  resolved: "success",
  closed: "secondary",
} as const;

/* ----------------------------- dialog ------------------------------- */

interface CaseForm {
  caseTitle: string;
  caseType: string;
  description: string;
  severity: RiskManagementCase["severity"];
  status: RiskManagementCase["status"];
  accessLevel: RiskManagementCase["accessLevel"];
  reportedByName: string;
  incidentDate: string;
}

const EMPTY: CaseForm = {
  caseTitle: "",
  caseType: "clinical",
  description: "",
  severity: "medium",
  status: "open",
  accessLevel: "standard",
  reportedByName: "",
  incidentDate: "",
};

function CaseDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: RiskManagementCase;
  onClose: () => void;
  onSave: (data: CaseForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CaseForm>(
    initial
      ? {
          caseTitle: initial.caseTitle,
          caseType: initial.caseType,
          description: initial.description ?? "",
          severity: initial.severity,
          status: initial.status,
          accessLevel: initial.accessLevel,
          reportedByName: initial.reportedByName ?? "",
          incidentDate: initial.incidentDate ?? "",
        }
      : EMPTY,
  );

  const set =
    (k: keyof CaseForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit risk case" : "New risk case"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Case title *</label>
            <input className="input w-full" value={form.caseTitle} onChange={set("caseTitle")} placeholder="Brief description of the incident" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Case type</label>
            <input className="input w-full" value={form.caseType} onChange={set("caseType")} placeholder="clinical, administrative…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reported by</label>
            <input className="input w-full" value={form.reportedByName} onChange={set("reportedByName")} placeholder="Reporter name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Severity *</label>
            <select className="input w-full" value={form.severity} onChange={set("severity")}>
              {(["critical", "high", "medium", "low"] as const).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.status} onChange={set("status")}>
              {(["open", "investigating", "resolved", "closed"] as const).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Incident date</label>
            <input type="date" className="input w-full" value={form.incidentDate} onChange={set("incidentDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Access level</label>
            <select className="input w-full" value={form.accessLevel} onChange={set("accessLevel")}>
              <option value="standard">Standard</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <textarea className="input w-full resize-none" rows={3} value={form.description} onChange={set("description")} placeholder="Detailed description of the incident" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.caseTitle.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function RiskManagementPage() {
  const { data, isLoading, isError, refetch } = useCollection("riskCases");
  const createMut = useCreate("riskCases");
  const updateMut = useUpdate("riskCases");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<RiskManagementCase["status"] | "open_all" | "all">("open_all");
  const [editing, setEditing] = useState<RiskManagementCase | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const cases = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cases.filter((c) => {
      if (filterStatus === "open_all" && c.status !== "open" && c.status !== "investigating") return false;
      if (filterStatus !== "open_all" && filterStatus !== "all" && c.status !== filterStatus) return false;
      if (q && !c.caseTitle.toLowerCase().includes(q) && !(c.reportedByName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cases, search, filterStatus]);

  const stats = useMemo(() => ({
    open: cases.filter((c) => c.status === "open").length,
    investigating: cases.filter((c) => c.status === "investigating").length,
    critical: cases.filter((c) => c.severity === "critical" && (c.status === "open" || c.status === "investigating")).length,
    resolved: cases.filter((c) => c.status === "resolved" || c.status === "closed").length,
  }), [cases]);

  async function handleSave(form: CaseForm) {
    setSaving(true);
    try {
      const payload = {
        caseTitle: form.caseTitle.trim(),
        caseType: form.caseType.trim() || "clinical",
        description: form.description.trim() || undefined,
        severity: form.severity,
        status: form.status,
        accessLevel: form.accessLevel,
        reportedByName: form.reportedByName.trim() || undefined,
        incidentDate: form.incidentDate ? dateInputToISO(form.incidentDate) : undefined,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Case updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Case created");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save case");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="HIPAA & Risk Management" />
        <ErrorState message="We couldn't load risk cases." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <CaseDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="HIPAA & Risk Management"
        description="Track and investigate compliance incidents, HIPAA breaches, and risk cases."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New case
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Open" value={stats.open} icon={ShieldAlert} tone="warning" loading={isLoading} />
        <StatCard label="Investigating" value={stats.investigating} icon={ShieldAlert} tone="warning" loading={isLoading} />
        <StatCard label="Critical (active)" value={stats.critical} icon={ShieldAlert} tone="destructive" loading={isLoading} />
        <StatCard label="Resolved / closed" value={stats.resolved} icon={ShieldAlert} tone="success" loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search cases…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {([
              { value: "all", label: "All" },
              { value: "open_all", label: "Active" },
              { value: "open", label: "Open" },
              { value: "investigating", label: "Investigating" },
              { value: "resolved", label: "Resolved" },
              { value: "closed", label: "Closed" },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilterStatus(value)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No cases found"
              description={search || filterStatus !== "all" ? "Try adjusting your filter." : "No risk cases recorded yet."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New case</Button>}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-card p-4 hover:border-border/80"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{c.caseTitle}</p>
                        <Badge variant={SEVERITY_VARIANT[c.severity]}>{c.severity}</Badge>
                        <button type="button" onClick={() => setEditing(c)} title="Open to manage" className="cursor-pointer">
                          <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                        </button>
                        {c.accessLevel === "restricted" && (
                          <Badge variant="outline">Restricted</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="capitalize">{c.caseType}</span>
                        {c.reportedByName && <span>Reported by {c.reportedByName}</span>}
                        {c.incidentDate && <span>Incident: {formatDate(c.incidentDate)}</span>}
                      </div>
                      {c.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
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

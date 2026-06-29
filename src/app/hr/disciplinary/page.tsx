"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";

interface DisciplinaryAction {
  id: string;
  employeeName: string;
  actionType: "verbal_warning" | "written_warning" | "pip" | "suspension" | "termination";
  issuedDate: string;
  issuedBy: string;
  description: string;
  followUpDate?: string;
  status: "open" | "resolved" | "escalated";
}

const SEED: DisciplinaryAction[] = [
  { id: "d1", employeeName: "David Lee", actionType: "written_warning", issuedDate: "2026-04-15", issuedBy: "Jane Doe", description: "Repeated tardiness — arriving 15+ minutes late on 4 occasions in 30 days. First written warning issued.", followUpDate: "2026-05-15", status: "open" },
  { id: "d2", employeeName: "David Lee", actionType: "pip", issuedDate: "2026-05-15", issuedBy: "Jane Doe", description: "Performance Improvement Plan initiated following continued documentation accuracy issues. 30-day plan with weekly check-ins.", followUpDate: "2026-06-15", status: "open" },
  { id: "d3", employeeName: "Mike Carter", actionType: "verbal_warning", issuedDate: "2026-02-01", issuedBy: "Jane Doe", description: "Verbal warning for unauthorized use of patient scheduling system outside role scope. Documented.", status: "resolved" },
];

const TYPE_LABEL: Record<DisciplinaryAction["actionType"], string> = {
  verbal_warning: "Verbal warning",
  written_warning: "Written warning",
  pip: "PIP",
  suspension: "Suspension",
  termination: "Termination",
};

const TYPE_VARIANT: Record<DisciplinaryAction["actionType"], "secondary" | "warning" | "destructive"> = {
  verbal_warning: "secondary",
  written_warning: "warning",
  pip: "warning",
  suspension: "destructive",
  termination: "destructive",
};

const STATUS_VARIANT: Record<DisciplinaryAction["status"], "warning" | "success" | "destructive"> = {
  open: "warning",
  resolved: "success",
  escalated: "destructive",
};

export default function DisciplinaryPage() {
  const [records, setRecords] = useState<DisciplinaryAction[]>(SEED);
  const [showNew, setShowNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | DisciplinaryAction["status"]>("all");
  const [form, setForm] = useState({
    employeeName: "",
    actionType: "verbal_warning" as DisciplinaryAction["actionType"],
    issuedDate: "",
    description: "",
    followUpDate: "",
  });

  const filtered = useMemo(
    () => (filterStatus === "all" ? records : records.filter((r) => r.status === filterStatus)),
    [records, filterStatus],
  );

  const stats = useMemo(() => ({
    total: records.length,
    open: records.filter((r) => r.status === "open").length,
    pips: records.filter((r) => r.actionType === "pip").length,
  }), [records]);

  function save() {
    if (!form.employeeName.trim() || !form.issuedDate || !form.description.trim()) {
      toast.error("Name, date, and description are required");
      return;
    }
    setRecords((prev) => [
      {
        id: `d-${Date.now()}`,
        employeeName: form.employeeName.trim(),
        actionType: form.actionType,
        issuedDate: form.issuedDate,
        issuedBy: "Jane Doe",
        description: form.description.trim(),
        followUpDate: form.followUpDate || undefined,
        status: "open",
      },
      ...prev,
    ]);
    setShowNew(false);
    setForm({ employeeName: "", actionType: "verbal_warning", issuedDate: "", description: "", followUpDate: "" });
    toast.success("Disciplinary action recorded");
  }

  function resolve(id: string) {
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status: "resolved" } : r));
    toast.success("Marked resolved");
  }

  return (
    <div className="space-y-6">
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowNew(false)}
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Record disciplinary action</h2>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Employee *</label>
                <input className="input w-full" value={form.employeeName} onChange={(e) => setForm((p) => ({ ...p, employeeName: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Action type</label>
                <select className="input w-full" value={form.actionType} onChange={(e) => setForm((p) => ({ ...p, actionType: e.target.value as DisciplinaryAction["actionType"] }))}>
                  <option value="verbal_warning">Verbal warning</option>
                  <option value="written_warning">Written warning</option>
                  <option value="pip">PIP</option>
                  <option value="suspension">Suspension</option>
                  <option value="termination">Termination</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date issued *</label>
                <input type="date" className="input w-full" value={form.issuedDate} onChange={(e) => setForm((p) => ({ ...p, issuedDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Follow-up date</label>
                <input type="date" className="input w-full" value={form.followUpDate} onChange={(e) => setForm((p) => ({ ...p, followUpDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Description *</label>
                <textarea className="input w-full min-h-[80px] resize-y" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Document the incident and action taken…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={save} disabled={!form.employeeName.trim() || !form.issuedDate || !form.description.trim()}>Save</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Disciplinary Actions"
        description="Verbal warnings, written warnings, PIPs, and formal disciplinary records. Stored confidentially — HR and admin only."
        actions={
          <Button onClick={() => setShowNew(true)}><Plus className="size-4" /> Add record</Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total records" value={stats.total} icon={AlertTriangle} />
        <StatCard label="Open actions" value={stats.open} icon={AlertTriangle} tone={stats.open > 0 ? "warning" : "default"} />
        <StatCard label="Active PIPs" value={stats.pips} icon={AlertTriangle} tone={stats.pips > 0 ? "warning" : "default"} />
      </div>

      <div className="flex gap-2">
        {(["all", "open", "resolved", "escalated"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
              filterStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No records found" description={filterStatus !== "all" ? "Try changing the filter." : "No disciplinary actions on record."} action={<Button onClick={() => setShowNew(true)}><Plus className="size-4" /> Add record</Button>} />
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{r.employeeName}</p>
                      <Badge variant={TYPE_VARIANT[r.actionType]}>{TYPE_LABEL[r.actionType]}</Badge>
                      <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">{r.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Issued {formatDate(r.issuedDate)} by {r.issuedBy}
                      {r.followUpDate && ` · Follow-up: ${formatDate(r.followUpDate)}`}
                    </p>
                  </div>
                  {r.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => resolve(r.id)}>Resolve</Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

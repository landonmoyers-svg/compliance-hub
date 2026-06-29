"use client";

import { useState, useMemo } from "react";
import { GraduationCap, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { assignmentIsOverdue } from "@/lib/compliance";
import { formatDate, daysUntil, dateInputToISO } from "@/lib/dates";
import type { TrainingAssignment } from "@/lib/data/schema";
import { toast } from "sonner";

/* ----------------------------- dialog ------------------------------- */

interface AssignForm {
  moduleTitle: string;
  assignedToName: string;
  dueDate: string;
}

function AssignDialog({
  modules,
  onClose,
  onSave,
  saving,
}: {
  modules: { id: string; title: string }[];
  onClose: () => void;
  onSave: (data: AssignForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AssignForm>({
    moduleTitle: modules[0]?.title ?? "",
    assignedToName: "",
    dueDate: "",
  });

  const set = (k: keyof AssignForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const valid = form.moduleTitle && form.assignedToName.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Assign training</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Training module *</label>
            <select className="input w-full" value={form.moduleTitle} onChange={set("moduleTitle")}>
              {modules.map((m) => (
                <option key={m.id} value={m.title}>{m.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assign to *</label>
            <input
              className="input w-full"
              value={form.assignedToName}
              onChange={set("assignedToName")}
              placeholder="Employee full name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Due date</label>
            <input type="date" className="input w-full" value={form.dueDate} onChange={set("dueDate")} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!valid || saving}>
            {saving ? "Saving…" : "Assign"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function TrainingPage() {
  const modulesQ = useCollection("trainingModules");
  const assignQ = useCollection("trainingAssignments");
  const createMut = useCreate("trainingAssignments");
  const updateMut = useUpdate("trainingAssignments");

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "overdue" | "completed">("all");
  const [showAssign, setShowAssign] = useState(false);
  const [saving, setSaving] = useState(false);

  const modules = useMemo(() => modulesQ.data ?? [], [modulesQ.data]);
  const assignments = useMemo(() => assignQ.data ?? [], [assignQ.data]);

  const isLoading = modulesQ.isLoading || assignQ.isLoading;
  const isError = modulesQ.isError || assignQ.isError;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignments.filter((a) => {
      if (q && !a.moduleTitle.toLowerCase().includes(q) && !a.assignedToName.toLowerCase().includes(q)) return false;
      if (tab === "pending") return a.status !== "completed" && !assignmentIsOverdue(a);
      if (tab === "overdue") return assignmentIsOverdue(a);
      if (tab === "completed") return a.status === "completed";
      return true;
    });
  }, [assignments, search, tab]);

  const stats = useMemo(() => ({
    total: assignments.length,
    completed: assignments.filter((a) => a.status === "completed").length,
    overdue: assignments.filter(assignmentIsOverdue).length,
    pending: assignments.filter((a) => a.status !== "completed" && !assignmentIsOverdue(a)).length,
  }), [assignments]);

  async function handleAssign(form: AssignForm) {
    setSaving(true);
    try {
      const mod = modules.find((m) => m.title === form.moduleTitle);
      await createMut.mutateAsync({
        trainingModuleId: mod?.id ?? "unknown",
        moduleTitle: form.moduleTitle,
        assignedToUserId: "manual",
        assignedToName: form.assignedToName.trim(),
        status: "assigned",
        dueDate: form.dueDate ? dateInputToISO(form.dueDate) : undefined,
      });
      toast.success("Training assigned");
      setShowAssign(false);
    } catch {
      toast.error("Failed to assign training");
    } finally {
      setSaving(false);
    }
  }

  async function markComplete(a: TrainingAssignment) {
    try {
      await updateMut.mutateAsync({
        id: a.id,
        patch: { status: "completed", completedAt: new Date().toISOString() },
      });
      toast.success("Marked as complete");
    } catch {
      toast.error("Failed to update");
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Training Center" />
        <ErrorState
          message="We couldn't load training data."
          onRetry={() => { void modulesQ.refetch(); void assignQ.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showAssign && (
        <AssignDialog
          modules={modules.filter((m) => m.active)}
          onClose={() => setShowAssign(false)}
          onSave={handleAssign}
          saving={saving}
        />
      )}

      <PageHeader
        title="Training Center"
        description="Assign and track completion of compliance training modules."
        actions={
          <Button onClick={() => setShowAssign(true)} disabled={modules.length === 0}>
            <Plus className="size-4" /> Assign training
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total assigned" value={stats.total} icon={GraduationCap} loading={isLoading} />
        <StatCard label="Completed" value={stats.completed} icon={GraduationCap} tone="success" loading={isLoading} />
        <StatCard label="Pending" value={stats.pending} icon={GraduationCap} tone="warning" loading={isLoading} />
        <StatCard label="Overdue" value={stats.overdue} icon={GraduationCap} tone="destructive" loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search by module or employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "pending", "overdue", "completed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No assignments found"
              description={search || tab !== "all" ? "Try adjusting your search or filter." : "Assign training to get started."}
              action={<Button onClick={() => setShowAssign(true)}><Plus className="size-4" /> Assign training</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Module</th>
                    <th className="pb-2 pr-4 font-medium">Due date</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const overdue = assignmentIsOverdue(a);
                    const days = daysUntil(a.dueDate);
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-3 pr-4 font-medium">{a.assignedToName}</td>
                        <td className="py-3 pr-4">{a.moduleTitle}</td>
                        <td className="py-3 pr-4">
                          {a.dueDate ? (
                            <div>
                              <div>{formatDate(a.dueDate)}</div>
                              {days !== null && a.status !== "completed" && (
                                <div className="text-xs text-muted-foreground">
                                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`}
                                </div>
                              )}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {a.status === "completed" ? (
                            <Badge variant="success">Completed</Badge>
                          ) : overdue ? (
                            <Badge variant="destructive">Overdue</Badge>
                          ) : (
                            <Badge variant={a.status === "in_progress" ? "warning" : "secondary"}>
                              {a.status === "in_progress" ? "In progress" : "Assigned"}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3">
                          {a.status !== "completed" && (
                            <Button size="sm" variant="outline" onClick={() => markComplete(a)}>
                              Mark complete
                            </Button>
                          )}
                          {a.status === "completed" && a.completedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(a.completedAt)}
                            </span>
                          )}
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

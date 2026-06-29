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
import type { TrainingModule } from "@/lib/data/schema";
import { toast } from "sonner";

interface ModuleForm {
  title: string;
  description: string;
  trainingType: string;
  frequencyMonths: string;
  passingScore: string;
  active: boolean;
}

const EMPTY: ModuleForm = {
  title: "",
  description: "",
  trainingType: "compliance",
  frequencyMonths: "",
  passingScore: "80",
  active: true,
};

function ModuleDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: TrainingModule;
  onClose: () => void;
  onSave: (data: ModuleForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ModuleForm>(
    initial
      ? {
          title: initial.title,
          description: initial.description ?? "",
          trainingType: initial.trainingType,
          frequencyMonths: initial.frequencyMonths != null ? String(initial.frequencyMonths) : "",
          passingScore: String(initial.passingScore),
          active: initial.active,
        }
      : EMPTY,
  );

  const set =
    (k: keyof ModuleForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const scoreNum = parseInt(form.passingScore, 10);
  const scoreValid = !isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit module" : "New training module"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Title *</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="Module title" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <textarea className="input w-full resize-none" rows={2} value={form.description} onChange={set("description")} placeholder="What this training covers" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <input className="input w-full" value={form.trainingType} onChange={set("trainingType")} placeholder="compliance, clinical, safety…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Frequency (months)</label>
            <input type="number" min="1" className="input w-full" value={form.frequencyMonths} onChange={set("frequencyMonths")} placeholder="12 = annual" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Passing score (%)</label>
            <input type="number" min="0" max="100" className="input w-full" value={form.passingScore} onChange={set("passingScore")} />
            {!scoreValid && <p className="text-xs text-destructive">Must be 0–100</p>}
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              id="active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              className="size-4"
            />
            <label htmlFor="active" className="text-sm">Active (assignable)</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.title.trim() || !scoreValid || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TrainingAcademyPage() {
  const { data, isLoading, isError, refetch } = useCollection("trainingModules");
  const assignQ = useCollection("trainingAssignments");
  const createMut = useCreate("trainingModules");
  const updateMut = useUpdate("trainingModules");

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TrainingModule | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const modules = useMemo(() => data ?? [], [data]);
  const assignments = useMemo(() => assignQ.data ?? [], [assignQ.data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return modules.filter((m) => !q || m.title.toLowerCase().includes(q) || m.trainingType.toLowerCase().includes(q));
  }, [modules, search]);

  async function handleSave(form: ModuleForm) {
    setSaving(true);
    try {
      const freq = form.frequencyMonths ? parseInt(form.frequencyMonths, 10) : null;
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        trainingType: form.trainingType.trim() || "compliance",
        frequencyMonths: freq && !isNaN(freq) ? freq : undefined,
        passingScore: parseInt(form.passingScore, 10),
        active: form.active,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Module updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Module created");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save module");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Training Academy" />
        <ErrorState message="We couldn't load training modules." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <ModuleDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Training Academy"
        description="Build and manage training modules. Assign them to staff from the Training Center."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New module
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total modules" value={modules.length} icon={GraduationCap} loading={isLoading} />
        <StatCard label="Active" value={modules.filter((m) => m.active).length} icon={GraduationCap} tone="success" loading={isLoading} />
        <StatCard label="Total assignments" value={assignments.length} icon={GraduationCap} loading={isLoading || assignQ.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input w-full pl-9"
              placeholder="Search modules…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No modules found"
              description={search ? "Try adjusting your search." : "Create your first training module."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New module</Button>}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((m) => {
                const assignCount = assignments.filter((a) => a.trainingModuleId === m.id).length;
                return (
                  <div key={m.id} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 hover:border-border/80">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{m.title}</p>
                        {!m.active && <Badge variant="secondary">Inactive</Badge>}
                        <Badge variant="outline" className="capitalize">{m.trainingType}</Badge>
                      </div>
                      {m.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{m.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Passing score: {m.passingScore}%</span>
                        {m.frequencyMonths && <span>Every {m.frequencyMonths} months</span>}
                        <span>{assignCount} assignment{assignCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Edit</Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

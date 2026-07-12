"use client";

import { useState, useMemo } from "react";
import { GraduationCap, Plus, Search, ListChecks, Trash2, X, Check } from "lucide-react";
import { useCollection, useCreate, useUpdate, useRemove } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import type { TrainingModule, TrainingQuestion } from "@/lib/data/schema";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
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

/* ----------------------------- quiz builder ------------------------------- */

function QuizBuilderDialog({ module, onClose }: { module: TrainingModule; onClose: () => void }) {
  const { data, isLoading } = useCollection("trainingQuestions");
  const createQ = useCreate("trainingQuestions");
  const removeQ = useRemove("trainingQuestions");

  const questions = useMemo(
    () => (data ?? []).filter((q) => q.trainingModuleId === module.id).sort((a, b) => a.orderIndex - b.orderIndex),
    [data, module.id],
  );

  const [qType, setQType] = useState<TrainingQuestion["questionType"]>("multiple_choice");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const effectiveOptions = qType === "true_false" ? ["True", "False"] : options;

  function reset() {
    setPrompt(""); setOptions(["", ""]); setCorrectIndex(0); setQType("multiple_choice");
  }

  async function addQuestion() {
    if (!prompt.trim()) { toast.error("Enter a question prompt."); return; }
    const opts = effectiveOptions.map((o) => o.trim()).filter(Boolean);
    if (qType === "multiple_choice" && opts.length < 2) { toast.error("Add at least two options."); return; }
    if (correctIndex >= opts.length) { toast.error("Mark which option is correct."); return; }
    setBusy(true);
    try {
      await createQ.mutateAsync({
        trainingModuleId: module.id,
        prompt: prompt.trim(),
        questionType: qType,
        options: opts,
        correctIndex,
        orderIndex: questions.length,
      });
      reset();
      toast.success("Question added");
    } catch {
      toast.error("Failed to add question.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuestion(id: string) {
    try {
      await removeQ.mutateAsync(id);
      toast.success("Question removed");
    } catch {
      toast.error("Failed to remove question.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Quiz · {module.title}</h2>
            <p className="text-xs text-muted-foreground">Passing score {module.passingScore}% · {questions.length} question{questions.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          {/* Existing questions */}
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : questions.length === 0 ? (
            <p className="rounded-md bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">No questions yet. Add some below — staff must pass this quiz to complete the module.</p>
          ) : (
            <ol className="space-y-2">
              {questions.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{i + 1}. {q.prompt}</p>
                    <button onClick={() => deleteQuestion(q.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((opt, oi) => (
                      <li key={oi} className={`flex items-center gap-2 text-xs ${oi === q.correctIndex ? "text-success" : "text-muted-foreground"}`}>
                        {oi === q.correctIndex ? <Check className="size-3" /> : <span className="inline-block size-3" />}
                        {opt}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          {/* Add-question form */}
          <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
            <p className="text-sm font-medium">Add a question</p>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Question</label>
              <input className="input w-full" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Question prompt" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Type</label>
              <select className="input w-full" value={qType} onChange={(e) => { setQType(e.target.value as TrainingQuestion["questionType"]); setCorrectIndex(0); }}>
                <option value="multiple_choice">Multiple choice</option>
                <option value="true_false">True / False</option>
              </select>
            </div>
            {qType === "multiple_choice" ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Options (select the correct one)</label>
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} className="size-4" />
                    <input className="input flex-1" value={opt} onChange={(e) => setOptions((p) => p.map((o, oi) => (oi === i ? e.target.value : o)))} placeholder={`Option ${i + 1}`} />
                    {options.length > 2 && (
                      <button onClick={() => { setOptions((p) => p.filter((_, oi) => oi !== i)); if (correctIndex >= i && correctIndex > 0) setCorrectIndex((c) => c - 1); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setOptions((p) => [...p, ""])}>Add option</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Correct answer</label>
                <div className="flex gap-2">
                  {["True", "False"].map((label, i) => (
                    <button key={label} onClick={() => setCorrectIndex(i)} className={`rounded-md px-4 py-1.5 text-sm font-medium ${correctIndex === i ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={addQuestion} disabled={busy || !prompt.trim()}><Plus className="size-4" /> Add question</Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- page ------------------------------------ */

export default function TrainingAcademyPage() {
  const { data, isLoading, isError, refetch } = useCollection("trainingModules");
  const assignQ = useCollection("trainingAssignments");
  const questionsQ = useCollection("trainingQuestions");
  const createMut = useCreate("trainingModules");
  const updateMut = useUpdate("trainingModules");

  const [quizModule, setQuizModule] = useState<TrainingModule | null>(null);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TrainingModule | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const modules = useMemo(() => data ?? [], [data]);
  const assignments = useMemo(() => assignQ.data ?? [], [assignQ.data]);
  const questions = useMemo(() => questionsQ.data ?? [], [questionsQ.data]);

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

      {quizModule && <QuizBuilderDialog module={quizModule} onClose={() => setQuizModule(null)} />}

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
                const quizCount = questions.filter((q) => q.trainingModuleId === m.id).length;
                return (
                  <div key={m.id} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 hover:border-border/80">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{m.title}</p>
                        {!m.active && <Badge variant="secondary">Inactive</Badge>}
                        <Badge variant="outline" className="capitalize">{m.trainingType}</Badge>
                        {quizCount > 0 && <Badge variant="secondary">{quizCount} quiz Q{quizCount !== 1 ? "s" : ""}</Badge>}
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
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setQuizModule(m)}><ListChecks className="size-4" /> Quiz</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>Edit</Button>
                    </div>
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

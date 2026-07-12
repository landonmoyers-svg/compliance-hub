"use client";

import { useState, useMemo } from "react";
import { GraduationCap, Plus, Search, ListChecks, X, Check, Users, Download } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import {
  buildHolderIndex,
  holderIsActive, assignmentIsOverdue } from "@/lib/compliance";
import { formatDate, daysUntil, dateInputToISO } from "@/lib/dates";
import { PersonSelect } from "@/components/shared/person-select";
import type { TrainingAssignment, TrainingModule, TrainingQuestion } from "@/lib/data/schema";
import { toast } from "sonner";

/* ----------------------------- dialog ------------------------------- */

interface AssignForm {
  moduleTitle: string;
  assignedToUserId: string | null;
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
    assignedToUserId: null,
    assignedToName: "",
    dueDate: "",
  });

  const set = (k: keyof AssignForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const valid = form.moduleTitle && form.assignedToName.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
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
          <PersonSelect
            label="Assign to"
            required
            value={{ userId: form.assignedToUserId, name: form.assignedToName }}
            onChange={(v) => setForm((p) => ({ ...p, assignedToUserId: v.userId, assignedToName: v.name }))}
          />
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

/* ------------------------- bulk assign ------------------------------ */

interface BulkAssignForm {
  moduleTitle: string;
  dueDate: string;
}

function BulkAssignDialog({
  modules,
  activeCount,
  onClose,
  onSave,
  saving,
}: {
  modules: { id: string; title: string }[];
  activeCount: number;
  onClose: () => void;
  onSave: (data: BulkAssignForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<BulkAssignForm>({
    moduleTitle: modules[0]?.title ?? "",
    dueDate: "",
  });

  const set = (k: keyof BulkAssignForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const valid = form.moduleTitle && activeCount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Assign to all staff</h2>
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
            <label className="text-sm font-medium">Due date</label>
            <input type="date" className="input w-full" value={form.dueDate} onChange={set("dueDate")} />
          </div>
          <p className="text-sm text-muted-foreground">
            This will assign the selected module to all {activeCount} active staff member{activeCount !== 1 ? "s" : ""}. Anyone with an incomplete assignment for it is skipped.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!valid || saving}>
            {saving ? "Assigning…" : "Assign to all"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- take quiz ------------------------------ */

function TakeQuizDialog({
  assignment,
  module,
  questions,
  onClose,
  onPassed,
}: {
  assignment: TrainingAssignment;
  module: TrainingModule | undefined;
  questions: TrainingQuestion[];
  onClose: () => void;
  onPassed: (assignment: TrainingAssignment, score: number, answers: number[]) => Promise<void>;
}) {
  const passingScore = module?.passingScore ?? 80;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  async function submit() {
    const correct = questions.filter((q) => answers[q.id] === q.correctIndex).length;
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passed = score >= passingScore;
    setResult({ score, passed });
    if (passed) {
      setBusy(true);
      try {
        await onPassed(assignment, score, questions.map((q) => answers[q.id] ?? -1));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{assignment.moduleTitle}</h2>
            <p className="text-xs text-muted-foreground">{questions.length} question{questions.length !== 1 ? "s" : ""} · pass at {passingScore}%</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-5 p-5">
          {result ? (
            <div className={`rounded-lg border p-5 text-center ${result.passed ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
              <p className="text-3xl font-bold tabular-nums">{result.score}%</p>
              <p className={`mt-1 font-medium ${result.passed ? "text-success" : "text-destructive"}`}>
                {result.passed ? "Passed — assignment marked complete" : `Not passed — ${passingScore}% required. You can retake.`}
              </p>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{i + 1}. {q.prompt}</p>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${answers[q.id] === oi ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/30"}`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setAnswers((p) => ({ ...p, [q.id]: oi }))} className="size-4" />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {result ? (
            result.passed ? (
              <Button onClick={onClose} disabled={busy}><Check className="size-4" /> Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button onClick={() => setResult(null)}>Retake</Button>
              </>
            )
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={!allAnswered || busy}>Submit answers</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function TrainingPage() {
  const { profile, user } = useAuth();
  const modulesQ = useCollection("trainingModules");
  const assignQ = useCollection("trainingAssignments");
  const employeesCtxQ = useCollection("employees");
  const questionsQ = useCollection("trainingQuestions");
  const profilesQ = useCollection("profiles");
  const createMut = useCreate("trainingAssignments");
  const updateMut = useUpdate("trainingAssignments");
  const createAttempt = useCreate("trainingAttempts");

  const [takingQuiz, setTakingQuiz] = useState<TrainingAssignment | null>(null);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "overdue" | "completed">("all");
  const [showAssign, setShowAssign] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const modules = useMemo(() => modulesQ.data ?? [], [modulesQ.data]);
  const assignments = useMemo(() => assignQ.data ?? [], [assignQ.data]);
  const questions = useMemo(() => questionsQ.data ?? [], [questionsQ.data]);
  const profiles = useMemo(() => profilesQ.data ?? [], [profilesQ.data]);
  const activeProfiles = useMemo(() => profiles.filter((p) => p.active), [profiles]);

  const isLoading = modulesQ.isLoading || assignQ.isLoading;
  const isError = modulesQ.isError || assignQ.isError;

  /** Questions for a given assignment's module. */
  const questionsFor = (a: TrainingAssignment) => questions.filter((q) => q.trainingModuleId === a.trainingModuleId);

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

  // Context: overdue only counts people who still work here.
  const holderIdx = useMemo(() => buildHolderIndex(employeesCtxQ.data ?? []), [employeesCtxQ.data]);
  const stats = useMemo(() => ({
    total: assignments.length,
    completed: assignments.filter((a) => a.status === "completed").length,
    overdue: assignments.filter((a) => assignmentIsOverdue(a) && holderIsActive({ employeeUserId: a.assignedToUserId, employeeName: a.assignedToName }, holderIdx)).length,
    pending: assignments.filter((a) => a.status !== "completed" && !assignmentIsOverdue(a)).length,
  }), [assignments, holderIdx]);

  async function handleAssign(form: AssignForm) {
    setSaving(true);
    try {
      const mod = modules.find((m) => m.title === form.moduleTitle);
      await createMut.mutateAsync({
        trainingModuleId: mod?.id ?? "unknown",
        moduleTitle: form.moduleTitle,
        assignedToUserId: form.assignedToUserId ?? "",
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

  async function handleBulkAssign(form: BulkAssignForm) {
    setBulkSaving(true);
    try {
      const mod = modules.find((m) => m.title === form.moduleTitle);
      const moduleId = mod?.id ?? "unknown";
      const due = form.dueDate ? dateInputToISO(form.dueDate) : undefined;

      // Skip anyone who already has an incomplete assignment for this module.
      const alreadyAssigned = new Set(
        assignments
          .filter((a) => a.trainingModuleId === moduleId && a.status !== "completed")
          .map((a) => a.assignedToUserId),
      );

      const targets = activeProfiles.filter((p) => !alreadyAssigned.has(p.userId));
      const skipped = activeProfiles.length - targets.length;

      await Promise.all(
        targets.map((p) =>
          createMut.mutateAsync({
            trainingModuleId: moduleId,
            moduleTitle: form.moduleTitle,
            assignedToUserId: p.userId,
            assignedToName: p.fullName,
            status: "assigned",
            dueDate: due,
          }),
        ),
      );

      toast.success(`Assigned to ${targets.length} staff (${skipped} already had it)`);
      setShowBulkAssign(false);
    } catch {
      toast.error("Failed to assign training to all staff");
    } finally {
      setBulkSaving(false);
    }
  }

  function exportRosterCSV() {
    const header = ["Employee", "Module", "Status", "Score", "Due date", "Completed date"];
    const rows = assignments.map((a) => [
      a.assignedToName,
      a.moduleTitle,
      a.status,
      a.score != null ? String(a.score) : "",
      a.dueDate ? formatDate(a.dueDate) : "",
      a.completedAt ? formatDate(a.completedAt) : "",
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "training-roster.csv"; a.click();
    URL.revokeObjectURL(url);
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

  /** Called when a quiz is passed: record the attempt and complete the assignment. */
  async function handleQuizPassed(a: TrainingAssignment, score: number, answers: number[]) {
    try {
      await createAttempt.mutateAsync({
        assignmentId: a.id,
        trainingModuleId: a.trainingModuleId,
        moduleTitle: a.moduleTitle,
        userId: profile?.userId ?? user?.id ?? a.assignedToUserId,
        userName: profile?.fullName ?? user?.fullName ?? a.assignedToName,
        score,
        passed: true,
        answers,
        completedAt: new Date().toISOString(),
      });
      await updateMut.mutateAsync({
        id: a.id,
        patch: { status: "completed", completedAt: new Date().toISOString(), score },
      });
      toast.success(`Passed with ${score}% — training complete`);
    } catch {
      toast.error("Saved your score, but updating the assignment failed.");
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Training" />
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

      {showBulkAssign && (
        <BulkAssignDialog
          modules={modules.filter((m) => m.active)}
          activeCount={activeProfiles.length}
          onClose={() => setShowBulkAssign(false)}
          onSave={handleBulkAssign}
          saving={bulkSaving}
        />
      )}

      {takingQuiz && (
        <TakeQuizDialog
          assignment={takingQuiz}
          module={modules.find((m) => m.id === takingQuiz.trainingModuleId)}
          questions={questionsFor(takingQuiz)}
          onClose={() => setTakingQuiz(null)}
          onPassed={handleQuizPassed}
        />
      )}

      <PageHeader
        title="Training"
        description="Assign and track completion of compliance training modules."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportRosterCSV} disabled={assignments.length === 0}>
              <Download className="size-4" /> Export roster (CSV)
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowBulkAssign(true)}
              disabled={modules.length === 0 || activeProfiles.length === 0}
            >
              <Users className="size-4" /> Assign to all staff
            </Button>
            <Button onClick={() => setShowAssign(true)} disabled={modules.length === 0}>
              <Plus className="size-4" /> Assign training
            </Button>
          </div>
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
              <table className="w-full text-sm rtable">
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
                        <td data-label="Employee" className="py-3 pr-4 font-medium">{a.assignedToName}</td>
                        <td data-label="Module" className="py-3 pr-4">{a.moduleTitle}</td>
                        <td data-label="Due date" className="py-3 pr-4">
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
                        <td data-label="Status" className="py-3 pr-4">
                          {a.status === "completed" ? (
                            <Badge variant="success">Completed</Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (questionsFor(a).length > 0) {
                                  setTakingQuiz(a);
                                  return;
                                }
                                if (!window.confirm(`Mark "${a.moduleTitle}" complete for ${a.assignedToName}? This records a training completion.`)) return;
                                markComplete(a);
                              }}
                              title="Open to manage"
                              className="cursor-pointer"
                            >
                              {overdue ? (
                                <Badge variant="destructive">Overdue</Badge>
                              ) : (
                                <Badge variant={a.status === "in_progress" ? "warning" : "secondary"}>
                                  {a.status === "in_progress" ? "In progress" : "Assigned"}
                                </Badge>
                              )}
                            </button>
                          )}
                        </td>
                        <td data-label="" className="py-3">
                          {a.status !== "completed" && (
                            <div className="flex gap-1.5 md:justify-end">
                              {questionsFor(a).length > 0 ? (
                                <Button size="sm" onClick={() => setTakingQuiz(a)}>
                                  <ListChecks className="size-4" /> Take quiz
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    if (!window.confirm(`Mark "${a.moduleTitle}" complete for ${a.assignedToName}? This records a training completion.`)) return;
                                    markComplete(a);
                                  }}
                                >
                                  Mark complete
                                </Button>
                              )}
                            </div>
                          )}
                          {a.status === "completed" && (
                            <span className="text-xs text-muted-foreground">
                              {a.score != null ? `${a.score}% · ` : ""}{a.completedAt ? formatDate(a.completedAt) : "Done"}
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

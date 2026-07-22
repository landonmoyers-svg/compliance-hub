"use client";

import { useMemo, useState } from "react";
import { UserPlus, UserMinus, ChevronRight, CheckCircle2, Circle, MinusCircle, ListChecks } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { formatDate, todayInput } from "@/lib/dates";
import { ensureChecklist, LIFECYCLE_CATEGORY_LABEL } from "@/lib/lifecycle";
import type { LifecycleKind, LifecycleTask } from "@/lib/data/schema";

interface Group {
  key: string;
  employeeId: string;
  employeeName: string;
  kind: LifecycleKind;
  tasks: LifecycleTask[];
  done: number;
  resolved: number;
  total: number;
}

export default function EmployeeLifecyclePage() {
  const tasksQ = useCollection("lifecycleTasks");
  const employeesQ = useCollection("employees");
  const createTask = useCreate("lifecycleTasks");
  const updateTask = useUpdate("lifecycleTasks");
  const { profile } = useAuth();

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [newEmp, setNewEmp] = useState("");
  const [newKind, setNewKind] = useState<LifecycleKind>("onboarding");

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, LifecycleTask[]>();
    for (const t of tasks) {
      const k = `${t.employeeId}::${t.kind}`;
      const arr = map.get(k);
      if (arr) arr.push(t); else map.set(k, [t]);
    }
    return [...map.entries()]
      .map(([key, ts]) => {
        const done = ts.filter((t) => t.status === "done").length;
        const resolved = ts.filter((t) => t.status !== "pending").length;
        return {
          key, employeeId: ts[0].employeeId, employeeName: ts[0].employeeName,
          kind: ts[0].kind, tasks: ts, done, resolved, total: ts.length,
        };
      })
      .sort((a, b) => (a.resolved / a.total) - (b.resolved / b.total) || a.employeeName.localeCompare(b.employeeName));
  }, [tasks]);

  const onboarding = groups.filter((g) => g.kind === "onboarding");
  const offboarding = groups.filter((g) => g.kind === "offboarding");

  async function startChecklist() {
    const emp = employees.find((e) => e.id === newEmp);
    if (!emp) { toast.error("Pick an employee first."); return; }
    setStarting(true);
    try {
      const n = await ensureChecklist(newKind, emp, tasks, (data) => createTask.mutateAsync(data));
      if (n === 0) toast.info(`${emp.firstName} already has a${newKind === "onboarding" ? "n" : ""} ${newKind} checklist.`);
      else toast.success(`Started ${newKind} checklist (${n} items) for ${emp.firstName}.`);
      setNewEmp("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the checklist.");
    } finally {
      setStarting(false);
    }
  }

  async function setStatus(t: LifecycleTask, status: LifecycleTask["status"]) {
    try {
      await updateTask.mutateAsync({
        id: t.id,
        patch: {
          status,
          completedDate: status === "done" ? todayInput() : null,
          completedBy: status === "done" ? (profile?.fullName ?? null) : null,
        },
      });
    } catch {
      toast.error("Couldn't update the item.");
    }
  }

  if (tasksQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Onboarding & Offboarding" />
        <ErrorState message="We couldn't load lifecycle checklists." onRetry={() => void tasksQ.refetch()} />
      </div>
    );
  }

  const loading = tasksQ.isLoading || employeesQ.isLoading;
  // Employees are the natural candidates: current staff for onboarding, everyone
  // for offboarding. Keep it simple — the picker offers all employees.
  const empOptions = [...employees].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding & Offboarding"
        description="Standardized new-hire and departure checklists — access, HR documents, credentials to collect, equipment, and compliance steps — so no step is silently missed. Offboarding auto-starts when someone is marked as departed; you can also start either checklist here."
      />

      {/* Start a checklist */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Employee</label>
            <select className="input w-full" value={newEmp} onChange={(e) => setNewEmp(e.target.value)} disabled={loading}>
              <option value="">Select an employee…</option>
              {empOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}{e.title ? ` · ${e.title}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Checklist</label>
            <div className="flex gap-1">
              <Button type="button" variant={newKind === "onboarding" ? "default" : "outline"} size="sm" onClick={() => setNewKind("onboarding")}><UserPlus className="size-4" /> Onboarding</Button>
              <Button type="button" variant={newKind === "offboarding" ? "default" : "outline"} size="sm" onClick={() => setNewKind("offboarding")}><UserMinus className="size-4" /> Offboarding</Button>
            </div>
          </div>
          <Button onClick={() => void startChecklist()} disabled={starting || !newEmp}>Start checklist</Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No active checklists. Start one above, or mark an employee as departed to auto-generate their offboarding checklist.
        </p>
      ) : (
        <div className="space-y-6">
          <Section title="Onboarding" icon={UserPlus} groups={onboarding} open={open} setOpen={setOpen} onSet={setStatus} />
          <Section title="Offboarding" icon={UserMinus} groups={offboarding} open={open} setOpen={setOpen} onSet={setStatus} />
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, groups, open, setOpen, onSet }: {
  title: string; icon: typeof ListChecks; groups: Group[];
  open: Set<string>; setOpen: (s: Set<string>) => void;
  onSet: (t: LifecycleTask, s: LifecycleTask["status"]) => void;
}) {
  if (groups.length === 0) return null;
  const toggle = (k: string) => { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); setOpen(n); };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" /> {title} <Badge variant="secondary">{groups.length}</Badge>
      </div>
      {groups.map((g) => {
        const pct = Math.round((g.resolved / g.total) * 100);
        const isOpen = open.has(g.key);
        const complete = g.resolved === g.total;
        return (
          <Card key={g.key}>
            <button type="button" onClick={() => toggle(g.key)} className="flex w-full items-center gap-3 p-4 text-left">
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{g.employeeName}</span>
                  {complete && <Badge variant="success">Complete</Badge>}
                </div>
                <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
                  <div className={cn("h-full rounded-full transition-all", complete ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{g.done}/{g.total} done</span>
            </button>
            {isOpen && <ChecklistItems tasks={g.tasks} onSet={onSet} />}
          </Card>
        );
      })}
    </div>
  );
}

function ChecklistItems({ tasks, onSet }: { tasks: LifecycleTask[]; onSet: (t: LifecycleTask, s: LifecycleTask["status"]) => void }) {
  // Group by category for a scannable checklist.
  const byCat = useMemo(() => {
    const m = new Map<LifecycleTask["category"], LifecycleTask[]>();
    for (const t of tasks) { const a = m.get(t.category); if (a) a.push(t); else m.set(t.category, [t]); }
    return [...m.entries()];
  }, [tasks]);

  return (
    <div className="space-y-4 border-t border-border px-4 py-3">
      {byCat.map(([cat, items]) => (
        <div key={cat}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{LIFECYCLE_CATEGORY_LABEL[cat]}</div>
          <div className="divide-y divide-border/50">
            {items.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-1.5">
                <button type="button" title="Mark done" onClick={() => onSet(t, t.status === "done" ? "pending" : "done")}
                  className={cn("shrink-0", t.status === "done" ? "text-success" : "text-muted-foreground hover:text-foreground")}>
                  {t.status === "done" ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <span className={cn("text-sm", t.status === "done" && "text-muted-foreground line-through", t.status === "na" && "text-muted-foreground")}>{t.label}</span>
                  {t.status === "done" && t.completedBy && (
                    <span className="ml-2 text-xs text-muted-foreground">✓ {t.completedBy}{t.completedDate ? ` · ${formatDate(t.completedDate)}` : ""}</span>
                  )}
                </div>
                <button type="button" onClick={() => onSet(t, t.status === "na" ? "pending" : "na")}
                  className={cn("shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", t.status === "na" ? "text-muted-foreground" : "text-muted-foreground/70 hover:text-foreground")}>
                  <MinusCircle className="size-3.5" /> {t.status === "na" ? "N/A" : "N/A"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

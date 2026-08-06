"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Compass, GraduationCap, Route, CalendarRange, ArrowUpRight, Plus, Play,
  ChevronDown, Clock, CheckCircle2, Sparkles, MessageSquare,
} from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { buildAgenda, type WorkItem } from "@/lib/agenda";
import { daysUntil } from "@/lib/dates";
import { FEATURES, FEATURE_CATEGORIES, type FeatureGuide } from "@/lib/guide/features";
import { PLAYBOOKS, type Playbook } from "@/lib/guide/playbooks";
import { useGuide, askSage } from "@/lib/guide/context";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner", admin: "Administrator", hr: "HR Director",
  clinical_leadership: "Compliance Director", manager: "Manager",
  staff: "Team member", contractor: "Contractor", read_only: "Viewer",
};

type Tab = "today" | "walk" | "learn" | "plan";
const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: "today", label: "Today", icon: Compass },
  { id: "walk", label: "Walk me through", icon: Route },
  { id: "learn", label: "Learn", icon: GraduationCap },
  { id: "plan", label: "Plan my week", icon: CalendarRange },
];

export default function GuidePage() {
  const { profile, user, isAdmin } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";
  const g = useGuide();
  const [tab, setTab] = useState<Tab>("today");

  // --- Agenda data (same signals as Daily Priorities) --------------------
  const credentials = useCollection("credentials");
  const training = useCollection("trainingAssignments");
  const documents = useCollection("documents");
  const capas = useCollection("correctiveActions");
  const sra = useCollection("sraFindings");
  const incidents = useCollection("incidents");
  const breaches = useCollection("breachAssessments");
  const insurance = useCollection("insurancePolicies");
  const vendors = useCollection("vendors");
  const tasks = useCollection("tasks");
  const screenings = useCollection("exclusionScreenings");
  const employees = useCollection("employees");
  const backupsQ = useCollection("backups");
  const createTask = useCreate("tasks");

  const loading = [credentials, training, documents, capas, sra, incidents, breaches, insurance, vendors, tasks].some((q) => q.isLoading);

  const screeningDueCount = useMemo(() => {
    const scr = screenings.data ?? [];
    const subjects = [
      ...(employees.data ?? []).filter((e) => e.employmentStatus === "active").map((e) => ({ name: `${e.firstName} ${e.lastName}`.trim(), userId: e.userId })),
      ...(vendors.data ?? []).filter((v) => v.status !== "terminated").map((v) => ({ name: v.vendorName })),
    ];
    return subjects.filter((s) => {
      const matches = scr.filter((x) => ("userId" in s && s.userId && x.subjectUserId === s.userId) || x.subjectName.toLowerCase() === s.name.toLowerCase());
      if (matches.length === 0) return true;
      const latest = matches.sort((a, b) => (b.screenedDate ?? b.createdDate).localeCompare(a.screenedDate ?? a.createdDate))[0];
      const d = latest.screenedDate ? daysUntil(latest.screenedDate) : null;
      return d === null || -d > 30;
    }).length;
  }, [screenings.data, employees.data, vendors.data]);

  const items = useMemo(() => buildAgenda({
    horizonDays: 30, showLow: false, snoozed: new Set(),
    credentials: credentials.data ?? [], training: training.data ?? [], documents: documents.data ?? [],
    correctiveActions: capas.data ?? [], sraFindings: sra.data ?? [], incidents: incidents.data ?? [],
    breaches: breaches.data ?? [], insurance: insurance.data ?? [], vendors: vendors.data ?? [],
    tasks: tasks.data ?? [], screeningDueCount,
    lastBackupAt: (backupsQ.data ?? []).slice().sort((a, b) => b.createdDate.localeCompare(a.createdDate))[0]?.createdDate ?? null,
    employees: employees.data ?? [],
  }), [credentials.data, training.data, documents.data, capas.data, sra.data, incidents.data, breaches.data, insurance.data, vendors.data, tasks.data, screeningDueCount, backupsQ.data, employees.data]);

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();
  const firstName = (profile?.fullName ?? "").split(" ")[0];
  const roleLabel = ROLE_LABEL[profile?.accountRole ?? ""] ?? "there";

  async function addTask(item: WorkItem, dueDate?: string | null) {
    try {
      await createTask.mutateAsync({ title: item.title, description: item.why, status: "open", priority: item.risk >= 3 ? "high" : item.risk >= 2 ? "medium" : "low", dueDate: dueDate ?? item.dueDate ?? undefined });
      toast.success("Added to your tasks");
    } catch { toast.error("Couldn't add the task."); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your Guide"
        description={`${greeting}${firstName ? `, ${firstName}` : ""} — I'm Sage. As ${roleLabel === "there" ? "your compliance guide" : `the ${roleLabel}`}, here's where to focus, and I'll walk you through anything.`}
        actions={<Button variant="outline" onClick={() => askSage("What should I focus on today, and why?")}><MessageSquare className="size-4" /> Ask Sage</Button>}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && <TodayTab items={items} loading={loading} isAdmin={isAdmin} onAddTask={addTask} onStart={(s) => g.start(s)} />}
      {tab === "walk" && <WalkTab onStart={(s) => g.start(s)} doneCount={(s) => g.doneCount(s)} />}
      {tab === "learn" && <LearnTab onStart={(s) => g.start(s)} />}
      {tab === "plan" && <PlanTab items={items} loading={loading} onAddTask={addTask} />}
    </div>
  );
}

/* ------------------------------- Today -------------------------------- */
function TodayTab({ items, loading, isAdmin, onAddTask, onStart }: {
  items: WorkItem[]; loading: boolean; isAdmin: boolean;
  onAddTask: (i: WorkItem) => void; onStart: (slug: string) => void;
}) {
  const top = items.slice(0, 6);
  const overdue = items.filter((i) => i.bucket === "overdue").length;
  const suggested = PLAYBOOKS.slice(0, 3);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <h2 className="text-sm font-semibold">What matters most right now {overdue > 0 && <span className="text-destructive">· {overdue} overdue</span>}</h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : top.length === 0 ? (
          <Card><CardContent className="py-10 text-center">
            <CheckCircle2 className="mx-auto mb-2 size-8 text-success" />
            <p className="font-medium">You&apos;re all caught up.</p>
            <p className="text-sm text-muted-foreground">Nothing pressing. Try a walkthrough to get ahead.</p>
          </CardContent></Card>
        ) : top.map((item) => (
          <Card key={item.key}>
            <CardContent className="flex items-center gap-3 py-3">
              <span className={cn("size-2.5 shrink-0 rounded-full", item.risk >= 3 ? "bg-destructive" : item.risk >= 2 ? "bg-warning" : "bg-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.why}{item.daysUntil !== null && <span className={item.daysUntil < 0 ? "text-destructive" : ""}> · {item.daysUntil < 0 ? `overdue ${-item.daysUntil}d` : item.daysUntil === 0 ? "due today" : `in ${item.daysUntil}d`}</span>}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onAddTask(item)} title="Add to my tasks"><Plus className="size-4" /></Button>
              <Button asChild size="sm" variant="ghost" title="Open"><Link href={item.href}><ArrowUpRight className="size-4" /></Link></Button>
            </CardContent>
          </Card>
        ))}
        {isAdmin && top.length > 0 && (
          <Button asChild variant="outline" size="sm"><Link href="/chief-of-staff">See the full prioritized plan <ArrowUpRight className="size-4" /></Link></Button>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Want a hand? Walk through a task</h2>
        {suggested.map((pb) => (
          <Card key={pb.slug} className="transition-colors hover:border-primary/40">
            <CardContent className="p-4">
              <p className="text-sm font-semibold">{pb.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{pb.goal}</p>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" onClick={() => onStart(pb.slug)}><Play className="size-3.5" /> Start</Button>
                <span className="text-xs text-muted-foreground">{pb.estimate}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Walk me through --------------------------- */
function WalkTab({ onStart, doneCount }: { onStart: (slug: string) => void; doneCount: (slug: string) => number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>Pick a task and I&apos;ll walk you through it step by step — explaining what to do and why it matters. Choose how I guide you (panel, on-screen tour, or chat) once it starts.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLAYBOOKS.map((pb: Playbook) => {
          const done = doneCount(pb.slug);
          const pct = Math.round((done / pb.steps.length) * 100);
          return (
            <Card key={pb.slug} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{pb.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{pb.goal}</p>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3.5" /> {pb.estimate} · {pb.steps.length} steps
                  {done > 0 && <span className="text-success">· {pct}% done</span>}
                </div>
                {done > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <Button className="w-full" onClick={() => onStart(pb.slug)}>
                  <Play className="size-4" /> {done > 0 && done < pb.steps.length ? "Resume walkthrough" : "Start walkthrough"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- Learn -------------------------------- */
function LearnTab({ onStart }: { onStart: (slug: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      {FEATURE_CATEGORIES.map((cat) => {
        const feats = FEATURES.filter((f) => f.category === cat);
        if (feats.length === 0) return null;
        return (
          <div key={cat}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{cat}</h2>
            <div className="grid gap-2">
              {feats.map((f) => <FeatureCard key={f.slug} f={f} open={open === f.slug} onToggle={() => setOpen(open === f.slug ? null : f.slug)} onStart={onStart} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeatureCard({ f, open, onToggle, onStart }: { f: FeatureGuide; open: boolean; onToggle: () => void; onStart: (slug: string) => void }) {
  return (
    <Card>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{f.title}</p>
          <p className="truncate text-xs text-muted-foreground">{f.what}</p>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-4 pt-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</p>
            <p className="mt-0.5 leading-relaxed">{f.why}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">How to use it</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 leading-relaxed">{f.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          </div>
          <div className="rounded-lg bg-success/5 px-3 py-2 text-xs text-success"><span className="font-semibold">Done when:</span> {f.doneWhen}</div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link href={f.route}>Open {f.title} <ArrowUpRight className="size-4" /></Link></Button>
            {f.playbooks?.map((slug) => <Button key={slug} size="sm" variant="ghost" onClick={() => onStart(slug)}><Route className="size-4" /> Walk me through</Button>)}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------- Plan my week --------------------------- */
function PlanTab({ items, loading, onAddTask }: { items: WorkItem[]; loading: boolean; onAddTask: (i: WorkItem, due?: string | null) => void }) {
  const [capacity, setCapacity] = useState(3);
  // Distribute ranked items across the next 7 days, respecting each item's due
  // date (never schedule after it) and a daily capacity. Overdue/today pin to day 0.
  const plan = useMemo(() => {
    const days: { date: Date; items: WorkItem[] }[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
      return { date: d, items: [] as WorkItem[] };
    });
    // Skip items that are already tasks (they're on your list already).
    const schedulable = items.filter((i) => i.category !== "task");
    for (const item of schedulable) {
      const latest = item.daysUntil === null ? 6 : Math.max(0, Math.min(6, item.daysUntil));
      let placed = false;
      for (let d = 0; d <= latest; d++) {
        if (days[d].items.length < capacity) { days[d].items.push(item); placed = true; break; }
      }
      if (!placed) days[Math.min(latest, 6)].items.push(item); // overflow onto the deadline day
    }
    return days;
  }, [items, capacity]);

  const dayLabel = (d: Date, i: number) => {
    if (i === 0) return "Today";
    if (i === 1) return "Tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "long" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">I&apos;ve laid your most important work across the week, hardest-first and never past its deadline. Commit the days you want as tasks.</p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Items/day</span>
          <input type="number" min={1} max={10} value={capacity} onChange={(e) => setCapacity(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} className="input w-16" />
        </label>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <div className="grid gap-3">
          {plan.map((day, i) => (
            <Card key={i} className={cn(day.items.length === 0 && "opacity-60")}>
              <CardHeader className="flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm">{dayLabel(day.date, i)} <span className="font-normal text-muted-foreground">· {day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></CardTitle>
                {day.items.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => day.items.forEach((it) => onAddTask(it, day.date.toISOString().slice(0, 10)))}>
                    <Plus className="size-3.5" /> Add {day.items.length} to tasks
                  </Button>
                )}
              </CardHeader>
              {day.items.length > 0 && (
                <CardContent className="space-y-1.5 pt-0">
                  {day.items.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                      <span className={cn("size-2 shrink-0 rounded-full", item.risk >= 3 ? "bg-destructive" : item.risk >= 2 ? "bg-warning" : "bg-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.title}</p>
                        {item.daysUntil !== null && <p className={cn("text-xs", item.daysUntil < 0 ? "text-destructive" : "text-muted-foreground")}>{item.daysUntil < 0 ? `deadline passed ${-item.daysUntil}d ago` : item.daysUntil === 0 ? "due today" : `due in ${item.daysUntil}d`}</p>}
                      </div>
                      <Button asChild size="sm" variant="ghost"><Link href={item.href}><ArrowUpRight className="size-4" /></Link></Button>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

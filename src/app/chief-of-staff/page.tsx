"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Clock, ArrowUpRight, Plus, BellOff, Settings2, CheckCircle2, Calendar } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildAgenda, groupByBucket, type WorkItem, type Bucket } from "@/lib/agenda";
import { daysUntil } from "@/lib/dates";
import { toast } from "sonner";

const RISK_DOT = ["bg-muted-foreground", "bg-muted-foreground", "bg-warning", "bg-destructive"];
const BUCKET_META: { key: Bucket; label: string; tone: string }[] = [
  { key: "overdue", label: "Overdue", tone: "text-destructive" },
  { key: "today", label: "Today", tone: "text-foreground" },
  { key: "week", label: "This week", tone: "text-foreground" },
  { key: "horizon", label: "On the horizon", tone: "text-muted-foreground" },
];

function dueLabel(item: WorkItem): string {
  if (item.daysUntil === null) return "";
  if (item.daysUntil < 0) return `overdue ${-item.daysUntil}d`;
  if (item.daysUntil === 0) return "due today";
  return `in ${item.daysUntil}d`;
}

export default function ChiefOfStaffPage() {
  const { profile, user } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";

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
  const prefsQ = useCollection("ccoPreferences");
  const snoozesQ = useCollection("agendaSnoozes");

  const createTask = useCreate("tasks");
  const createSnooze = useCreate("agendaSnoozes");
  const updateSnooze = useUpdate("agendaSnoozes");
  const createPref = useCreate("ccoPreferences");
  const updatePref = useUpdate("ccoPreferences");

  const pref = useMemo(() => (prefsQ.data ?? []).find((p) => p.userId === myUserId), [prefsQ.data, myUserId]);
  const [showPrefs, setShowPrefs] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);

  const loading = [credentials, training, documents, capas, sra, incidents, breaches, insurance, vendors, tasks, screenings, employees].some((q) => q.isLoading);

  // Subjects due for exclusion screening (aggregate).
  const screeningDueCount = useMemo(() => {
    const scr = screenings.data ?? [];
    const subjects = [
      ...(employees.data ?? []).filter((e) => e.employmentStatus === "active").map((e) => ({ name: `${e.firstName} ${e.lastName}`.trim(), userId: e.userId })),
      ...(vendors.data ?? []).filter((v) => v.status !== "terminated").map((v) => ({ name: v.vendorName, vendorId: v.id })),
    ];
    return subjects.filter((s) => {
      const matches = scr.filter((x) => (("userId" in s && s.userId && x.subjectUserId === s.userId)) || (("vendorId" in s && x.vendorId === (s as { vendorId?: string }).vendorId)) || x.subjectName.toLowerCase() === s.name.toLowerCase());
      if (matches.length === 0) return true;
      const latest = matches.sort((a, b) => (b.screenedDate ?? b.createdDate).localeCompare(a.screenedDate ?? a.createdDate))[0];
      const d = latest.screenedDate ? daysUntil(latest.screenedDate) : null;
      return d === null || -d > 30;
    }).length;
  }, [screenings.data, employees.data, vendors.data]);

  const snoozedKeys = useMemo(() => {
    const now = Date.now();
    return new Set((snoozesQ.data ?? []).filter((s) => s.userId === myUserId && (!s.snoozedUntil || new Date(s.snoozedUntil).getTime() > now)).map((s) => s.itemKey));
  }, [snoozesQ.data, myUserId]);

  const items = useMemo(() => buildAgenda({
    horizonDays: pref?.horizonDays ?? 30,
    showLow: pref?.showLow ?? false,
    snoozed: snoozedKeys,
    credentials: credentials.data ?? [],
    training: training.data ?? [],
    documents: documents.data ?? [],
    correctiveActions: capas.data ?? [],
    sraFindings: sra.data ?? [],
    incidents: incidents.data ?? [],
    breaches: breaches.data ?? [],
    insurance: insurance.data ?? [],
    vendors: vendors.data ?? [],
    tasks: tasks.data ?? [],
    screeningDueCount,
    lastBackupAt: (backupsQ.data ?? []).slice().sort((a, b) => b.createdDate.localeCompare(a.createdDate))[0]?.createdDate ?? null,
  }), [pref, snoozedKeys, credentials.data, training.data, documents.data, capas.data, sra.data, incidents.data, breaches.data, insurance.data, vendors.data, tasks.data, screeningDueCount, backupsQ.data]);

  const grouped = useMemo(() => groupByBucket(items), [items]);
  const overdue = grouped.overdue.length;
  const thisWeek = grouped.today.length + grouped.week.length;

  async function generateBrief() {
    setBriefing(true);
    try {
      const res = await fetch("/api/ai/chief-of-staff", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.slice(0, 40).map((i) => ({ title: i.title, why: i.why, bucket: i.bucket, category: i.category, risk: i.risk, dueLabel: dueLabel(i) })),
          focusAreas: pref?.focusAreas, agentNotes: pref?.agentNotes,
          name: profile?.fullName, today: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      setBrief(data.text ?? data.error ?? "Couldn't generate a briefing.");
    } catch { setBrief("Network error generating the briefing."); }
    finally { setBriefing(false); }
  }

  async function addTask(item: WorkItem) {
    try {
      await createTask.mutateAsync({ title: item.title, description: item.why, status: "open", priority: item.risk >= 3 ? "high" : item.risk >= 2 ? "medium" : "low", dueDate: item.dueDate ?? undefined });
      toast.success("Added to your tasks");
    } catch { toast.error("Couldn't add the task."); }
  }

  async function snooze(item: WorkItem) {
    const until = new Date(Date.now() + 7 * 864e5).toISOString();
    const existing = (snoozesQ.data ?? []).find((s) => s.userId === myUserId && s.itemKey === item.key);
    try {
      if (existing) await updateSnooze.mutateAsync({ id: existing.id, patch: { snoozedUntil: until } });
      else await createSnooze.mutateAsync({ userId: myUserId, itemKey: item.key, snoozedUntil: until });
      toast.success("Snoozed for 7 days");
    } catch { toast.error("Couldn't snooze."); }
  }

  async function savePrefs(patch: { horizonDays?: number; showLow?: boolean; focusAreas?: string; agentNotes?: string }) {
    try {
      if (pref) await updatePref.mutateAsync({ id: pref.id, patch });
      else await createPref.mutateAsync({ userId: myUserId, horizonDays: 30, showLow: false, ...patch });
      toast.success("Preferences saved");
    } catch { toast.error("Couldn't save preferences."); }
  }

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();
  const firstName = (profile?.fullName ?? "").split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chief of Staff"
        description={`${greeting}${firstName ? `, ${firstName}` : ""}. Here's your prioritized plan — I keep it a step ahead so nothing slips.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPrefs((s) => !s)}><Settings2 className="size-4" /> Preferences</Button>
            <Button onClick={generateBrief} disabled={briefing}><Sparkles className="size-4" /> {briefing ? "Thinking…" : "Brief me"}</Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Overdue" value={overdue} icon={Clock} tone={overdue ? "destructive" : "success"} loading={loading} />
        <StatCard label="Due this week" value={thisWeek} icon={Calendar} tone={thisWeek ? "warning" : "default"} loading={loading} />
        <StatCard label="Items on your radar" value={items.length} icon={CheckCircle2} loading={loading} />
      </div>

      {showPrefs && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Preferences — the more you tell me, the better I prioritize</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Horizon (days ahead to surface)</label>
              <input type="number" className="input w-full" defaultValue={pref?.horizonDays ?? 30} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v && v !== pref?.horizonDays) void savePrefs({ horizonDays: v }); }} />
            </div>
            <label className="flex items-end gap-2 text-sm">
              <input type="checkbox" defaultChecked={pref?.showLow ?? false} onChange={(e) => void savePrefs({ showLow: e.target.checked })} className="size-4" />
              Include low-priority items
            </label>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Focus areas</label>
              <input className="input w-full" defaultValue={pref?.focusAreas ?? ""} placeholder="e.g. controlled substances, HIPAA, credentialing" onBlur={(e) => e.target.value !== (pref?.focusAreas ?? "") && void savePrefs({ focusAreas: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Tell me your preferences</label>
              <textarea className="input w-full resize-none" rows={2} defaultValue={pref?.agentNotes ?? ""} placeholder="e.g. I review compliance on Monday mornings; batch credential work; don't nudge me on low-risk items." onBlur={(e) => e.target.value !== (pref?.agentNotes ?? "") && void savePrefs({ agentNotes: e.target.value })} />
            </div>
          </CardContent>
        </Card>
      )}

      {brief && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" /> Your briefing</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{brief}</p></CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-10 text-success" />
          <p className="font-medium">You're all caught up.</p>
          <p className="text-sm text-muted-foreground">Nothing is due within your horizon. I'll surface things here before they slip.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {BUCKET_META.map(({ key, label, tone }) => {
            const group = grouped[key];
            if (group.length === 0) return null;
            return (
              <div key={key}>
                <h2 className={`mb-2 text-sm font-semibold ${tone}`}>{label} <span className="text-muted-foreground">({group.length})</span></h2>
                <div className="space-y-2">
                  {group.map((item) => (
                    <Card key={item.key}>
                      <CardContent className="flex items-center gap-3 py-3">
                        <span className={`size-2.5 shrink-0 rounded-full ${RISK_DOT[item.risk]}`} title={`risk ${item.risk}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.why}{item.daysUntil !== null && <span className={item.daysUntil < 0 ? "text-destructive" : ""}> · {dueLabel(item)}</span>}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => void addTask(item)} title="Add to my tasks"><Plus className="size-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => void snooze(item)} title="Snooze 7 days"><BellOff className="size-4" /></Button>
                          <Button asChild size="sm" variant="ghost" title="Open"><Link href={item.href}><ArrowUpRight className="size-4" /></Link></Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  ClipboardList,
  FileWarning,
  FlaskConical,
  GraduationCap,
  Package,
  ShieldAlert,
  Sparkles,
  Trophy,
  Star,
  CheckCircle2,
  Lock,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { PageTabs, OVERVIEW_TABS } from "@/components/shared/page-tabs";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { cn } from "@/lib/cn";
import { daysUntil, formatDate } from "@/lib/dates";
import { buildAgenda, groupByBucket, type WorkItem, type Bucket } from "@/lib/agenda";
import {
  assignmentIsOverdue,
  buildHolderIndex,
  bySoonest,
  computeComplianceScore,
  holderIsActive,
  credentialStatus,
  insuranceStatus,
  supersededInsuranceIds,
  documentNeedsReview,
  taskIsOpen,
  taskIsOverdue,
} from "@/lib/compliance";
import { staffRequirementStats } from "@/lib/credential-requirements";
import { ComplianceProgressCard } from "@/components/shared/compliance-progress-card";

type Tone = "default" | "success" | "warning" | "destructive";

interface QueueItem {
  id: string;
  primary: string;
  secondary?: string;
  badge?: { label: string; tone: Tone };
}

function toneBadgeVariant(tone: Tone) {
  return tone === "default" ? "secondary" : tone;
}

function dueBadge(date: string | null | undefined): QueueItem["badge"] {
  const d = daysUntil(date);
  if (d === null) return undefined;
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, tone: "destructive" };
  if (d === 0) return { label: "Due today", tone: "warning" };
  return { label: `${d}d left`, tone: d <= 7 ? "warning" : "default" };
}

function QueueCard({
  title,
  icon: Icon,
  href,
  items,
  emptyText,
  loading,
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  items: QueueItem[];
  emptyText: string;
  loading: boolean;
}) {
  const shown = items.slice(0, 5);
  const extra = items.length - shown.length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        {!loading && (
          <Badge variant={items.length ? "default" : "secondary"}>
            {items.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : shown.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.primary}</p>
                  {item.secondary && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.secondary}
                    </p>
                  )}
                </div>
                {item.badge && (
                  <Badge variant={toneBadgeVariant(item.badge.tone)}>
                    {item.badge.label}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {!loading && items.length > 0 && (
        <div className="px-5 pb-4">
          <Link
            href={href}
            className="text-xs font-medium text-primary hover:underline"
          >
            {extra > 0 ? `View all ${items.length}` : "View"} →
          </Link>
        </div>
      )}
    </Card>
  );
}

/** The unified, prioritized "what needs to be done" list — every due-dated
 *  signal fused and ranked, each item deep-linking to where to act. */
function AgendaBoard({ groups, loading }: { groups: Record<Bucket, WorkItem[]>; loading: boolean }) {
  const order: { b: Bucket; label: string; cap: number }[] = [
    { b: "overdue", label: "Overdue", cap: 20 },
    { b: "today", label: "Due today", cap: 20 },
    { b: "week", label: "This week", cap: 10 },
    { b: "horizon", label: "Coming up (30 days)", cap: 8 },
  ];
  const total = order.reduce((n, g) => n + groups[g.b].length, 0);
  const dot = (risk: number) => risk >= 3 ? "bg-destructive" : risk === 2 ? "bg-warning" : risk === 1 ? "bg-primary" : "bg-muted-foreground/50";
  const dueLabel = (it: WorkItem) => {
    if (it.daysUntil === null) return null;
    if (it.daysUntil < 0) return `${Math.abs(it.daysUntil)}d overdue`;
    if (it.daysUntil === 0) return "Today";
    return it.dueDate ? formatDate(it.dueDate) : `${it.daysUntil}d`;
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardList className="size-4 text-muted-foreground" /> What needs to be done
          {!loading && total > 0 && <Badge variant="default">{total}</Badge>}
        </CardTitle>
        <Link href="/chief-of-staff" className="text-xs text-primary hover:underline">Prioritized plan →</Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up — nothing needs action right now.</p>
        ) : (
          <div className="space-y-4">
            {order.filter((g) => groups[g.b].length > 0).map((g) => {
              const items = groups[g.b];
              const shown = items.slice(0, g.cap);
              return (
                <div key={g.b}>
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label} <span className="rounded-full bg-secondary px-1.5 text-[10px]">{items.length}</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {shown.map((it) => (
                      <Link key={it.key} href={it.href} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary/30">
                        <span className={cn("size-2 shrink-0 rounded-full", dot(it.risk))} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{it.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{it.why}</div>
                        </div>
                        {dueLabel(it) && <span className={cn("shrink-0 text-xs tabular-nums", it.daysUntil !== null && it.daysUntil < 0 ? "text-destructive" : "text-muted-foreground")}>{dueLabel(it)}</span>}
                      </Link>
                    ))}
                  </div>
                  {items.length > shown.length && (
                    <Link href="/chief-of-staff" className="mt-1 block px-2 text-xs text-primary hover:underline">+{items.length - shown.length} more →</Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommandCenterPage() {
  const tasksQ = useCollection("tasks");
  const credsQ = useCollection("credentials");
  const docsQ = useCollection("documents");
  const trainingQ = useCollection("trainingAssignments");
  const sdsQ = useCollection("sdsRecords");
  const riskQ = useCollection("riskCases");
  const regQ = useCollection("regulatorySources");
  const invQ = useCollection("inventory");
  const employeesQ = useCollection("employees");
  const screeningsQ = useCollection("exclusionScreenings");
  const insuranceQ = useCollection("insurancePolicies");
  // Extra signals the unified action queue fuses in.
  const capasQ = useCollection("correctiveActions");
  const sraQ = useCollection("sraFindings");
  const incidentsQ = useCollection("incidents");
  const breachesQ = useCollection("breachAssessments");
  const vendorsQ = useCollection("vendors");
  const backupsQ = useCollection("backups");

  const queries = [tasksQ, credsQ, docsQ, trainingQ, sdsQ, riskQ, regQ, invQ];
  const loading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const refetchAll = () => queries.forEach((q) => void q.refetch());

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const credentials = useMemo(() => credsQ.data ?? [], [credsQ.data]);
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const training = useMemo(() => trainingQ.data ?? [], [trainingQ.data]);
  const sds = useMemo(() => sdsQ.data ?? [], [sdsQ.data]);
  const risk = useMemo(() => riskQ.data ?? [], [riskQ.data]);
  const regs = useMemo(() => regQ.data ?? [], [regQ.data]);
  const inventory = useMemo(() => invQ.data ?? [], [invQ.data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);
  const insurance = useMemo(() => insuranceQ.data ?? [], [insuranceQ.data]);

  // Unified, prioritized "what needs to be done" — the same agenda the Chief of
  // Staff ranks, surfaced here in detail (each item deep-links to where to act).
  const screeningDueCount = useMemo(() => {
    const scr = screeningsQ.data ?? [];
    const active = (employeesQ.data ?? []).filter((e) => e.employmentStatus === "active");
    return active.filter((e) => {
      const name = `${e.firstName} ${e.lastName}`.trim().toLowerCase();
      const matches = scr.filter((x) => (e.userId && x.subjectUserId === e.userId) || x.subjectName.toLowerCase() === name);
      if (matches.length === 0) return true;
      const latest = matches.sort((a, b) => (b.screenedDate ?? b.createdDate).localeCompare(a.screenedDate ?? a.createdDate))[0];
      const d = latest.screenedDate ? daysUntil(latest.screenedDate) : null;
      return d === null || -d > 30;
    }).length;
  }, [screeningsQ.data, employeesQ.data]);

  const agenda = useMemo(() => buildAgenda({
    horizonDays: 30, showLow: false, snoozed: new Set<string>(),
    credentials, training, documents,
    correctiveActions: capasQ.data ?? [], sraFindings: sraQ.data ?? [],
    incidents: incidentsQ.data ?? [], breaches: breachesQ.data ?? [],
    insurance, vendors: vendorsQ.data ?? [], tasks,
    screeningDueCount,
    lastBackupAt: (backupsQ.data ?? []).slice().sort((a, b) => b.createdDate.localeCompare(a.createdDate))[0]?.createdDate ?? null,
    employees,
  }), [credentials, training, documents, capasQ.data, sraQ.data, incidentsQ.data, breachesQ.data, insurance, vendorsQ.data, tasks, screeningDueCount, backupsQ.data, employees]);
  const agendaGroups = useMemo(() => groupByBucket(agenda), [agenda]);

  // Context: warnings only for people who still work here. A former employee's
  // expired license is history, not an action item.
  const holderIdx = useMemo(() => buildHolderIndex(employees), [employees]);
  const activeCredentials = useMemo(
    () => credentials.filter((c) => holderIsActive(c, holderIdx)),
    [credentials, holderIdx],
  );
  const activeInsurance = useMemo(() => {
    const superseded = supersededInsuranceIds(insurance);
    return insurance
      .filter((p) => !superseded.has(p.id))
      .filter((p) => holderIsActive({ employeeUserId: p.holderUserId, employeeName: p.holderName }, holderIdx));
  }, [insurance, holderIdx]);
  const activeTraining = useMemo(
    () => training.filter((a) => holderIsActive({ employeeUserId: a.assignedToUserId, employeeName: a.assignedToName }, holderIdx)),
    [training, holderIdx],
  );

  const screenings = useMemo(() => screeningsQ.data ?? [], [screeningsQ.data]);
  const score = useMemo(
    () =>
      computeComplianceScore({
        tasks,
        credentials,
        trainingAssignments: training,
        documents,
        riskCases: risk,
        insurancePolicies: insurance,
        requirements: staffRequirementStats(employees, credentials, insurance),
        employees,
        exclusionScreenings: screenings,
      }),
    [tasks, credentials, training, documents, risk, insurance, employees, screenings],
  );
  // The program is "configured" once there's operational data to score against
  // (workforce credentials, training, tasks, or risk cases) — not just policies.
  const configured = credentials.length + training.length + tasks.length + risk.length > 0;

  const criticalItems: QueueItem[] = useMemo(() => {
    const overdueTasks = tasks.filter(taskIsOverdue).map<QueueItem>((t) => ({
      id: `t-${t.id}`,
      primary: t.title,
      secondary: t.assignedToName ? `Assigned to ${t.assignedToName}` : undefined,
      badge: dueBadge(t.dueDate),
    }));
    const expiredCreds = activeCredentials
      .filter((c) => credentialStatus(c) === "expired")
      .map<QueueItem>((c) => ({
        id: `c-${c.id}`,
        primary: `${c.credentialName} — ${c.employeeName}`,
        secondary: `Expired ${formatDate(c.expirationDate)}`,
        badge: { label: "Expired", tone: "destructive" },
      }));
    const expiredInsurance = activeInsurance
      .filter((p) => insuranceStatus(p) === "expired")
      .map<QueueItem>((p) => ({
        id: `i-${p.id}`,
        primary: `${p.policyName}${p.holderName ? ` — ${p.holderName}` : ""}`,
        secondary: `Insurance expired ${formatDate(p.renewalDate)}`,
        badge: { label: "Expired", tone: "destructive" },
      }));
    return [...overdueTasks, ...expiredCreds, ...expiredInsurance];
  }, [tasks, activeCredentials, activeInsurance]);

  const expiringCreds: QueueItem[] = useMemo(
    () => {
      const creds = activeCredentials
        .filter((c) => credentialStatus(c) === "expiring_soon")
        .map((c) => ({
          id: c.id,
          primary: `${c.credentialName} — ${c.employeeName}`,
          secondary: c.issuingBody ?? undefined,
          date: c.expirationDate,
          badge: dueBadge(c.expirationDate),
        }));
      const ins = activeInsurance
        .filter((p) => insuranceStatus(p) === "expiring_soon")
        .map((p) => ({
          id: `i-${p.id}`,
          primary: `${p.policyName}${p.holderName ? ` — ${p.holderName}` : ""}`,
          secondary: p.carrierName ?? "Insurance",
          date: p.renewalDate,
          badge: dueBadge(p.renewalDate),
        }));
      return [...creds, ...ins]
        .sort(bySoonest((x) => x.date))
        .map(({ date: _date, ...item }) => item);
    },
    [activeCredentials, activeInsurance],
  );

  const trainingDue: QueueItem[] = useMemo(
    () =>
      [...activeTraining]
        .filter((a) => {
          if (a.status === "completed") return false;
          const d = daysUntil(a.dueDate);
          return d !== null && d <= 14;
        })
        .sort(bySoonest((a) => a.dueDate))
        .map((a) => ({
          id: a.id,
          primary: a.moduleTitle,
          secondary: a.assignedToName,
          badge: assignmentIsOverdue(a)
            ? { label: "Overdue", tone: "destructive" }
            : dueBadge(a.dueDate),
        })),
    [activeTraining],
  );

  const riskItems: QueueItem[] = useMemo(
    () =>
      risk
        .filter((r) => r.status === "open" || r.status === "investigating")
        .map((r) => ({
          id: r.id,
          primary: r.caseTitle,
          secondary: r.reportedByName ? `Reported by ${r.reportedByName}` : undefined,
          badge: {
            label: r.severity,
            tone:
              r.severity === "critical" || r.severity === "high"
                ? "destructive"
                : r.severity === "medium"
                  ? "warning"
                  : "default",
          },
        })),
    [risk],
  );

  const sdsReviews: QueueItem[] = useMemo(
    () =>
      sds
        .filter((s) => s.status === "missing" || s.status === "needs_review")
        .map((s) => ({
          id: s.id,
          primary: s.productName,
          secondary: s.manufacturer ?? undefined,
          badge: {
            label: s.status === "missing" ? "Missing" : "Review",
            tone: s.status === "missing" ? "destructive" : "warning",
          },
        })),
    [sds],
  );

  const docReviews: QueueItem[] = useMemo(
    () =>
      documents.filter(documentNeedsReview).map((d) => ({
        id: d.id,
        primary: d.title,
        secondary: `v${d.version}`,
        badge: { label: "Past review", tone: "warning" },
      })),
    [documents],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance Command Center" />
        <ErrorState
          message="We couldn't load the compliance overview."
          onRetry={refetchAll}
        />
      </div>
    );
  }

  const openTasks = tasks.filter(taskIsOpen).length;
  const activeDocs = documents.filter((d) => d.status === "active").length;
  const regsNeedReview = regs.filter((r) => r.reviewStatus === "needs_review").length;
  const brokenInventory = inventory.filter((i) => i.status === "broken").length;

  return (
    <div className="space-y-6">
      <PageTabs tabs={OVERVIEW_TABS} />
      <PageHeader
        title="Compliance Command Center"
        description="Real-time monitoring and action queues across your entire compliance program."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/reports">Reports</Link>
            </Button>
            <Button asChild>
              <Link href="/compliance-concierge">
                <Sparkles className="size-4" />
                Open setup guide
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ComplianceProgressCard score={score} loading={loading} configured={configured} />
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3">
          <StatCard label="Critical items" value={score.criticalCount} icon={AlertTriangle} tone="destructive" loading={loading} href="/credentials" />
          <StatCard label="High priority" value={score.highCount} icon={ShieldAlert} tone="warning" loading={loading} href="/chief-of-staff" />
          <StatCard label="Open tasks" value={openTasks} icon={ClipboardList} loading={loading} href="/chief-of-staff" />
          <StatCard label="Active documents" value={activeDocs} icon={BookOpen} loading={loading} href="/sop-library" />
          <StatCard label="Sources to review" value={regsNeedReview} icon={FileWarning} tone={regsNeedReview ? "warning" : "default"} loading={loading} href="/regulatory-sources" />
          <StatCard label="Broken inventory" value={brokenInventory} icon={Package} tone={brokenInventory ? "warning" : "default"} loading={loading} href="/inventory" />
        </div>
      </div>

      {/* The prioritized, detailed action list — what actually needs doing. */}
      <AgendaBoard groups={agendaGroups} loading={loading} />

      {/* Secondary: browse the same signals by area. */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Browse by area</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <QueueCard title="Critical attention" icon={AlertTriangle} href="/credentials" items={criticalItems} emptyText="Nothing critical right now." loading={loading} />
          <QueueCard title="Credentials expiring" icon={BadgeCheck} href="/credentials" items={expiringCreds} emptyText="No credentials expiring in 30 days." loading={loading} />
          <QueueCard title="Training due" icon={GraduationCap} href="/training" items={trainingDue} emptyText="All training is on track." loading={loading} />
          <QueueCard title="Open risk cases" icon={ShieldAlert} href="/risk-management" items={riskItems} emptyText="No open risk cases." loading={loading} />
          <QueueCard title="SDS reviews" icon={FlaskConical} href="/sds-library" items={sdsReviews} emptyText="SDS library is complete." loading={loading} />
          <QueueCard title="Documents past review" icon={FileWarning} href="/sop-library" items={docReviews} emptyText="No documents past review." loading={loading} />
        </div>
      </div>
    </div>
  );
}

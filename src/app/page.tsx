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
import {
  assignmentIsOverdue,
  buildHolderIndex,
  bySoonest,
  computeComplianceScore,
  holderIsActive,
  credentialStatus,
  documentNeedsReview,
  scoreBand,
  taskIsOpen,
  taskIsOverdue,
} from "@/lib/compliance";

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

  // Context: warnings only for people who still work here. A former employee's
  // expired license is history, not an action item.
  const holderIdx = useMemo(() => buildHolderIndex(employees), [employees]);
  const activeCredentials = useMemo(
    () => credentials.filter((c) => holderIsActive(c, holderIdx)),
    [credentials, holderIdx],
  );
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
        employees,
        exclusionScreenings: screenings,
      }),
    [tasks, credentials, training, documents, risk, employees, screenings],
  );
  const band = scoreBand(score.score);
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
    return [...overdueTasks, ...expiredCreds];
  }, [tasks, activeCredentials]);

  const expiringCreds: QueueItem[] = useMemo(
    () =>
      [...activeCredentials]
        .filter((c) => credentialStatus(c) === "expiring_soon")
        .sort(bySoonest((c) => c.expirationDate))
        .map((c) => ({
          id: c.id,
          primary: `${c.credentialName} — ${c.employeeName}`,
          secondary: c.issuingBody ?? undefined,
          badge: dueBadge(c.expirationDate),
        })),
    [activeCredentials],
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
        <ScoreCard score={score} band={band} loading={loading} configured={configured} />
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3">
          <StatCard label="Critical items" value={score.criticalCount} icon={AlertTriangle} tone="destructive" loading={loading} href="/credentials" />
          <StatCard label="High priority" value={score.highCount} icon={ShieldAlert} tone="warning" loading={loading} href="/chief-of-staff" />
          <StatCard label="Open tasks" value={openTasks} icon={ClipboardList} loading={loading} href="/chief-of-staff" />
          <StatCard label="Active documents" value={activeDocs} icon={BookOpen} loading={loading} href="/sop-library" />
          <StatCard label="Sources to review" value={regsNeedReview} icon={FileWarning} tone={regsNeedReview ? "warning" : "default"} loading={loading} href="/regulatory-sources" />
          <StatCard label="Broken inventory" value={brokenInventory} icon={Package} tone={brokenInventory ? "warning" : "default"} loading={loading} href="/inventory" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <QueueCard title="Critical attention" icon={AlertTriangle} href="/credentials" items={criticalItems} emptyText="Nothing critical right now." loading={loading} />
        <QueueCard title="Credentials expiring" icon={BadgeCheck} href="/credentials" items={expiringCreds} emptyText="No credentials expiring in 30 days." loading={loading} />
        <QueueCard title="Training due" icon={GraduationCap} href="/training" items={trainingDue} emptyText="All training is on track." loading={loading} />
        <QueueCard title="Open risk cases" icon={ShieldAlert} href="/risk-management" items={riskItems} emptyText="No open risk cases." loading={loading} />
        <QueueCard title="SDS reviews" icon={FlaskConical} href="/sds-library" items={sdsReviews} emptyText="SDS library is complete." loading={loading} />
        <QueueCard title="Documents past review" icon={FileWarning} href="/sop-library" items={docReviews} emptyText="No documents past review." loading={loading} />
      </div>
    </div>
  );
}

function ScoreCard({
  score,
  band,
  loading,
  configured,
}: {
  score: ReturnType<typeof computeComplianceScore>;
  band: ReturnType<typeof scoreBand>;
  loading: boolean;
  configured: boolean;
}): ReactNode {
  const barTone =
    band.tone === "success"
      ? "bg-success"
      : band.tone === "warning"
        ? "bg-warning"
        : "bg-destructive";

  // A score of 100 is only meaningful once the program is actually being
  // tracked. On a fresh, unconfigured program, show a setup state instead.
  if (!loading && !configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Compliance score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <span className="text-5xl font-semibold tabular-nums text-muted-foreground">—</span>
            <Badge variant="secondary" className="mb-1.5">Not configured</Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" />
          <p className="text-sm text-muted-foreground">
            Scoring activates once you start tracking your program. Add employees, credentials,
            and training assignments — the <a href="/compliance-concierge" className="text-primary hover:underline">Setup Concierge</a> can help.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Compliance score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-12 w-28" />
        ) : (
          <div className="flex items-end gap-3">
            <span className="text-5xl font-semibold tabular-nums">
              {score.score}
            </span>
            <Badge variant={toneBadgeVariant(band.tone)} className="mb-1.5">
              {band.label}
            </Badge>
          </div>
        )}

        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full transition-all", barTone)}
            style={{ width: `${loading ? 0 : score.score}%` }}
          />
        </div>

        {!loading && (
          <div className="space-y-1.5 pt-1">
            {score.factors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No deductions — fully compliant.
              </p>
            ) : (
              score.factors.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {f.label}
                    <span className="ml-1 text-xs">({f.count})</span>
                  </span>
                  <span className="tabular-nums text-destructive">{f.impact}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  FileText,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { PageTabs, OVERVIEW_TABS } from "@/components/shared/page-tabs";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { daysUntil, formatDate } from "@/lib/dates";
import {
  assignmentIsOverdue,
  bySoonest,
  computeComplianceScore,
  credentialStatus,
  scoreBand,
} from "@/lib/compliance";
import { countRequirementGaps } from "@/lib/credential-requirements";

const CHART = {
  primary: "hsl(210 100% 56%)",
  success: "hsl(122 39% 49%)",
  warning: "hsl(45 100% 51%)",
  destructive: "hsl(4 90% 58%)",
  muted: "hsl(0 0% 38%)",
};

/* ----------------------------- mini charts ----------------------------- */

function Donut({
  segments,
  centerLabel,
  centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerSub?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="size-32 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(0 0% 18%)" strokeWidth="14" />
        {total > 0 &&
          segments.map((seg) => {
            const len = (seg.value / total) * c;
            const el = (
              <circle
                key={seg.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="space-y-1.5">
        <div className="-mt-1">
          <p className="text-2xl font-semibold tabular-nums">{centerLabel}</p>
          {centerSub && <p className="text-xs text-muted-foreground">{centerSub}</p>}
        </div>
        <ul className="space-y-1">
          {segments.map((seg) => (
            <li key={seg.label} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="ml-auto tabular-nums">{seg.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  caption,
  color = CHART.primary,
}: {
  label: string;
  value: number;
  max: number;
  caption: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{caption}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ------------------------------- page ---------------------------------- */

export default function ExecutiveDashboardPage() {
  const tasksQ = useCollection("tasks");
  const credsQ = useCollection("credentials");
  const docsQ = useCollection("documents");
  const trainingQ = useCollection("trainingAssignments");
  const riskQ = useCollection("riskCases");
  const empQ = useCollection("employees");
  const insQ = useCollection("insurancePolicies");
  const screeningsQ = useCollection("exclusionScreenings");

  const queries = [tasksQ, credsQ, docsQ, trainingQ, riskQ, empQ, insQ, screeningsQ];
  const loading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  const refetchAll = () => queries.forEach((q) => void q.refetch());

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const credentials = useMemo(() => credsQ.data ?? [], [credsQ.data]);
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const training = useMemo(() => trainingQ.data ?? [], [trainingQ.data]);
  const risk = useMemo(() => riskQ.data ?? [], [riskQ.data]);
  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);
  const insurance = useMemo(() => insQ.data ?? [], [insQ.data]);
  const screenings = useMemo(() => screeningsQ.data ?? [], [screeningsQ.data]);

  // Canonical score: SAME inputs as Home (incl. employees + exclusion screenings)
  // so the executive number matches Home's exactly.
  const score = useMemo(
    () =>
      computeComplianceScore({
        tasks,
        credentials,
        trainingAssignments: training,
        documents,
        riskCases: risk,
        insurancePolicies: insurance,
        requirementGaps: countRequirementGaps(employees, credentials, insurance),
        employees,
        exclusionScreenings: screenings,
      }),
    [tasks, credentials, training, documents, risk, insurance, employees, screenings],
  );
  const band = scoreBand(score.score);

  // Credential status distribution (derived from expiration dates).
  const credSegments = useMemo(() => {
    const counts = { active: 0, expiring_soon: 0, expired: 0, no_expiry: 0 };
    for (const c of credentials) counts[credentialStatus(c)]++;
    return [
      { label: "Active", value: counts.active, color: CHART.success },
      { label: "Expiring ≤30d", value: counts.expiring_soon, color: CHART.warning },
      { label: "Expired", value: counts.expired, color: CHART.destructive },
      { label: "No expiry", value: counts.no_expiry, color: CHART.muted },
    ];
  }, [credentials]);

  // Multi-factor department compliance: an employee is compliant only with no
  // expired credentials AND no overdue training (the source app used overdue
  // tasks alone). Employees are matched by name.
  const deptStats = useMemo(() => {
    const map = new Map<string, { total: number; compliant: number }>();
    for (const e of employees) {
      if (e.employmentStatus !== "active") continue;
      const dept = e.department ?? "other";
      const name = `${e.firstName} ${e.lastName}`;
      const expiredCred = credentials.some(
        (c) => c.employeeName === name && credentialStatus(c) === "expired",
      );
      const overdueTraining = training.some(
        (a) => a.assignedToName === name && assignmentIsOverdue(a),
      );
      const cur = map.get(dept) ?? { total: 0, compliant: 0 };
      cur.total += 1;
      if (!expiredCred && !overdueTraining) cur.compliant += 1;
      map.set(dept, cur);
    }
    return [...map.entries()]
      .map(([dept, s]) => ({
        dept,
        ...s,
        pct: s.total ? Math.round((s.compliant / s.total) * 100) : 0,
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [employees, credentials, training]);

  // Upcoming deadlines across sources, within a live 30-day window.
  const deadlines = useMemo(() => {
    type D = { id: string; label: string; type: string; date: string; days: number };
    const out: D[] = [];
    const push = (
      id: string,
      label: string,
      type: string,
      date: string | null | undefined,
    ) => {
      const days = daysUntil(date);
      if (days !== null && days >= 0 && days <= 30 && date) {
        out.push({ id, label, type, date, days });
      }
    };
    credentials.forEach((c) =>
      push(`cred-${c.id}`, `${c.credentialName} — ${c.employeeName}`, "Credential", c.expirationDate),
    );
    training.forEach((a) => {
      if (a.status !== "completed")
        push(`tr-${a.id}`, `${a.moduleTitle} — ${a.assignedToName}`, "Training", a.dueDate);
    });
    documents.forEach((d) => {
      if (d.status === "active")
        push(`doc-${d.id}`, `Review: ${d.title}`, "Document", d.reviewDate);
    });
    insurance.forEach((i) =>
      push(`ins-${i.id}`, `Renew: ${i.policyName}`, "Insurance", i.renewalDate),
    );
    return out.sort(bySoonest((d) => d.date)).slice(0, 8);
  }, [credentials, training, documents, insurance]);

  // Already-overdue / expired items. Surfaced explicitly so the dashboard can't
  // read as "all clear" (100% + nothing due) while the score is docked for them
  // — this is what reconciles the exec view with the compliance score. Includes
  // expired credentials that aren't matched to a current employee.
  const overdue = useMemo(() => {
    type O = { id: string; label: string; type: string; detail: string };
    const out: O[] = [];
    credentials.forEach((c) => {
      if (credentialStatus(c) === "expired")
        out.push({ id: `oc-${c.id}`, label: `${c.credentialName} — ${c.employeeName}`, type: "Credential", detail: c.expirationDate ? `Expired ${formatDate(c.expirationDate)}` : "Expired" });
    });
    training.forEach((a) => {
      if (a.status !== "completed" && assignmentIsOverdue(a))
        out.push({ id: `ot-${a.id}`, label: `${a.moduleTitle} — ${a.assignedToName}`, type: "Training", detail: a.dueDate ? `Due ${formatDate(a.dueDate)}` : "Overdue" });
    });
    insurance.forEach((i) => {
      const d = daysUntil(i.renewalDate);
      if (d !== null && d < 0)
        out.push({ id: `oi-${i.id}`, label: `Renew: ${i.policyName}`, type: "Insurance", detail: i.renewalDate ? `Lapsed ${formatDate(i.renewalDate)}` : "Lapsed" });
    });
    return out;
  }, [credentials, training, insurance]);

  const openRisk = risk.filter((r) => r.status === "open" || r.status === "investigating");
  const riskBySeverity = useMemo(() => {
    const order: { key: string; label: string; color: string }[] = [
      { key: "critical", label: "Critical", color: CHART.destructive },
      { key: "high", label: "High", color: CHART.destructive },
      { key: "medium", label: "Medium", color: CHART.warning },
      { key: "low", label: "Low", color: CHART.primary },
    ];
    return order.map((o) => ({
      ...o,
      value: openRisk.filter((r) => r.severity === o.key).length,
    }));
  }, [openRisk]);
  const maxRisk = Math.max(1, ...riskBySeverity.map((r) => r.value));

  const activeEmployees = employees.filter((e) => e.employmentStatus === "active").length;
  const docsUnderReview = documents.filter((d) => d.status === "under_review").length;
  const expiringOrExpired = credentials.filter((c) => {
    const s = credentialStatus(c);
    return s === "expired" || s === "expiring_soon";
  }).length;

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Executive Dashboard" />
        <ErrorState message="We couldn't load executive metrics." onRetry={refetchAll} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTabs tabs={OVERVIEW_TABS} />
      <PageHeader
        title="Executive Dashboard"
        description="Organization-wide compliance health, credential posture, and upcoming obligations."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/">Command Center</Link>
            </Button>
            <Button asChild>
              <Link href="/reports">Reports</Link>
            </Button>
          </>
        }
      />

      {/* Health + key metrics */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Compliance health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-12 w-28" />
            ) : (
              <div className="flex items-end gap-3">
                <span className="text-5xl font-semibold tabular-nums">{score.score}</span>
                <Badge variant={band.tone} className="mb-1.5">
                  {band.label}
                </Badge>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {score.criticalCount} critical · {score.highCount} high-priority items
              across the organization.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard label="Active employees" value={activeEmployees} icon={Users} loading={loading} />
          <StatCard label="Open risk cases" value={openRisk.length} icon={ShieldAlert} tone={openRisk.length ? "warning" : "default"} loading={loading} />
          <StatCard label="Documents under review" value={docsUnderReview} icon={FileText} loading={loading} />
          <StatCard label="Credentials expiring/expired" value={expiringOrExpired} icon={BadgeCheck} tone={expiringOrExpired ? "warning" : "default"} loading={loading} />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credential posture</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <Donut
                segments={credSegments}
                centerLabel={String(credentials.length)}
                centerSub="credentials tracked"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department compliance</CardTitle>
            <p className="text-xs text-muted-foreground">Active staff with no expired credential or overdue training. Unassigned/expired items show in the Overdue panel.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : deptStats.length === 0 ? (
              <EmptyState title="No active employees" />
            ) : (
              deptStats.map((d) => (
                <BarRow
                  key={d.dept}
                  label={departmentLabel(d.dept)}
                  value={d.compliant}
                  max={d.total}
                  caption={`${d.pct}% · ${d.compliant}/${d.total}`}
                  color={
                    d.pct >= 85 ? CHART.success : d.pct >= 60 ? CHART.warning : CHART.destructive
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue & expired — surfaced so the dashboard reconciles with the score */}
      {!loading && overdue.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Overdue &amp; expired — needs attention ({overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {overdue.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{o.label}</p>
                    <p className="text-xs text-muted-foreground">{o.type} · {o.detail}</p>
                  </div>
                  <Badge variant="destructive">Overdue</Badge>
                </li>
              ))}
            </ul>
            {overdue.length > 8 && <p className="mt-2 text-xs text-muted-foreground">+{overdue.length - 8} more</p>}
          </CardContent>
        </Card>
      )}

      {/* Deadlines + risk */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              Upcoming deadlines (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-3/4" />
              </div>
            ) : deadlines.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing due in the next 30 days"
                description="Credential, training, document, and insurance deadlines will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {deadlines.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.type} · {formatDate(d.date)}
                      </p>
                    </div>
                    <Badge variant={d.days <= 7 ? "warning" : "secondary"}>
                      {d.days === 0 ? "Today" : `${d.days}d`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open risk by severity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : openRisk.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No open risk cases" />
            ) : (
              riskBySeverity.map((r) => (
                <BarRow
                  key={r.label}
                  label={r.label}
                  value={r.value}
                  max={maxRisk}
                  caption={String(r.value)}
                  color={r.color}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function departmentLabel(dept: string): string {
  return dept
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

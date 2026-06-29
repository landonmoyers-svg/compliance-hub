"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  Umbrella,
  Star,
  Heart,
  AlertTriangle,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";

const HR_LINKS = [
  { href: "/hr/employees", label: "Employee Directory", icon: Users, description: "View and manage all staff records" },
  { href: "/hr/payroll", label: "Payroll", icon: DollarSign, description: "Payroll records and pay periods" },
  { href: "/hr/timeclock", label: "Time Clock", icon: Clock, description: "Clock in/out and timesheets" },
  { href: "/hr/time-off", label: "Time Off", icon: Umbrella, description: "PTO requests and balances" },
  { href: "/hr/performance", label: "Performance Reviews", icon: Star, description: "GWC reviews and Rocks" },
  { href: "/hr/benefits", label: "Benefits", icon: Heart, description: "Plan definitions and enrollment" },
  { href: "/hr/disciplinary", label: "Disciplinary Actions", icon: AlertTriangle, description: "Disciplinary records and PIPs" },
];

export default function HRHubPage() {
  const empQ = useCollection("employees");
  const trainingQ = useCollection("trainingAssignments");

  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);
  const training = useMemo(() => trainingQ.data ?? [], [trainingQ.data]);

  const loading = empQ.isLoading || trainingQ.isLoading;
  const isError = empQ.isError || trainingQ.isError;

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.employmentStatus === "active");
    const byDept = active.reduce<Record<string, number>>((acc, e) => {
      const dept = e.department ?? "other";
      acc[dept] = (acc[dept] ?? 0) + 1;
      return acc;
    }, {});
    return {
      active: active.length,
      onLeave: employees.filter((e) => e.employmentStatus === "on_leave").length,
      inactive: employees.filter((e) => e.employmentStatus !== "active" && e.employmentStatus !== "on_leave").length,
      byDept,
    };
  }, [employees]);

  const recentHires = useMemo(
    () =>
      [...employees]
        .filter((e) => e.hireDate && e.employmentStatus === "active")
        .sort((a, b) => (b.hireDate ?? "").localeCompare(a.hireDate ?? ""))
        .slice(0, 5),
    [employees],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="HR Hub" />
        <ErrorState
          message="We couldn't load HR data."
          onRetry={() => { void empQ.refetch(); void trainingQ.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Hub"
        description="Central hub for human resources — employees, payroll, time, performance, and benefits."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active employees" value={stats.active} icon={Users} tone="success" loading={loading} />
        <StatCard label="On leave" value={stats.onLeave} icon={Users} tone="warning" loading={loading} />
        <StatCard label="Inactive" value={stats.inactive} icon={Users} loading={loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick links */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HR sections</h2>
          {HR_LINKS.map(({ href, label, icon: Icon, description }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary/30 transition-colors group"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
                <Icon className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>

        {/* Department breakdown */}
        <Card>
          <CardHeader><CardTitle>Headcount by department</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : Object.keys(stats.byDept).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active employees.</p>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(stats.byDept)
                  .sort(([, a], [, b]) => b - a)
                  .map(([dept, count]) => (
                    <div key={dept} className="flex items-center gap-3">
                      <span className="w-24 text-sm capitalize truncate">{dept.replace("_", " ")}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(count / stats.active) * 100}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-sm text-muted-foreground w-4 text-right">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent hires */}
        <Card>
          <CardHeader><CardTitle>Recent hires</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : recentHires.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hire dates recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentHires.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                        {e.firstName.charAt(0)}{e.lastName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.firstName} {e.lastName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{e.department ?? "—"}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {e.hireDate ? new Date(e.hireDate).getFullYear() : "—"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Training completion overview */}
      <Card>
        <CardHeader><CardTitle>Training completion by staff member</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            (() => {
              const byEmployee: Record<string, { done: number; total: number }> = {};
              for (const a of training) {
                if (!byEmployee[a.assignedToName]) byEmployee[a.assignedToName] = { done: 0, total: 0 };
                byEmployee[a.assignedToName].total++;
                if (a.status === "completed") byEmployee[a.assignedToName].done++;
              }
              const rows = Object.entries(byEmployee).sort(([a], [b]) => a.localeCompare(b));
              if (rows.length === 0) return <p className="text-sm text-muted-foreground">No training assignments found.</p>;
              return (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(([name, { done, total }]) => {
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div key={name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate">{name}</span>
                          <span className="text-muted-foreground tabular-nums ml-2">{done}/{total}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct === 100 ? "bg-success" : pct >= 50 ? "bg-primary" : "bg-warning"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}

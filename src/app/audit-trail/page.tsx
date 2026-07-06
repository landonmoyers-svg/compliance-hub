"use client";

import { useState, useMemo } from "react";
import { Shield, Search, Download, Flag, AlertTriangle, Activity, LogIn } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditLog } from "@/lib/data/schema";

type ActionType = AuditLog["action"];
type RiskLevel = AuditLog["riskLevel"];
type TabKey = "timeline" | "flagged" | "analytics";

const ACTION_OPTIONS: ActionType[] = [
  "view", "create", "update", "delete", "export",
  "login", "logout", "failed_login", "acknowledge", "sign",
];

const RISK_OPTIONS: RiskLevel[] = ["low", "medium", "high", "critical"];

const ACTION_LABEL: Record<ActionType, string> = {
  view: "View",
  create: "Create",
  update: "Update",
  delete: "Delete",
  export: "Export",
  login: "Login",
  logout: "Logout",
  failed_login: "Failed login",
  acknowledge: "Acknowledge",
  sign: "Sign",
};

const RISK_BADGE: Record<RiskLevel, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "warning",
  critical: "destructive",
};

const RANGE_OPTIONS = [
  { value: 1, label: "Last 24 hours" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 0, label: "All time" },
] as const;

function formatTs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function AuditTrailPage() {
  const logQ = useCollection("auditLogs");

  const [tab, setTab] = useState<TabKey>("timeline");
  const [search, setSearch] = useState("");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [filterAction, setFilterAction] = useState<ActionType | "all">("all");
  const [filterRisk, setFilterRisk] = useState<RiskLevel | "all">("all");

  const logs = useMemo(() => logQ.data ?? [], [logQ.data]);

  // Newest first, then apply all active filters.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = rangeDays > 0 ? Date.now() - rangeDays * 86_400_000 : null;

    return [...logs]
      .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
      .filter((e) => {
        if (cutoff !== null) {
          const t = new Date(e.createdDate).getTime();
          if (Number.isNaN(t) || t < cutoff) return false;
        }
        if (filterAction !== "all" && e.action !== filterAction) return false;
        if (filterRisk !== "all" && e.riskLevel !== filterRisk) return false;
        if (q) {
          const haystack = [
            e.actorName,
            e.actorEmail ?? "",
            e.entityType ?? "",
            e.entityLabel ?? "",
            e.details ?? "",
          ].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
  }, [logs, search, rangeDays, filterAction, filterRisk]);

  const flaggedRows = useMemo(() => filtered.filter((e) => e.flagged), [filtered]);

  // Stat cards reflect the currently-filtered set.
  const stats = useMemo(() => {
    let flagged = 0;
    let highCritical = 0;
    let failedLogins = 0;
    for (const e of filtered) {
      if (e.flagged) flagged++;
      if (e.riskLevel === "high" || e.riskLevel === "critical") highCritical++;
      if (e.action === "failed_login") failedLogins++;
    }
    return { total: filtered.length, flagged, highCritical, failedLogins };
  }, [filtered]);

  const analytics = useMemo(() => {
    const byAction = new Map<ActionType, number>();
    const byActor = new Map<string, number>();
    for (const e of filtered) {
      byAction.set(e.action, (byAction.get(e.action) ?? 0) + 1);
      byActor.set(e.actorName, (byActor.get(e.actorName) ?? 0) + 1);
    }
    const actionRows = [...byAction.entries()].sort((a, b) => b[1] - a[1]);
    const actorRows = [...byActor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxAction = actionRows.reduce((m, [, n]) => Math.max(m, n), 0);
    const maxActor = actorRows.reduce((m, [, n]) => Math.max(m, n), 0);
    const deletes = byAction.get("delete") ?? 0;
    const failedLogins = byAction.get("failed_login") ?? 0;
    return { actionRows, actorRows, maxAction, maxActor, deletes, failedLogins };
  }, [filtered]);

  function exportCSV() {
    const rows = tab === "flagged" ? flaggedRows : filtered;
    const header = [
      "timestamp", "actor", "email", "action",
      "entityType", "entityLabel", "details", "riskLevel", "flagged",
    ];
    const body = rows.map((e) => [
      e.createdDate,
      e.actorName,
      e.actorEmail ?? "",
      e.action,
      e.entityType ?? "",
      e.entityLabel ?? "",
      e.details ?? "",
      e.riskLevel,
      e.flagged ? "true" : "false",
    ]);
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-trail.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (logQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Trail" />
        <ErrorState message="We couldn't load the audit log." onRetry={() => void logQ.refetch()} />
      </div>
    );
  }

  const loading = logQ.isLoading;
  const noData = !loading && logs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Tamper-resistant log of changes to sensitive records (payroll, HR files, discipline, reviews, risk, user roles), data exports, and sign-in/out events."
        actions={
          <Button variant="outline" onClick={exportCSV} disabled={loading || filtered.length === 0}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        <Shield className="mr-1.5 -mt-0.5 inline size-4" />
        Change entries on sensitive tables are written by database triggers — server-side and append-only, so they
        can&apos;t be edited or removed from the app. Record views are not logged.
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total events" value={stats.total} icon={Activity} loading={loading} />
        <StatCard label="Flagged" value={stats.flagged} icon={Flag} tone={stats.flagged > 0 ? "warning" : undefined} loading={loading} />
        <StatCard label="High + critical risk" value={stats.highCritical} icon={AlertTriangle} tone={stats.highCritical > 0 ? "destructive" : undefined} loading={loading} />
        <StatCard label="Failed logins" value={stats.failedLogins} icon={LogIn} tone={stats.failedLogins > 0 ? "destructive" : undefined} loading={loading} />
      </div>

      {noData ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={Shield}
              title="No audit events yet"
              description="Activity will appear here as users take actions."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["timeline", "flagged", "analytics"] as TabKey[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors " +
                    (tab === t
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground")
                  }
                >
                  {t === "flagged" ? `Flagged (${flaggedRows.length})` : t}
                </button>
              ))}
            </div>

            {tab !== "analytics" && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="input w-full pl-9"
                    placeholder="Search actor, entity, or details…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select className="input" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  className="input"
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value as ActionType | "all")}
                >
                  <option value="all">All actions</option>
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a} value={a}>{ACTION_LABEL[a]}</option>
                  ))}
                </select>
                <select
                  className="input"
                  value={filterRisk}
                  onChange={(e) => setFilterRisk(e.target.value as RiskLevel | "all")}
                >
                  <option value="all">All risk levels</option>
                  {RISK_OPTIONS.map((r) => (
                    <option key={r} value={r} className="capitalize">{r}</option>
                  ))}
                </select>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : tab === "analytics" ? (
              <AnalyticsView analytics={analytics} />
            ) : tab === "flagged" ? (
              flaggedRows.length === 0 ? (
                <EmptyState icon={Flag} title="No flagged events" description="No flagged activity matches the current filters." />
              ) : (
                <FlaggedTable rows={flaggedRows} />
              )
            ) : filtered.length === 0 ? (
              <EmptyState icon={Shield} title="No audit entries found" description="Try adjusting your search or filters." />
            ) : (
              <TimelineTable rows={filtered} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: ActionType }) {
  return <Badge variant="secondary">{ACTION_LABEL[action]}</Badge>;
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge variant={RISK_BADGE[level]} className="capitalize">{level}</Badge>;
}

function TimelineTable({ rows }: { rows: AuditLog[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Timestamp</th>
            <th className="pb-2 pr-4 font-medium">Actor</th>
            <th className="pb-2 pr-4 font-medium">Action</th>
            <th className="pb-2 pr-4 font-medium">Entity</th>
            <th className="pb-2 pr-4 font-medium">Details</th>
            <th className="pb-2 pr-4 font-medium">Risk</th>
            <th className="pb-2 font-medium">Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
              <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-muted-foreground">{formatTs(e.createdDate)}</td>
              <td className="py-2.5 pr-4">
                <div className="font-medium">{e.actorName}</div>
                {e.actorEmail && <div className="text-xs text-muted-foreground">{e.actorEmail}</div>}
              </td>
              <td className="py-2.5 pr-4"><ActionBadge action={e.action} /></td>
              <td className="py-2.5 pr-4">
                {e.entityType && <div className="text-xs text-muted-foreground">{e.entityType}</div>}
                <div>{e.entityLabel || "—"}</div>
              </td>
              <td className="py-2.5 pr-4 text-muted-foreground">{e.details || "—"}</td>
              <td className="py-2.5 pr-4"><RiskBadge level={e.riskLevel} /></td>
              <td className="py-2.5">
                {e.flagged ? (
                  <span className="inline-flex items-center gap-1 text-warning" title={e.flagReason ?? undefined}>
                    <Flag className="size-3.5" />
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlaggedTable({ rows }: { rows: AuditLog[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Timestamp</th>
            <th className="pb-2 pr-4 font-medium">Actor</th>
            <th className="pb-2 pr-4 font-medium">Action</th>
            <th className="pb-2 pr-4 font-medium">Entity</th>
            <th className="pb-2 pr-4 font-medium">Risk</th>
            <th className="pb-2 font-medium">Flag reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
              <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-muted-foreground">{formatTs(e.createdDate)}</td>
              <td className="py-2.5 pr-4">
                <div className="font-medium">{e.actorName}</div>
                {e.actorEmail && <div className="text-xs text-muted-foreground">{e.actorEmail}</div>}
              </td>
              <td className="py-2.5 pr-4"><ActionBadge action={e.action} /></td>
              <td className="py-2.5 pr-4">
                {e.entityType && <div className="text-xs text-muted-foreground">{e.entityType}</div>}
                <div>{e.entityLabel || "—"}</div>
              </td>
              <td className="py-2.5 pr-4"><RiskBadge level={e.riskLevel} /></td>
              <td className="py-2.5 text-warning">{e.flagReason || "Flagged"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Analytics = {
  actionRows: [ActionType, number][];
  actorRows: [string, number][];
  maxAction: number;
  maxActor: number;
  deletes: number;
  failedLogins: number;
};

function AnalyticsView({ analytics }: { analytics: Analytics }) {
  const { actionRows, actorRows, maxAction, maxActor, deletes, failedLogins } = analytics;

  if (actionRows.length === 0) {
    return <EmptyState icon={Activity} title="No data to analyze" description="No events match the current filters." />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground">Events by action</h3>
        <div className="space-y-2.5">
          {actionRows.map(([action, count]) => (
            <div key={action} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{ACTION_LABEL[action]}</span>
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${maxAction ? (count / maxAction) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Top 5 most-active actors</h3>
          {actorRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actors recorded.</p>
          ) : (
            <div className="space-y-2.5">
              {actorRows.map(([actor, count]) => (
                <div key={actor} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{actor}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-success/60"
                      style={{ width: `${maxActor ? (count / maxActor) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="text-2xl font-semibold tabular-nums">{failedLogins}</div>
            <div className="text-sm text-muted-foreground">Failed logins</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="text-2xl font-semibold tabular-nums">{deletes}</div>
            <div className="text-sm text-muted-foreground">Delete actions</div>
          </div>
        </div>
      </div>
    </div>
  );
}

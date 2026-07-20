"use client";

import { useState, useMemo, useEffect } from "react";
import { Shield, Search, Download, Flag, AlertTriangle, Activity, LogIn, MapPin, Monitor } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { humanizeLabel } from "@/lib/format";
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

/** Severity order for sorting (alphabetical would put "critical" before "high"). */
const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

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

const DEVICE_OPTIONS = ["Desktop", "Mobile", "Tablet", "Bot"] as const;

/** A place string like "Murray, UT, US" from the captured geo columns. */
function geoLabel(e: AuditLog): string {
  return [e.geoCity, e.geoRegion, e.geoCountry].filter(Boolean).join(", ");
}

/** Map a raw audit_logs row (snake_case) to the AuditLog shape. */
function mapAudit(r: Record<string, unknown>): AuditLog {
  return {
    id: r.id as string, createdDate: r.created_date as string,
    actorName: (r.actor_name as string) ?? "Unknown",
    actorEmail: (r.actor_email as string) ?? undefined,
    action: r.action as AuditLog["action"],
    entityType: (r.entity_type as string) ?? undefined,
    entityId: (r.entity_id as string) ?? undefined,
    entityLabel: (r.entity_label as string) ?? undefined,
    details: (r.details as string) ?? undefined,
    riskLevel: r.risk_level as AuditLog["riskLevel"],
    flagged: r.flagged as boolean,
    flagReason: (r.flag_reason as string) ?? undefined,
    ipAddress: (r.ip_address as string) ?? undefined,
    userAgent: (r.user_agent as string) ?? undefined,
    deviceType: (r.device_type as string) ?? undefined,
    geoCity: (r.geo_city as string) ?? undefined,
    geoRegion: (r.geo_region as string) ?? undefined,
    geoCountry: (r.geo_country as string) ?? undefined,
  };
}

export default function AuditTrailPage() {
  const supabase = useMemo(() => createClient(), []);
  const orgQ = useCollection("organizationSettings");
  const retentionYears = orgQ.data?.[0]?.auditRetentionYears ?? 7;

  const [tab, setTab] = useState<TabKey>("timeline");
  const [search, setSearch] = useState("");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [filterAction, setFilterAction] = useState<ActionType | "all">("all");
  const [filterRisk, setFilterRisk] = useState<RiskLevel | "all">("all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterDevice, setFilterDevice] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Load only a BOUNDED window from the server (default last 30 days) so the
  // table never pulls the whole audit table into the browser. Widening the
  // preset or setting a From/To range re-queries; a 5,000-row cap guards huge
  // windows (surfaced as a truncation notice).
  const LOAD_LIMIT = 5000;
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(false);
    (async () => {
      let query = supabase.from("audit_logs").select("*").order("created_date", { ascending: false }).limit(LOAD_LIMIT);
      const fromISO = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : null;
      const toISO = toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null;
      if (fromISO || toISO) {
        if (fromISO) query = query.gte("created_date", fromISO);
        if (toISO) query = query.lte("created_date", toISO);
      } else if (rangeDays > 0) {
        query = query.gte("created_date", new Date(Date.now() - rangeDays * 86_400_000).toISOString());
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) { setLoadError(true); setLoading(false); return; }
      setTruncated((data?.length ?? 0) >= LOAD_LIMIT);
      setLogs((data ?? []).map(mapAudit));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase, rangeDays, fromDate, toDate, reloadKey]);

  // Distinct users who appear in the loaded window — powers the per-user filter.
  const actors = useMemo(
    () => Array.from(new Set(logs.map((l) => l.actorName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs],
  );

  // Newest first, then apply all active filters.
  // The date window is applied server-side (bounded load); these are the
  // in-memory refinements over that window.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((e) => {
      if (filterUser !== "all" && e.actorName !== filterUser) return false;
      if (filterAction !== "all" && e.action !== filterAction) return false;
      if (filterRisk !== "all" && e.riskLevel !== filterRisk) return false;
      if (filterDevice !== "all" && (e.deviceType ?? "") !== filterDevice) return false;
      if (q) {
        const haystack = [
          e.actorName, e.actorEmail ?? "", e.entityType ?? "", e.entityLabel ?? "",
          e.details ?? "", e.ipAddress ?? "", geoLabel(e), e.deviceType ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, filterAction, filterRisk, filterUser, filterDevice]);

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
      "ipAddress", "location", "deviceType", "userAgent",
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
      e.ipAddress ?? "",
      geoLabel(e),
      e.deviceType ?? "",
      e.userAgent ?? "",
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

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Trail" />
        <ErrorState message="We couldn't load the audit log." onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  const noData = !loading && logs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Per-user access log — page navigation, file/record access, changes to sensitive records, data exports, and sign-in/out events. Search by user, date range, or access type."
        actions={
          <Button variant="outline" onClick={exportCSV} disabled={loading || filtered.length === 0}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        <Shield className="mr-1.5 -mt-0.5 inline size-4" />
        Change entries on sensitive tables are written by database triggers — server-side and append-only, so they
        can&apos;t be edited or removed from the app. Page views and file/record access are logged per user with the
        actor taken from the signed-in session, so entries can&apos;t be spoofed. Entries are retained for{" "}
        <span className="font-medium text-foreground">{retentionYears} years</span>, then automatically purged (configurable in Settings).
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
                <select className="input" value={filterUser} onChange={(e) => setFilterUser(e.target.value)} aria-label="Filter by user">
                  <option value="all">All users</option>
                  {actors.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <select
                  className="input"
                  value={rangeDays}
                  onChange={(e) => setRangeDays(Number(e.target.value))}
                  disabled={!!(fromDate || toDate)}
                  title={fromDate || toDate ? "Using the From/To range instead" : undefined}
                >
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <input type="date" className="input" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input type="date" className="input" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
                  {(fromDate || toDate) && (
                    <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="text-xs text-primary hover:underline">clear</button>
                  )}
                </div>
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
                    <option key={r} value={r} className="capitalize">{humanizeLabel(r)}</option>
                  ))}
                </select>
                <select className="input" value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)} aria-label="Filter by device">
                  <option value="all">All devices</option>
                  {DEVICE_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </CardHeader>

          <CardContent>
            {truncated && (
              <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Showing the most recent {LOAD_LIMIT.toLocaleString()} events in this window — narrow the date range to see older entries.
              </div>
            )}
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
  return <Badge variant={RISK_BADGE[level]} className="capitalize">{humanizeLabel(level)}</Badge>;
}

function TimelineTable({ rows }: { rows: AuditLog[] }) {
  const { sorted, sort, toggle } = useSort(rows, {
    timestamp: (e) => e.createdDate,
    actor: (e) => e.actorName,
    action: (e) => ACTION_LABEL[e.action],
    entity: (e) => e.entityLabel,
    from: (e) => e.ipAddress,
    device: (e) => e.deviceType,
    risk: (e) => RISK_RANK[e.riskLevel],
    flag: (e) => (e.flagged ? 1 : 0),
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm rtable">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <SortHeader label="Timestamp" sortKey="timestamp" sort={sort} onToggle={toggle} />
            <SortHeader label="Actor" sortKey="actor" sort={sort} onToggle={toggle} />
            <SortHeader label="Action" sortKey="action" sort={sort} onToggle={toggle} />
            <SortHeader label="Accessed" sortKey="entity" sort={sort} onToggle={toggle} />
            <SortHeader label="From (IP / location)" sortKey="from" sort={sort} onToggle={toggle} />
            <SortHeader label="Device" sortKey="device" sort={sort} onToggle={toggle} />
            <SortHeader label="Risk" sortKey="risk" sort={sort} onToggle={toggle} />
            <SortHeader label="Flag" sortKey="flag" sort={sort} onToggle={toggle} className="pr-0" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const geo = geoLabel(e);
            return (
            <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
              <td data-label="Timestamp" className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-muted-foreground">{formatTs(e.createdDate)}</td>
              <td data-label="Actor" className="py-2.5 pr-4">
                <div className="font-medium">{e.actorName}</div>
                {e.actorEmail && <div className="text-xs text-muted-foreground">{e.actorEmail}</div>}
              </td>
              <td data-label="Action" className="py-2.5 pr-4"><ActionBadge action={e.action} /></td>
              <td data-label="Accessed" className="py-2.5 pr-4">
                {e.entityType && <div className="text-xs text-muted-foreground">{e.entityType}</div>}
                <div>{e.entityLabel || e.details || "—"}</div>
              </td>
              <td data-label="From" className="py-2.5 pr-4">
                <div className="font-mono text-xs">{e.ipAddress || "—"}</div>
                {geo && <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{geo}</div>}
              </td>
              <td data-label="Device" className="py-2.5 pr-4">
                {e.deviceType ? <span className="inline-flex items-center gap-1 text-xs"><Monitor className="size-3 text-muted-foreground" />{e.deviceType}</span> : <span className="text-muted-foreground">—</span>}
              </td>
              <td data-label="Risk" className="py-2.5 pr-4"><RiskBadge level={e.riskLevel} /></td>
              <td data-label="Flag" className="py-2.5">
                {e.flagged ? (
                  <span className="inline-flex items-center gap-1 text-warning" title={e.flagReason ?? undefined}>
                    <Flag className="size-3.5" />
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FlaggedTable({ rows }: { rows: AuditLog[] }) {
  const { sorted, sort, toggle } = useSort(rows, {
    timestamp: (e) => e.createdDate,
    actor: (e) => e.actorName,
    action: (e) => ACTION_LABEL[e.action],
    entity: (e) => e.entityLabel,
    risk: (e) => RISK_RANK[e.riskLevel],
    reason: (e) => e.flagReason,
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm rtable">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <SortHeader label="Timestamp" sortKey="timestamp" sort={sort} onToggle={toggle} />
            <SortHeader label="Actor" sortKey="actor" sort={sort} onToggle={toggle} />
            <SortHeader label="Action" sortKey="action" sort={sort} onToggle={toggle} />
            <SortHeader label="Entity" sortKey="entity" sort={sort} onToggle={toggle} />
            <SortHeader label="Risk" sortKey="risk" sort={sort} onToggle={toggle} />
            <SortHeader label="Flag reason" sortKey="reason" sort={sort} onToggle={toggle} className="pr-0" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
              <td data-label="Timestamp" className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-muted-foreground">{formatTs(e.createdDate)}</td>
              <td data-label="Actor" className="py-2.5 pr-4">
                <div className="font-medium">{e.actorName}</div>
                {e.actorEmail && <div className="text-xs text-muted-foreground">{e.actorEmail}</div>}
              </td>
              <td data-label="Action" className="py-2.5 pr-4"><ActionBadge action={e.action} /></td>
              <td data-label="Entity" className="py-2.5 pr-4">
                {e.entityType && <div className="text-xs text-muted-foreground">{e.entityType}</div>}
                <div>{e.entityLabel || "—"}</div>
              </td>
              <td data-label="Risk" className="py-2.5 pr-4"><RiskBadge level={e.riskLevel} /></td>
              <td data-label="Flag reason" className="py-2.5 text-warning">{e.flagReason || "Flagged"}</td>
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

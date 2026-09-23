"use client";

import { useMemo, useState } from "react";
import {
  Scale, ExternalLink, ShieldCheck, AlertTriangle, TrendingUp, Search, Info, RefreshCw, Newspaper,
} from "lucide-react";
import { useCollection, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import {
  evaluateObligations, coverageOf, conditionLabel, TOPIC_LABELS,
  type EvaluatedObligation, type OrgFacts,
} from "@/lib/law-engine";
import type { LawAlert, LawObligation } from "@/lib/data/schema";

/**
 * Which employment laws apply to us, at this headcount, in these states — and
 * which switch on as we grow. Every row carries the government source it was
 * written from, so the answer can be traced rather than trusted.
 */

const CONDITION_TOGGLES = [
  { key: "group_health_plan", label: "We sponsor a group health plan" },
  { key: "federal_contractor", label: "We hold a federal contract" },
  { key: "covered_entity", label: "We are a HIPAA covered entity" },
  { key: "osha_partially_exempt_naics", label: "Our NAICS is on OSHA's partial-exemption list" },
] as const;

type ToggleState = Record<string, "yes" | "no" | "unknown">;

export default function EmploymentLawPage() {
  const { profile, user, isAdmin } = useAuth();
  const obligationsQ = useCollection("lawObligations");
  const alertsQ = useCollection("lawAlerts");
  const employeesQ = useCollection("employees");
  const locationsQ = useCollection("locations");

  const obligations = useMemo(() => obligationsQ.data ?? [], [obligationsQ.data]);

  // Headcount defaults to the active employee records, and stays editable so the
  // same page answers "what changes if we hire five more?".
  const countedActive = useMemo(
    () => (employeesQ.data ?? []).filter((e) => e.employmentStatus === "active").length,
    [employeesQ.data],
  );
  const [countOverride, setCountOverride] = useState<string>("");
  const employeeCount = countOverride === "" ? countedActive : Math.max(0, parseInt(countOverride, 10) || 0);

  const states = useMemo(() => {
    const fromLocations = (locationsQ.data ?? [])
      .filter((l) => l.active !== false)
      .map((l) => (l.state ?? "").toUpperCase())
      .filter(Boolean);
    return fromLocations.length > 0 ? Array.from(new Set(fromLocations)) : ["UT"];
  }, [locationsQ.data]);

  const [toggles, setToggles] = useState<ToggleState>({});
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");
  const [showNA, setShowNA] = useState(false);

  const facts: OrgFacts = useMemo(() => ({
    employeeCount,
    states,
    conditionsMet: Object.entries(toggles).filter(([, v]) => v === "yes").map(([k]) => k),
    conditionsNotMet: Object.entries(toggles).filter(([, v]) => v === "no").map(([k]) => k),
  }), [employeeCount, states, toggles]);

  const evaluation = useMemo(() => evaluateObligations(obligations, facts), [obligations, facts]);

  const matches = (e: EvaluatedObligation) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const o = e.obligation;
    return [o.title, o.summary, o.citationLabel, o.authorityBody, TOPIC_LABELS[o.topic]]
      .filter(Boolean)
      .some((v) => (v as string).toLowerCase().includes(q));
  };

  const appliesByTopic = useMemo(() => {
    const map = new Map<string, EvaluatedObligation[]>();
    for (const e of evaluation.applies.filter(matches)) {
      const list = map.get(e.obligation.topic) ?? [];
      list.push(e);
      map.set(e.obligation.topic, list);
    }
    return [...map.entries()].sort((a, b) =>
      (TOPIC_LABELS[a[0]] ?? a[0]).localeCompare(TOPIC_LABELS[b[0]] ?? b[0]));
  }, [evaluation.applies, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = useMemo(() => {
    const rank = { new: 0, reviewed: 1, actioned: 2, dismissed: 3 } as Record<string, number>;
    return [...(alertsQ.data ?? [])].sort((a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      (b.publicationDate ?? "").localeCompare(a.publicationDate ?? ""));
  }, [alertsQ.data]);
  const openAlerts = alerts.filter((a) => a.status === "new");

  /**
   * Ask the server to pull anything the Federal Register has published since our
   * last alert. The route validates the response before storing, so a bad filter
   * surfaces as a warning here rather than as noise in the register.
   */
  async function checkForUpdates() {
    setScanning(true);
    try {
      const res = await fetch("/api/regulatory/scan", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Scan failed");
      const warn = (body.warnings ?? []) as string[];
      toast.success(
        body.inserted > 0
          ? `${body.inserted} new item${body.inserted === 1 ? "" : "s"} since ${body.since}`
          : `Nothing new since ${body.since}`,
      );
      if (warn.length > 0) toast.warning(warn[0]);
      void alertsQ.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reach the Federal Register.");
    } finally {
      setScanning(false);
    }
  }

  if (obligationsQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employment Law" />
        <ErrorState message="We couldn't load the obligation register." onRetry={() => void obligationsQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employment Law"
        description="What applies to us at this headcount and in these states — with the government source behind each one."
      />

      {/* The facts the engine runs on. Editable, because the same panel answers
          "what changes if we grow?" */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Employees</label>
              <input
                type="number"
                min="0"
                className="input w-28"
                value={countOverride === "" ? String(countedActive) : countOverride}
                onChange={(e) => setCountOverride(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {countOverride === ""
                  ? `${countedActive} active employee record${countedActive === 1 ? "" : "s"}`
                  : `Scenario — actual is ${countedActive}`}
                {countOverride !== "" && (
                  <button className="ml-2 underline" onClick={() => setCountOverride("")}>reset</button>
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">States</label>
              <div className="flex gap-1.5 pt-1">
                {states.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
              </div>
              <p className="text-xs text-muted-foreground">From your active locations</p>
            </div>

            <div className="min-w-[260px] flex-1 space-y-1.5">
              <label className="text-sm font-medium">Facts that gate a duty</label>
              <div className="flex flex-wrap gap-2">
                {CONDITION_TOGGLES.map((c) => {
                  const v = toggles[c.key] ?? "unknown";
                  const next = v === "unknown" ? "yes" : v === "yes" ? "no" : "unknown";
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setToggles((p) => ({ ...p, [c.key]: next }))}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        v === "yes" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : v === "no" ? "border-border bg-secondary text-muted-foreground line-through"
                        : "border-dashed border-border text-muted-foreground hover:bg-secondary/40"
                      }`}
                      title="Click to cycle: unknown → yes → no"
                    >
                      {c.label}
                      {v === "unknown" && " · ?"}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Unknown is treated as &ldquo;check this&rdquo; — nothing is dropped on an assumption.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Applies now" value={evaluation.applies.length} icon={Scale} loading={obligationsQ.isLoading} />
        <StatCard label="Confirm a fact" value={evaluation.check.length} icon={AlertTriangle} tone="warning" loading={obligationsQ.isLoading} />
        <StatCard label="As you grow" value={evaluation.upcoming.length} icon={TrendingUp} loading={obligationsQ.isLoading} />
        <StatCard label="Needs source review" value={evaluation.needsReview.length} icon={Info} loading={obligationsQ.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <Newspaper className="size-4 text-muted-foreground" /> Regulatory changes
              </h2>
              <p className="text-sm text-muted-foreground">
                Rules and proposed rules the Federal Register has published against the laws above.
                {openAlerts.length > 0 && ` ${openAlerts.length} awaiting review.`}
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" onClick={checkForUpdates} disabled={scanning}>
                <RefreshCw className={`size-4 ${scanning ? "animate-spin" : ""}`} />
                {scanning ? "Checking…" : "Check for updates"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {alertsQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing filed yet. The weekly check runs on its own; use the button to run it now.
            </p>
          ) : (
            alerts.slice(0, 12).map((a) => (
              <AlertRow key={a.id} alert={a} obligations={obligations} canAct={isAdmin}
                        actorName={profile?.fullName ?? user?.fullName ?? "Admin"} />
            ))
          )}
        </CardContent>
      </Card>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="input w-full pl-9"
          placeholder="Search obligations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {obligationsQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : obligations.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No obligations in the register"
          description="Seed the register to see what applies at your headcount."
        />
      ) : (
        <>
          {/* Confirm-a-fact first: these are the ones that can bite. */}
          {evaluation.check.filter(matches).length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4 text-amber-500" /> Confirm a fact
                </h2>
                <p className="text-sm text-muted-foreground">
                  These hang on something nobody has recorded yet. Set the fact above and they move.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {evaluation.check.filter(matches).map((e) => <ObligationCard key={e.obligation.id} item={e} />)}
              </CardContent>
            </Card>
          )}

          {appliesByTopic.map(([topic, items]) => (
            <Card key={topic}>
              <CardHeader>
                <h2 className="font-semibold">{TOPIC_LABELS[topic] ?? topic}</h2>
                <p className="text-sm text-muted-foreground">{items.length} obligation{items.length === 1 ? "" : "s"} in force</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((e) => <ObligationCard key={e.obligation.id} item={e} />)}
              </CardContent>
            </Card>
          ))}

          {evaluation.milestones.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="flex items-center gap-2 font-semibold">
                  <TrendingUp className="size-4 text-muted-foreground" /> As you grow
                </h2>
                <p className="text-sm text-muted-foreground">
                  Headcounts that change what you owe. Hiring past one of these is a compliance event, not just a payroll one.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {evaluation.milestones.map((m) => (
                  <div key={m.threshold} className="rounded-lg border border-border p-4">
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-semibold tabular-nums">{m.threshold}</span>
                      <span className="text-sm text-muted-foreground">
                        employees — {m.threshold - employeeCount} more than today
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {m.obligations.map((o) => (
                        <li key={o.id} className="text-sm">
                          <span className="font-medium">{o.title}</span>
                          {o.countBasis && <span className="text-muted-foreground"> — {o.countBasis}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {evaluation.notApplicable.length > 0 && (
            <Card>
              <CardHeader>
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setShowNA((v) => !v)}
                >
                  <span className="font-semibold">Ruled out ({evaluation.notApplicable.length})</span>
                  <span className="text-sm text-muted-foreground">{showNA ? "Hide" : "Show"}</span>
                </button>
              </CardHeader>
              {showNA && (
                <CardContent className="space-y-3">
                  {evaluation.notApplicable.map((e) => <ObligationCard key={e.obligation.id} item={e} />)}
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ card -------------------------------- */

function ObligationCard({ item }: { item: EvaluatedObligation }) {
  const o: LawObligation = item.obligation;
  const [openSource, setOpenSource] = useState(false);
  const coverage = coverageOf(o);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{o.title}</h3>
            <Badge variant="outline">{o.jurisdiction === "federal" ? "Federal" : o.jurisdiction}</Badge>
            {o.reviewStatus === "verified" ? (
              <Badge variant="success" className="gap-1"><ShieldCheck className="size-3" /> Source verified</Badge>
            ) : (
              <Badge variant="secondary" title="Written from a known citation, not yet checked against the primary text">
                Needs source review
              </Badge>
            )}
            {item.status === "check" && <Badge variant="warning">Confirm</Badge>}
            {item.status === "not_applicable" && <Badge variant="secondary">Ruled out</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
        </div>
        {o.officialUrl && (
          <a
            href={o.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-primary hover:underline"
          >
            <span className="inline-flex items-center gap-1">
              {o.citationLabel ?? "Official source"} <ExternalLink className="size-3" />
            </span>
          </a>
        )}
      </div>

      {o.summary && <p className="mt-2 text-sm text-muted-foreground">{o.summary}</p>}

      {o.employerDuties.length > 0 && (
        <ul className="mt-2 space-y-1 pl-4">
          {o.employerDuties.map((d, i) => (
            <li key={i} className="list-disc text-sm marker:text-muted-foreground">{d}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {o.countBasis && <span>Counted as: {o.countBasis}</span>}
        {o.deadlineNote && <span className="text-foreground">⏱ {o.deadlineNote}</span>}
        {o.penaltyNote && <span>Penalty: {o.penaltyNote}</span>}
        {item.openConditions.map((c) => (
          <Badge key={c} variant="warning" className="font-normal">{conditionLabel(c)}?</Badge>
        ))}
        {coverage.covered ? (
          coverage.kinds.map((k) => <Badge key={k} variant="outline" className="font-normal">{k} linked</Badge>)
        ) : (
          <Badge variant="secondary" className="font-normal">Nothing linked yet</Badge>
        )}
      </div>

      {o.sourceQuote && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => setOpenSource((v) => !v)}>
            {openSource ? "Hide source text" : "Show source text"}
          </Button>
          {openSource && (
            <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
              &ldquo;{o.sourceQuote}&rdquo;
              {o.authorityBody && <footer className="mt-1 not-italic text-xs">— {o.authorityBody}</footer>}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- alert row ------------------------------ */

function AlertRow({
  alert, obligations, canAct, actorName,
}: {
  alert: LawAlert;
  obligations: LawObligation[];
  canAct: boolean;
  actorName: string;
}) {
  const update = useUpdate("lawAlerts");
  const matched = obligations.find((o) => o.id === alert.matchedObligationId);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: LawAlert["status"]) {
    setBusy(true);
    try {
      await update.mutateAsync({
        id: alert.id,
        patch: { status, reviewedByName: actorName, reviewedAt: new Date().toISOString() },
      });
      toast.success(status === "dismissed" ? "Dismissed" : "Marked reviewed");
    } catch {
      toast.error("Couldn't update this item.");
    } finally {
      setBusy(false);
    }
  }

  const dimmed = alert.status === "dismissed";

  return (
    <div className={`rounded-lg border border-border p-4 ${dimmed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {alert.docType && <Badge variant={alert.docType === "Rule" ? "warning" : "secondary"}>{alert.docType}</Badge>}
            {alert.status === "new" ? <Badge variant="outline">Needs review</Badge>
              : <Badge variant="secondary" className="capitalize">{alert.status}</Badge>}
            {matched && <Badge variant="outline" className="font-normal">{matched.title}</Badge>}
          </div>
          <p className="mt-1 font-medium">{alert.title}</p>
          {alert.abstract && <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{alert.abstract}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {alert.publicationDate && <span>Published {formatDate(alert.publicationDate)}</span>}
            {alert.effectiveDate && <span className="text-foreground">Effective {formatDate(alert.effectiveDate)}</span>}
            {alert.commentsCloseDate && <span>Comments close {formatDate(alert.commentsCloseDate)}</span>}
            {alert.agencies.length > 0 && <span>{alert.agencies.join(", ")}</span>}
            {alert.reviewedByName && alert.status !== "new" && <span>Handled by {alert.reviewedByName}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {alert.htmlUrl && (
            <a href={alert.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              <span className="inline-flex items-center gap-1">Read it <ExternalLink className="size-3" /></span>
            </a>
          )}
          {canAct && alert.status === "new" && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("reviewed")}>Reviewed</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("dismissed")}>Dismiss</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

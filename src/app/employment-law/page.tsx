"use client";

import { useMemo, useState } from "react";
import {
  Scale, ExternalLink, ShieldCheck, AlertTriangle, TrendingUp, Search, Info,
} from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
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
import type { LawObligation } from "@/lib/data/schema";

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
  const obligationsQ = useCollection("lawObligations");
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

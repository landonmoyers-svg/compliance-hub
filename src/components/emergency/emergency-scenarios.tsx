"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles, Wand2, BookText, Plus, X, Save, ChevronRight, FileText,
  CheckCircle2, AlertTriangle, ShieldCheck, CalendarClock,
} from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileLink } from "@/components/shared/file-link";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { formatDate, todayInput, dateInputToISO } from "@/lib/dates";
import {
  scenarioStatuses, emergencyReadiness, relatedSops, EMERGENCY_PLAN_META, suggestedDrillType,
  type ScenarioStatus,
} from "@/lib/emergency";
import { emergencyPlanStatuses, type EmergencyPlan, type EmergencyPlanType, type ComplianceDocument } from "@/lib/data/schema";

/* status → pill styling */
type PillTone = "success" | "warning" | "destructive" | "muted";
function Pill({ label, tone }: { label: string; tone: PillTone }) {
  const cls = tone === "success" ? "bg-success/10 text-success border-success/30"
    : tone === "warning" ? "bg-warning/10 text-warning border-warning/30"
    : tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30"
    : "bg-secondary text-muted-foreground border-border";
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", cls)}>{label}</span>;
}
const planPill = (s: ScenarioStatus) => s.planState === "active" ? { label: "Plan ready", tone: "success" as const }
  : s.planState === "missing" ? { label: "No plan", tone: "destructive" as const }
  : { label: s.planState === "needs_review" ? "Plan: review" : "Plan: draft", tone: "warning" as const };
const sopPill = (s: ScenarioStatus) => s.sopState === "present" ? { label: "SOP on file", tone: "success" as const }
  : s.sopState === "stale" ? { label: "SOP stale", tone: "warning" as const }
  : { label: "No SOP", tone: "destructive" as const };
const testPill = (s: ScenarioStatus) => s.drillState === "recent" ? { label: "Tested", tone: "success" as const }
  : s.drillState === "overdue" ? { label: "Test overdue", tone: "warning" as const }
  : { label: "Untested", tone: "muted" as const };

interface Draft { planType: EmergencyPlanType; title: string; content: string; status: EmergencyPlan["status"]; reviewDate: string; }

function sopContextFor(planType: EmergencyPlanType, docs: ComplianceDocument[], perDoc = 700): string {
  const related = relatedSops(planType, docs);
  if (related.length === 0) return "";
  return related.slice(0, 4).map((d) => `### ${d.title}\n${((d.content ?? d.summary) ?? "").slice(0, perDoc)}`).join("\n\n");
}

export function EmergencyScenarios({ onScheduleDrill }: { onScheduleDrill?: (label: string, drillType: string) => void }) {
  const plansQ = useCollection("emergencyPlans");
  const docsQ = useCollection("documents");
  const drillsQ = useCollection("emergencyDrills");
  const createMut = useCreate("emergencyPlans");
  const updateMut = useUpdate("emergencyPlans");
  const createDoc = useCreate("documents");

  const [editing, setEditing] = useState<{ status: ScenarioStatus; initial: EmergencyPlan | Draft } | null>(null);
  const [buildingAll, setBuildingAll] = useState(false);

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const drills = useMemo(() => drillsQ.data ?? [], [drillsQ.data]);
  const statuses = useMemo(() => scenarioStatuses(plans, docs, drills), [plans, docs, drills]);
  const readiness = useMemo(() => emergencyReadiness(statuses), [statuses]);

  const required = statuses.filter((s) => s.required);
  const optional = statuses.filter((s) => !s.required);

  function open(s: ScenarioStatus) {
    setEditing({ status: s, initial: s.plan ?? { planType: s.planType, title: "", content: "", status: "draft", reviewDate: "" } });
  }
  function openByType(planType: EmergencyPlanType) {
    const s = statuses.find((x) => x.planType === planType);
    if (s) open(s);
  }

  async function buildFromSops() {
    const candidates = statuses.filter((s) => !s.plan && s.sops.length > 0);
    if (candidates.length === 0) { toast.info("No un-built scenario has a matching SOP on file yet."); return; }
    if (!window.confirm(`Analyze your SOPs and build ${candidates.length} plan${candidates.length === 1 ? "" : "s"} from them? Each is saved as a draft to review.`)) return;
    setBuildingAll(true);
    const tId = toast.loading(`Building 0/${candidates.length} from SOPs…`);
    let made = 0;
    try {
      for (const s of candidates) {
        const meta = EMERGENCY_PLAN_META[s.planType];
        try {
          const res = await fetch("/api/ai/emergency-guide", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "draft", planType: s.planType, planLabel: s.label, requiredElements: meta?.requiredElements, citations: meta?.citations, sopContext: sopContextFor(s.planType, docs, 2400), fromSops: true }),
          });
          if (res.status === 429) { toast.error("Daily AI limit reached — stopping.", { id: tId }); break; }
          const d = await res.json() as { title?: string; content?: string };
          if (res.ok && d.content) { await createMut.mutateAsync({ title: d.title ?? `${s.label} Plan`, planType: s.planType, content: d.content, status: "draft", reviewDate: null }); made++; }
        } catch { /* skip */ }
        toast.loading(`Building ${made}/${candidates.length} from SOPs…`, { id: tId });
      }
      toast.success(`Built ${made} plan${made === 1 ? "" : "s"} from your SOPs — review each.`, { id: tId });
      void plansQ.refetch();
    } finally { setBuildingAll(false); }
  }

  if (plansQ.isLoading) return <Skeleton className="h-56 w-full" />;

  const band = readiness.pct >= 85 ? "success" : readiness.pct >= 50 ? "primary" : "warning";

  return (
    <div className="space-y-4">
      {/* Readiness */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="relative flex size-20 shrink-0 items-center justify-center">
                <svg viewBox="0 0 36 36" className="size-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-secondary" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                    className={band === "success" ? "stroke-success" : band === "primary" ? "stroke-primary" : "stroke-warning"}
                    strokeDasharray={`${readiness.pct} 100`} pathLength={100} />
                </svg>
                <div className="absolute text-center">
                  <div className="text-xl font-semibold tabular-nums">{readiness.pct}%</div>
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold">Emergency readiness</div>
                <div className="mt-1 grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Plans <span className="font-medium text-foreground">{readiness.planPct}%</span></span>
                  <span>SOPs <span className="font-medium text-foreground">{readiness.sopPct}%</span></span>
                  <span>Testing <span className="font-medium text-foreground">{readiness.testPct}%</span></span>
                </div>
                <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
                  A written plan, a backing SOP, and a drill in the last year for every required scenario.
                </p>
              </div>
            </div>

            {readiness.gaps.length > 0 && (
              <div className="flex-1 sm:border-l sm:border-border sm:pl-4">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Close these next</div>
                <div className="flex flex-wrap gap-1.5">
                  {readiness.gaps.slice(0, 5).map((g) => (
                    <button key={g.planType + g.need} onClick={() => openByType(g.planType)}
                      className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/5 px-2 py-0.5 text-xs text-warning hover:bg-warning/10">
                      <AlertTriangle className="size-3" /> {g.label}: {g.need}
                    </button>
                  ))}
                  {readiness.gaps.length > 5 && <span className="self-center text-xs text-muted-foreground">+{readiness.gaps.length - 5} more</span>}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Scenario list */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">Emergency scenarios</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={buildingAll} onClick={() => void buildFromSops()}>
                <BookText className="size-4" /> {buildingAll ? "Building…" : "Build from SOPs"}
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border/60">
            {[...required, ...optional].map((s) => (
              <button key={s.planType} onClick={() => open(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.label}</span>
                    {!s.required && <Badge variant="secondary">Optional</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{s.plan?.title ?? s.why}</div>
                </div>
                <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  <Pill {...planPill(s)} />
                  <Pill {...sopPill(s)} />
                  <Pill {...testPill(s)} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {editing && (
        <ScenarioWorkspace
          status={editing.status}
          initial={editing.initial}
          docs={docs}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void plansQ.refetch(); }}
          onScheduleDrill={onScheduleDrill}
          onSopCreated={() => void docsQ.refetch()}
          createMut={createMut}
          updateMut={updateMut}
          createDoc={createDoc}
        />
      )}
    </div>
  );
}

function isExisting(p: EmergencyPlan | Draft): p is EmergencyPlan { return "id" in p; }

function ScenarioWorkspace({ status, initial, docs, onClose, onSaved, onScheduleDrill, onSopCreated, createMut, updateMut, createDoc }: {
  status: ScenarioStatus;
  initial: EmergencyPlan | Draft;
  docs: ComplianceDocument[];
  onClose: () => void;
  onSaved: () => void;
  onScheduleDrill?: (label: string, drillType: string) => void;
  onSopCreated: () => void;
  createMut: ReturnType<typeof useCreate<"emergencyPlans">>;
  updateMut: ReturnType<typeof useUpdate<"emergencyPlans">>;
  createDoc: ReturnType<typeof useCreate<"documents">>;
}) {
  const existing = isExisting(initial);
  const planType = status.planType;
  const meta = EMERGENCY_PLAN_META[planType];
  const [title, setTitle] = useState(initial.title || `${status.label} Emergency Response Plan`);
  const [content, setContent] = useState(initial.content ?? "");
  const [planStatus, setPlanStatus] = useState<EmergencyPlan["status"]>(initial.status ?? "draft");
  const [reviewDate, setReviewDate] = useState((existing ? initial.reviewDate : (initial as Draft).reviewDate) ?? "");
  const [saving, setSaving] = useState(false);
  const [busyAi, setBusyAi] = useState<"draft" | "sops" | "review" | null>(null);
  const [creatingSop, setCreatingSop] = useState(false);
  const [review, setReview] = useState<{ completeness?: number; summary?: string; gaps?: string[]; suggestions?: string[] } | null>(null);

  const related = relatedSops(planType, docs);

  async function aiDraft(fromSops: boolean) {
    setBusyAi(fromSops ? "sops" : "draft");
    const tId = toast.loading(fromSops ? "Building from your SOPs…" : "Drafting the plan…");
    try {
      const res = await fetch("/api/ai/emergency-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "draft", planType, planLabel: status.label, requiredElements: meta?.requiredElements, citations: meta?.citations, sopContext: sopContextFor(planType, docs, fromSops ? 2400 : 700), fromSops }) });
      const d = await res.json() as { title?: string; content?: string; error?: string };
      if (!res.ok || !d.content) { toast.error(d.error ?? "Draft failed.", { id: tId }); return; }
      setContent(d.content);
      if (!title.trim() && d.title) setTitle(d.title);
      toast.success("Draft inserted — review and save.", { id: tId });
    } catch { toast.error("Couldn't reach Sage.", { id: tId }); }
    finally { setBusyAi(null); }
  }

  async function aiReview() {
    if (!content.trim()) { toast.error("Add or draft plan content first."); return; }
    setBusyAi("review");
    const tId = toast.loading("Reviewing the plan…");
    try {
      const res = await fetch("/api/ai/emergency-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "review", planType, planLabel: status.label, content }) });
      const d = await res.json() as { completeness?: number; summary?: string; gaps?: string[]; suggestions?: string[]; error?: string };
      if (!res.ok) { toast.error(d.error ?? "Review failed.", { id: tId }); return; }
      setReview(d); toast.success("Review complete.", { id: tId });
    } catch { toast.error("Couldn't reach Sage.", { id: tId }); }
    finally { setBusyAi(null); }
  }

  async function createSop() {
    setCreatingSop(true);
    const name = `${status.label} Policy`;
    const tId = toast.loading(`Writing "${name}"…`);
    try {
      const res = await fetch("/api/ai/draft-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: name, documentType: "policy", complianceArea: "emergency", spec: `Behavioral-health practice policy for ${status.label}. Cover the applicable rule (${meta?.citations.join("; ")}) and the practice's procedures.`, pageTitle: "Emergency Preparedness" }) });
      const g = await res.json() as { title?: string; content?: string; error?: string };
      if (!res.ok || !g.content) { toast.error(g.error ?? "Couldn't write the SOP.", { id: tId }); return; }
      await createDoc.mutateAsync({ title: g.title || name, documentType: "policy", complianceArea: "emergency", content: g.content, status: "draft", accessLevel: "all_staff", version: "1.0", requiresAcknowledgment: false });
      toast.success("SOP drafted and saved to the SOP Library.", { id: tId });
      onSopCreated();
    } catch { toast.error("Couldn't write the SOP.", { id: tId }); }
    finally { setCreatingSop(false); }
  }

  async function save() {
    if (!title.trim()) { toast.error("Give the plan a title."); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), planType, content: content || null, status: planStatus,
        reviewDate: reviewDate ? dateInputToISO(reviewDate) : null,
        ...(planStatus === "active" ? { lastReviewedDate: todayInput() } : {}),
      };
      if (existing) await updateMut.mutateAsync({ id: (initial as EmergencyPlan).id, patch: payload });
      else await createMut.mutateAsync(payload);
      toast.success(existing ? "Plan saved" : "Plan created");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the plan."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="font-semibold">{status.label}</h2>
            <p className="text-xs text-muted-foreground">Response plan · backing SOP · testing — everything for this scenario</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[1fr_260px]">
          {/* Plan editor */}
          <div className="flex flex-col overflow-y-auto p-5">
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select className="input w-full" value={planStatus} onChange={(e) => setPlanStatus(e.target.value as EmergencyPlan["status"])}>
                  {emergencyPlanStatuses.map((s) => <option key={s} value={s}>{s === "needs_review" ? "Needs review" : s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground">Plan — procedures & step-by-step response algorithm</label>
              <div className="flex flex-wrap gap-1">
                {related.length > 0 && (
                  <Button size="sm" variant="outline" disabled={busyAi !== null} onClick={() => void aiDraft(true)} title={`Build from ${related.length} matching SOP${related.length === 1 ? "" : "s"}`}><BookText className="size-3.5" /> {busyAi === "sops" ? "Building…" : "From SOPs"}</Button>
                )}
                <Button size="sm" variant="outline" disabled={busyAi !== null} onClick={() => void aiDraft(false)}><Wand2 className="size-3.5" /> {busyAi === "draft" ? "Drafting…" : content ? "Redraft" : "Draft"}</Button>
                <Button size="sm" variant="outline" disabled={busyAi !== null} onClick={() => void aiReview()}><Sparkles className="size-3.5" /> {busyAi === "review" ? "Reviewing…" : "Review"}</Button>
              </div>
            </div>
            <textarea className="input min-h-[280px] w-full flex-1 font-mono text-xs leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write the plan here, or use Draft / From SOPs to start with AI…" />

            {review && (
              <div className="mt-3 rounded-lg border border-border bg-secondary/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Sage review{review.completeness != null ? ` · ${review.completeness}% complete` : ""}</div>
                {review.summary && <p className="mt-1 text-muted-foreground">{review.summary}</p>}
                {review.gaps && review.gaps.length > 0 && <div className="mt-2"><div className="text-xs font-semibold text-warning">Gaps</div><ul className="ml-4 list-disc text-xs text-muted-foreground">{review.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
                {review.suggestions && review.suggestions.length > 0 && <div className="mt-2"><div className="text-xs font-semibold text-primary">Suggestions</div><ul className="ml-4 list-disc text-xs text-muted-foreground">{review.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
              </div>
            )}

            <div className="mt-3">
              <label className="text-xs font-medium text-muted-foreground">Next review date</label>
              <input type="date" className="input w-48" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </div>
          </div>

          {/* Sidebar: rules, SOPs, testing */}
          <div className="space-y-4 overflow-y-auto border-t border-border p-4 md:border-l md:border-t-0">
            {meta && (meta.citations.length > 0 || meta.requiredElements.length > 0) && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShieldCheck className="size-3.5" /> Rules & requirements</div>
                {meta.citations.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">{meta.citations.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}</div>}
                {meta.requiredElements.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {meta.requiredElements.map((e) => <li key={e} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" /> {e}</li>)}
                  </ul>
                )}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><FileText className="size-3.5" /> Backing SOP</div>
              {related.length > 0 ? (
                <ul className="space-y-1">
                  {related.map((d) => (
                    <li key={d.id} className="flex items-center gap-1.5 text-xs">
                      <Link href="/sop-library" className="truncate text-primary hover:underline">{d.title}</Link>
                      {d.fileUrl && <FileLink path={d.fileUrl} iconOnly label="Open" className="text-muted-foreground hover:text-primary" />}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">No matching SOP on file.</p>
                  <Button size="sm" variant="outline" disabled={creatingSop} onClick={() => void createSop()}><Wand2 className="size-3.5" /> {creatingSop ? "Writing…" : "Create SOP"}</Button>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarClock className="size-3.5" /> Testing</div>
              <p className="text-xs text-muted-foreground">
                {status.lastDrill ? <>Last drilled {formatDate(status.lastDrill.date)}{status.drillState === "overdue" ? " — overdue (>1yr)" : ""}.</> : "Never drilled."}
              </p>
              {onScheduleDrill && (
                <Button size="sm" variant="ghost" className="mt-1 px-0 text-primary" onClick={() => onScheduleDrill(status.label, suggestedDrillType(planType))}>
                  <Plus className="size-3.5" /> Schedule a drill
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}><Save className="size-4" /> {saving ? "Saving…" : "Save plan"}</Button>
        </div>
      </div>
    </div>
  );
}

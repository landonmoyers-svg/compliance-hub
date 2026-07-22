"use client";

import { useMemo, useState } from "react";
import { Sparkles, Plus, AlertTriangle, CheckCircle2, Circle, Wand2, X, Save, ChevronRight, FileText, BookText } from "lucide-react";
import Link from "next/link";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileLink } from "@/components/shared/file-link";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { todayInput, dateInputToISO } from "@/lib/dates";
import {
  planCoverage, coverageSummary, EMERGENCY_PLAN_META, relatedSops, emergencySopGaps,
  type PlanCoverage, type PlanCoverageState, type SopState,
} from "@/lib/emergency";
import { emergencyPlanTypes, emergencyPlanStatuses, type EmergencyPlan, type EmergencyPlanType, type ComplianceDocument } from "@/lib/data/schema";

const STATE_BADGE: Record<PlanCoverageState, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  active: { label: "Ready", variant: "success" },
  draft: { label: "Draft", variant: "secondary" },
  needs_review: { label: "Needs review", variant: "warning" },
  missing: { label: "Missing", variant: "destructive" },
};
const SOP_BADGE: Record<SopState, { label: string; variant: "success" | "warning" | "destructive" }> = {
  present: { label: "On file", variant: "success" },
  stale: { label: "Past review", variant: "warning" },
  missing: { label: "Missing", variant: "destructive" },
};

interface Draft { planType: EmergencyPlanType; title: string; content: string; status: EmergencyPlan["status"]; reviewDate: string; }

/** Gather related-SOP context to ground an AI draft in the practice's own policies. */
function sopContextFor(planType: EmergencyPlanType, docs: ComplianceDocument[]): string {
  const related = relatedSops(planType, docs);
  if (related.length === 0) return "";
  return related.slice(0, 4).map((d) => `- ${d.title}: ${((d.content ?? d.summary) ?? "").slice(0, 700)}`).join("\n");
}

export function EmergencyPlansSection() {
  const plansQ = useCollection("emergencyPlans");
  const docsQ = useCollection("documents");
  const createMut = useCreate("emergencyPlans");
  const updateMut = useUpdate("emergencyPlans");
  const createDoc = useCreate("documents");

  const [editing, setEditing] = useState<EmergencyPlan | Draft | null>(null);
  const [draftingType, setDraftingType] = useState<string | null>(null);
  const [openType, setOpenType] = useState<Set<string>>(new Set());
  const [creatingSop, setCreatingSop] = useState<string | null>(null);

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const coverage = useMemo(() => planCoverage(plans), [plans]);
  const summary = useMemo(() => coverageSummary(coverage), [coverage]);
  const sopGaps = useMemo(() => emergencySopGaps(docs), [docs]);

  const toggle = (k: string) => setOpenType((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function draftFor(cov: PlanCoverage) {
    setDraftingType(cov.planType);
    const tId = toast.loading(`Drafting a ${cov.label} plan…`);
    try {
      const meta = EMERGENCY_PLAN_META[cov.planType];
      const res = await fetch("/api/ai/emergency-guide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "draft", planType: cov.planType, planLabel: cov.label, requiredElements: meta?.requiredElements, citations: meta?.citations, sopContext: sopContextFor(cov.planType, docs) }),
      });
      const d = await res.json() as { title?: string; content?: string; error?: string };
      if (!res.ok || !d.content) { toast.error(d.error ?? "Couldn't draft the plan.", { id: tId }); return; }
      toast.success("Draft ready — review and save.", { id: tId });
      setEditing({ planType: cov.planType, title: d.title ?? `${cov.label} Plan`, content: d.content, status: "draft", reviewDate: "" });
    } catch { toast.error("Couldn't reach the planner.", { id: tId }); }
    finally { setDraftingType(null); }
  }

  /** Draft an emergency SOP (policy) and save it to the SOP Library. */
  async function createSop(name: string, citation: string) {
    setCreatingSop(name);
    const tId = toast.loading(`Writing "${name}"…`);
    try {
      const res = await fetch("/api/ai/draft-document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name, documentType: "policy", complianceArea: "emergency", spec: `Behavioral-health practice policy. Cover the applicable rule (${citation}) and the practice's procedures.`, pageTitle: "Emergency Preparedness" }),
      });
      const g = await res.json() as { title?: string; content?: string; error?: string };
      if (!res.ok || !g.content) { toast.error(g.error ?? "Couldn't write the SOP.", { id: tId }); return; }
      await createDoc.mutateAsync({ title: g.title || name, documentType: "policy", complianceArea: "emergency", content: g.content, status: "draft", accessLevel: "all_staff", version: "1.0", requiresAcknowledgment: false });
      toast.success("SOP drafted and saved to the SOP Library.", { id: tId });
      void docsQ.refetch();
    } catch { toast.error("Couldn't write the SOP.", { id: tId }); }
    finally { setCreatingSop(null); }
  }

  if (plansQ.isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4 text-primary" /> Emergency plans — AI guide</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Each required scenario shows the rule behind it and what a complete plan must cover. Draft or write plans (with or without AI), and the guide flags which underlying SOPs are missing or overdue.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditing({ planType: "other", title: "", content: "", status: "draft", reviewDate: "" })}>
            <Plus className="size-4" /> New plan
          </Button>
        </div>

        {/* Coverage summary */}
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Required-plan coverage</span>
            <span className="tabular-nums text-muted-foreground">{summary.ready}/{summary.total} ready{summary.missing > 0 ? ` · ${summary.missing} missing` : ""}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full transition-all", summary.pct >= 80 ? "bg-success" : summary.pct >= 40 ? "bg-primary" : "bg-warning")} style={{ width: `${summary.pct}%` }} />
          </div>
        </div>

        {/* Plan checklist — each row expands to show the rules & requirements */}
        <div className="divide-y divide-border/50">
          {coverage.map((cov) => {
            const badge = STATE_BADGE[cov.state];
            const Icon = cov.state === "active" ? CheckCircle2 : cov.state === "missing" ? Circle : AlertTriangle;
            const meta = EMERGENCY_PLAN_META[cov.planType];
            const isOpen = openType.has(cov.planType);
            const related = relatedSops(cov.planType, docs);
            return (
              <div key={cov.planType} className="py-1">
                <div className="flex items-center gap-2 py-1.5">
                  <button type="button" onClick={() => toggle(cov.planType)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    <Icon className={cn("size-4 shrink-0", cov.state === "active" ? "text-success" : cov.state === "missing" ? "text-muted-foreground" : "text-warning")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{cov.label}</span>
                        {!cov.required && <Badge variant="secondary">Optional</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{cov.plan?.title ?? cov.why}</p>
                    </div>
                  </button>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {cov.plan ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(cov.plan!)}>Open</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={draftingType === cov.planType} onClick={() => void draftFor(cov)}>
                      <Wand2 className="size-3.5" /> {draftingType === cov.planType ? "Drafting…" : "Draft with AI"}
                    </Button>
                  )}
                </div>

                {isOpen && (
                  <div className="ml-6 space-y-3 border-l border-border/60 pl-4 pb-3 text-sm">
                    {meta?.citations.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground">Rules</div>
                        <div className="mt-0.5 flex flex-wrap gap-1.5">{meta.citations.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}</div>
                      </div>
                    )}
                    {meta?.requiredElements.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground">A complete plan must cover</div>
                        <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                          {meta.requiredElements.map((e) => <li key={e} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" /> {e}</li>)}
                        </ul>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Related SOPs {related.length > 0 ? `(${related.length})` : ""}</div>
                      {related.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {related.map((d) => (
                            <li key={d.id} className="flex items-center gap-1.5 text-xs">
                              <FileText className="size-3 shrink-0 text-muted-foreground" />
                              <Link href="/sop-library" className="text-primary hover:underline">{d.title}</Link>
                              {d.fileUrl && <FileLink path={d.fileUrl} iconOnly label="Open file" className="text-muted-foreground hover:text-primary" />}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">No matching SOP on file — the guide can draft one below, and AI drafts pull in any related SOP content.</p>
                      )}
                    </div>
                    {cov.plan && <Button size="sm" variant="ghost" onClick={() => setEditing(cov.plan!)}>Open plan →</Button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Required emergency SOPs — what policy documents should back the plans */}
        <div className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <BookText className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Required emergency SOPs</span>
            <span className="text-xs text-muted-foreground">policies that should back these plans</span>
          </div>
          <div className="divide-y divide-border/50">
            {sopGaps.map(({ sop, state, doc }) => {
              const b = SOP_BADGE[state];
              return (
                <div key={sop.key} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{doc?.title ?? sop.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{sop.citation}</div>
                  </div>
                  <Badge variant={b.variant}>{b.label}</Badge>
                  {state === "missing" ? (
                    <Button size="sm" variant="outline" disabled={creatingSop === sop.name} onClick={() => void createSop(sop.name, sop.citation)}>
                      <Wand2 className="size-3.5" /> {creatingSop === sop.name ? "Writing…" : "Create SOP"}
                    </Button>
                  ) : (
                    <Link href="/sop-library"><Button size="sm" variant="ghost">{state === "stale" ? "Update" : "Open"}</Button></Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      {editing && (
        <PlanEditor
          initial={editing}
          docs={docs}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void plansQ.refetch(); }}
          createMut={createMut}
          updateMut={updateMut}
        />
      )}
    </Card>
  );
}

function isExisting(p: EmergencyPlan | Draft): p is EmergencyPlan {
  return "id" in p;
}

function PlanEditor({ initial, docs, onClose, onSaved, createMut, updateMut }: {
  initial: EmergencyPlan | Draft;
  docs: ComplianceDocument[];
  onClose: () => void;
  onSaved: () => void;
  createMut: ReturnType<typeof useCreate<"emergencyPlans">>;
  updateMut: ReturnType<typeof useUpdate<"emergencyPlans">>;
}) {
  const existing = isExisting(initial);
  const [title, setTitle] = useState(initial.title);
  const [planType, setPlanType] = useState<EmergencyPlanType>(initial.planType);
  const [content, setContent] = useState(initial.content ?? "");
  const [status, setStatus] = useState<EmergencyPlan["status"]>(initial.status ?? "draft");
  const [reviewDate, setReviewDate] = useState((existing ? initial.reviewDate : (initial as Draft).reviewDate) ?? "");
  const [saving, setSaving] = useState(false);
  const [busyAi, setBusyAi] = useState<"draft" | "review" | null>(null);
  const [review, setReview] = useState<{ completeness?: number; summary?: string; gaps?: string[]; suggestions?: string[] } | null>(null);

  const meta = EMERGENCY_PLAN_META[planType];
  const label = meta?.label ?? planType;

  async function aiDraft() {
    setBusyAi("draft");
    const tId = toast.loading("Drafting the plan…");
    try {
      const res = await fetch("/api/ai/emergency-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "draft", planType, planLabel: label, requiredElements: meta?.requiredElements, citations: meta?.citations, sopContext: sopContextFor(planType, docs) }) });
      const d = await res.json() as { title?: string; content?: string; error?: string };
      if (!res.ok || !d.content) { toast.error(d.error ?? "Draft failed.", { id: tId }); return; }
      setContent(d.content);
      if (!title.trim() && d.title) setTitle(d.title);
      toast.success("Draft inserted — review and save.", { id: tId });
    } catch { toast.error("Couldn't reach the planner.", { id: tId }); }
    finally { setBusyAi(null); }
  }

  async function aiReview() {
    if (!content.trim()) { toast.error("Add or draft plan content first."); return; }
    setBusyAi("review");
    const tId = toast.loading("Reviewing the plan…");
    try {
      const res = await fetch("/api/ai/emergency-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "review", planType, planLabel: label, content }) });
      const d = await res.json() as { completeness?: number; summary?: string; gaps?: string[]; suggestions?: string[]; error?: string };
      if (!res.ok) { toast.error(d.error ?? "Review failed.", { id: tId }); return; }
      setReview(d);
      toast.success("Review complete.", { id: tId });
    } catch { toast.error("Couldn't reach the reviewer.", { id: tId }); }
    finally { setBusyAi(null); }
  }

  async function save() {
    if (!title.trim()) { toast.error("Give the plan a title."); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), planType, content: content || null, status,
        reviewDate: reviewDate ? dateInputToISO(reviewDate) : null,
        ...(status === "active" ? { lastReviewedDate: todayInput() } : {}),
      };
      if (existing) await updateMut.mutateAsync({ id: (initial as EmergencyPlan).id, patch: payload });
      else await createMut.mutateAsync(payload);
      toast.success(existing ? "Plan saved" : "Plan created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the plan.");
    } finally { setSaving(false); }
  }

  const related = relatedSops(planType, docs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">{existing ? "Emergency plan" : "New emergency plan"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Scenario</label>
              <select className="input w-full" value={planType} onChange={(e) => setPlanType(e.target.value as EmergencyPlanType)}>
                {emergencyPlanTypes.map((t) => <option key={t} value={t}>{EMERGENCY_PLAN_META[t]?.label ?? t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as EmergencyPlan["status"])}>
                {emergencyPlanStatuses.map((s) => <option key={s} value={s}>{s === "needs_review" ? "Needs review" : s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Rules & requirements reference for the selected scenario */}
          {(meta?.citations.length > 0 || meta?.requiredElements.length > 0) && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs">
              {meta.citations.length > 0 && <div className="mb-1.5"><span className="font-semibold text-muted-foreground">Rules: </span>{meta.citations.join(" · ")}</div>}
              {meta.requiredElements.length > 0 && (
                <div>
                  <span className="font-semibold text-muted-foreground">Must cover: </span>
                  <span className="text-muted-foreground">{meta.requiredElements.join(" · ")}</span>
                </div>
              )}
              {related.length > 0 && (
                <div className="mt-1.5"><span className="font-semibold text-muted-foreground">Related SOPs pulled in: </span><span className="text-muted-foreground">{related.slice(0, 4).map((d) => d.title).join(", ")}</span></div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${label} Emergency Response Plan`} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Plan (markdown — includes the step-by-step response algorithm)</label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={busyAi !== null} onClick={() => void aiDraft()}><Wand2 className="size-3.5" /> {busyAi === "draft" ? "Drafting…" : content ? "Redraft" : "Draft with AI"}</Button>
                <Button size="sm" variant="outline" disabled={busyAi !== null} onClick={() => void aiReview()}><Sparkles className="size-3.5" /> {busyAi === "review" ? "Reviewing…" : "Review with AI"}</Button>
              </div>
            </div>
            <textarea className="input min-h-[280px] w-full font-mono text-xs leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Draft with AI, or write the plan here…" />
          </div>

          {review && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> AI review{review.completeness != null ? ` · ${review.completeness}% complete` : ""}</div>
              {review.summary && <p className="mt-1 text-muted-foreground">{review.summary}</p>}
              {review.gaps && review.gaps.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-warning">Gaps</div>
                  <ul className="ml-4 list-disc text-xs text-muted-foreground">{review.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                </div>
              )}
              {review.suggestions && review.suggestions.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-primary">Suggestions</div>
                  <ul className="ml-4 list-disc text-xs text-muted-foreground">{review.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Next review date</label>
              <input type="date" className="input w-full" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </div>
            {existing && (initial as EmergencyPlan).fileUrl && (
              <div className="flex items-end"><FileLink path={(initial as EmergencyPlan).fileUrl!} label="Attached file" className="text-primary hover:underline" /></div>
            )}
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

"use client";

import { useMemo, useState } from "react";
import { Sparkles, Plus, AlertTriangle, CheckCircle2, Circle, Wand2, X, Save } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileLink } from "@/components/shared/file-link";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { formatDate, todayInput, dateInputToISO } from "@/lib/dates";
import { planCoverage, coverageSummary, EMERGENCY_PLAN_META, type PlanCoverage, type PlanCoverageState } from "@/lib/emergency";
import { emergencyPlanTypes, emergencyPlanStatuses, type EmergencyPlan, type EmergencyPlanType } from "@/lib/data/schema";

const STATE_BADGE: Record<PlanCoverageState, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  active: { label: "Ready", variant: "success" },
  draft: { label: "Draft", variant: "secondary" },
  needs_review: { label: "Needs review", variant: "warning" },
  missing: { label: "Missing", variant: "destructive" },
};

interface Draft { planType: EmergencyPlanType; title: string; content: string; status: EmergencyPlan["status"]; reviewDate: string; }

export function EmergencyPlansSection() {
  const plansQ = useCollection("emergencyPlans");
  const createMut = useCreate("emergencyPlans");
  const updateMut = useUpdate("emergencyPlans");

  const [editing, setEditing] = useState<EmergencyPlan | Draft | null>(null);
  const [draftingType, setDraftingType] = useState<string | null>(null);

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const coverage = useMemo(() => planCoverage(plans), [plans]);
  const summary = useMemo(() => coverageSummary(coverage), [coverage]);

  /** AI-draft a plan for a missing scenario, then open the editor to review/save. */
  async function draftFor(cov: PlanCoverage) {
    setDraftingType(cov.planType);
    const tId = toast.loading(`Drafting a ${cov.label} plan…`);
    try {
      const res = await fetch("/api/ai/emergency-guide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "draft", planType: cov.planType, planLabel: cov.label }),
      });
      const d = await res.json() as { title?: string; content?: string; error?: string };
      if (!res.ok || !d.content) { toast.error(d.error ?? "Couldn't draft the plan.", { id: tId }); return; }
      toast.success("Draft ready — review and save.", { id: tId });
      setEditing({ planType: cov.planType, title: d.title ?? `${cov.label} Plan`, content: d.content, status: "draft", reviewDate: "" });
    } catch {
      toast.error("Couldn't reach the planner.", { id: tId });
    } finally {
      setDraftingType(null);
    }
  }

  if (plansQ.isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4 text-primary" /> Emergency plans — AI guide</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every required scenario should have a written plan with a step-by-step response algorithm. The guide shows what&apos;s covered, drafts missing plans, and reviews existing ones for gaps.
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

        {/* Gap checklist */}
        <div className="divide-y divide-border/50">
          {coverage.map((cov) => {
            const badge = STATE_BADGE[cov.state];
            const Icon = cov.state === "active" ? CheckCircle2 : cov.state === "missing" ? Circle : AlertTriangle;
            return (
              <div key={cov.planType} className="flex items-center gap-3 py-2.5">
                <Icon className={cn("size-4 shrink-0", cov.state === "active" ? "text-success" : cov.state === "missing" ? "text-muted-foreground" : "text-warning")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{cov.label}</span>
                    {!cov.required && <Badge variant="secondary">Optional</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{cov.plan?.title ?? cov.why}</p>
                </div>
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {cov.plan ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(cov.plan!)}>Open</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={draftingType === cov.planType} onClick={() => void draftFor(cov)}>
                    <Wand2 className="size-3.5" /> {draftingType === cov.planType ? "Drafting…" : "Draft with AI"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Any extra/custom plans not in the required set already show above via coverage. */}
        {plans.some((p) => p.fileUrl) && (
          <div className="text-xs text-muted-foreground">Plans with an attached file show a document link in the editor.</div>
        )}
      </CardContent>

      {editing && (
        <PlanEditor
          initial={editing}
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

function PlanEditor({ initial, onClose, onSaved, createMut, updateMut }: {
  initial: EmergencyPlan | Draft;
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

  const label = EMERGENCY_PLAN_META[planType]?.label ?? planType;

  async function aiDraft() {
    setBusyAi("draft");
    const tId = toast.loading("Drafting the plan…");
    try {
      const res = await fetch("/api/ai/emergency-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "draft", planType, planLabel: label }) });
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

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">{existing ? "" : "Saving files to Emergency Preparedness."}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}><Save className="size-4" /> {saving ? "Saving…" : "Save plan"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { ShieldAlert, Plus, X, Sparkles, Clock } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { PageTabs, INCIDENT_TABS } from "@/components/shared/page-tabs";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, dateInputToISO, parseDate, daysUntil } from "@/lib/dates";
import type { BreachAssessment } from "@/lib/data/schema";
import { toast } from "sonner";

type Rating = "low" | "medium" | "high";
const DET_LABEL: Record<string, string> = { not_a_breach: "Not a breach", low_probability: "Low probability — not reportable", reportable_breach: "Reportable breach", undetermined: "Undetermined" };
const DET_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = { not_a_breach: "success", low_probability: "warning", reportable_breach: "destructive", undetermined: "secondary" };

const FACTORS = [
  { key: "factor1", nature: "factor1Nature", rating: "factor1Rating", label: "1. Nature & extent of the PHI", hint: "Identifiers involved, likelihood of re-identification, clinical sensitivity." },
  { key: "factor2", nature: "factor2Recipient", rating: "factor2Rating", label: "2. Unauthorized recipient", hint: "Who used/received it — HIPAA-bound entity vs. the public." },
  { key: "factor3", nature: "factor3Acquired", rating: "factor3Rating", label: "3. Was the PHI actually acquired or viewed?", hint: "Actual access vs. mere opportunity." },
  { key: "factor4", nature: "factor4Mitigation", rating: "factor4Rating", label: "4. Extent risk was mitigated", hint: "Recovered, destroyed, recipient attestation, etc." },
] as const;

/** Notification deadline = discovery date + 60 calendar days (45 CFR 164.404). */
function deadlineFor(discoveredDate?: string | null): Date | null {
  const d = parseDate(discoveredDate);
  if (!d) return null;
  return new Date(d.getTime() + 60 * 24 * 60 * 60 * 1000);
}

interface Form {
  title: string; discoveredDate: string; description: string;
  factor1Nature: string; factor1Rating: Rating;
  factor2Recipient: string; factor2Rating: Rating;
  factor3Acquired: string; factor3Rating: Rating;
  factor4Mitigation: string; factor4Rating: Rating;
  probability: Rating;
  determination: BreachAssessment["determination"];
  notes: string;
  status: BreachAssessment["status"];
}

function emptyForm(): Form {
  return { title: "", discoveredDate: "", description: "", factor1Nature: "", factor1Rating: "medium", factor2Recipient: "", factor2Rating: "medium", factor3Acquired: "", factor3Rating: "medium", factor4Mitigation: "", factor4Rating: "medium", probability: "medium", determination: "undetermined", notes: "", status: "draft" };
}

function AssessmentDialog({ initial, onClose, onSave, saving }: {
  initial?: BreachAssessment; onClose: () => void; onSave: (f: Form) => void; saving: boolean;
}) {
  const [form, setForm] = useState<Form>(initial ? {
    title: initial.title, discoveredDate: initial.discoveredDate?.slice(0, 10) ?? "", description: initial.description ?? "",
    factor1Nature: initial.factor1Nature ?? "", factor1Rating: initial.factor1Rating,
    factor2Recipient: initial.factor2Recipient ?? "", factor2Rating: initial.factor2Rating,
    factor3Acquired: initial.factor3Acquired ?? "", factor3Rating: initial.factor3Rating,
    factor4Mitigation: initial.factor4Mitigation ?? "", factor4Rating: initial.factor4Rating,
    probability: initial.probability, determination: initial.determination, notes: initial.notes ?? "", status: initial.status,
  } : emptyForm());
  const [analyzing, setAnalyzing] = useState(false);

  const upd = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  async function draftWithAI() {
    if (!form.description.trim() && !form.title.trim()) { toast.error("Add a description first."); return; }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/breach-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description, discoveredDate: form.discoveredDate }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json() as { factor1: { analysis: string; rating: Rating }; factor2: { analysis: string; rating: Rating }; factor3: { analysis: string; rating: Rating }; factor4: { analysis: string; rating: Rating }; probability: Rating; determination: BreachAssessment["determination"]; rationale: string };
      upd({
        factor1Nature: r.factor1.analysis, factor1Rating: r.factor1.rating,
        factor2Recipient: r.factor2.analysis, factor2Rating: r.factor2.rating,
        factor3Acquired: r.factor3.analysis, factor3Rating: r.factor3.rating,
        factor4Mitigation: r.factor4.analysis, factor4Rating: r.factor4.rating,
        probability: r.probability, determination: r.determination,
        notes: form.notes ? form.notes : `AI rationale: ${r.rationale}`,
      });
      toast.success("AI drafted the four-factor analysis — review and adjust.");
    } catch { toast.error("AI analysis failed. Fill it in manually."); }
    finally { setAnalyzing(false); }
  }

  const deadline = deadlineFor(form.discoveredDate ? dateInputToISO(form.discoveredDate) : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Breach risk assessment" : "New breach risk assessment"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Incident title *</label>
              <input className="input w-full" value={form.title} onChange={(e) => upd({ title: e.target.value })} placeholder="e.g. Email with PHI sent to wrong recipient" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date discovered</label>
              <input type="date" className="input w-full" value={form.discoveredDate} onChange={(e) => upd({ discoveredDate: e.target.value })} />
            </div>
            {deadline && (
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground"><Clock className="mr-1 inline size-3.5" />Notification deadline (60 days): <span className="font-medium text-foreground">{formatDate(deadline.toISOString())}</span></p>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">What happened?</label>
              <textarea className="input w-full resize-none" rows={3} value={form.description} onChange={(e) => upd({ description: e.target.value })} placeholder="Describe the impermissible use/disclosure and any facts about the four factors." />
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={draftWithAI} disabled={analyzing}>
            {analyzing ? <><Sparkles className="size-4 animate-pulse" /> Analyzing…</> : <><Sparkles className="size-4" /> Draft the four-factor analysis with AI</>}
          </Button>

          {FACTORS.map((f) => (
            <div key={f.key} className="rounded-lg border border-border p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-sm font-medium">{f.label}</label>
                <select className="input h-8 py-0 text-xs" value={form[f.rating] as Rating} onChange={(e) => upd({ [f.rating]: e.target.value } as Partial<Form>)}>
                  <option value="low">Low risk</option><option value="medium">Medium</option><option value="high">High risk</option>
                </select>
              </div>
              <p className="mb-1.5 text-xs text-muted-foreground">{f.hint}</p>
              <textarea className="input w-full resize-none text-sm" rows={2} value={form[f.nature] as string} onChange={(e) => upd({ [f.nature]: e.target.value } as Partial<Form>)} />
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Probability of compromise</label>
              <select className="input w-full" value={form.probability} onChange={(e) => upd({ probability: e.target.value as Rating })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Determination</label>
              <select className="input w-full" value={form.determination} onChange={(e) => upd({ determination: e.target.value as BreachAssessment["determination"] })}>
                <option value="undetermined">Undetermined</option>
                <option value="not_a_breach">Not a breach (exception applies)</option>
                <option value="low_probability">Low probability — not reportable</option>
                <option value="reportable_breach">Reportable breach</option>
              </select>
            </div>
          </div>
          <p className="rounded-md bg-secondary/40 p-2 text-xs text-muted-foreground">HIPAA presumes a reportable breach unless a low probability of compromise is demonstrated via the four factors. This tool is decision-support, not legal advice.</p>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.status === "final"} onChange={(e) => upd({ status: e.target.checked ? "final" : "draft" })} className="size-4" /> Mark as final</label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => onSave(form)} disabled={!form.title.trim() || saving}>{saving ? "Saving…" : "Save assessment"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BreachAssessmentPage() {
  const { profile } = useAuth();
  const q = useCollection("breachAssessments");
  const createMut = useCreate("breachAssessments");
  const updateMut = useUpdate("breachAssessments");
  const [editing, setEditing] = useState<BreachAssessment | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => q.data ?? [], [q.data]);
  const stats = useMemo(() => ({
    reportable: items.filter((a) => a.determination === "reportable_breach").length,
    open: items.filter((a) => a.status === "draft").length,
    dueSoon: items.filter((a) => a.determination === "reportable_breach" && (() => { const dl = deadlineFor(a.discoveredDate); const du = dl ? daysUntil(dl.toISOString()) : null; return du !== null && du <= 60 && du >= 0; })()).length,
  }), [items]);

  async function save(f: Form) {
    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(), discoveredDate: f.discoveredDate ? dateInputToISO(f.discoveredDate) : null, description: f.description.trim() || undefined,
        factor1Nature: f.factor1Nature.trim() || undefined, factor1Rating: f.factor1Rating,
        factor2Recipient: f.factor2Recipient.trim() || undefined, factor2Rating: f.factor2Rating,
        factor3Acquired: f.factor3Acquired.trim() || undefined, factor3Rating: f.factor3Rating,
        factor4Mitigation: f.factor4Mitigation.trim() || undefined, factor4Rating: f.factor4Rating,
        probability: f.probability, determination: f.determination, notes: f.notes.trim() || undefined,
        status: f.status, assessedByName: profile?.fullName || undefined,
      };
      if (editing && editing !== "new") await updateMut.mutateAsync({ id: editing.id, patch: payload });
      else await createMut.mutateAsync(payload);
      toast.success("Assessment saved");
      setEditing(null);
    } catch { toast.error("Couldn't save the assessment."); }
    finally { setSaving(false); }
  }

  if (q.isError) return <div className="space-y-6"><PageHeader title="Breach Risk Assessment" /><ErrorState message="We couldn't load assessments." onRetry={() => void q.refetch()} /></div>;

  return (
    <div className="space-y-6">
      <PageTabs tabs={INCIDENT_TABS} />
      {editing && <AssessmentDialog initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={save} saving={saving} />}

      <PageHeader
        title="Breach Risk Assessment"
        description="The formal HIPAA four-factor determination (45 CFR 164.402) to run when an incident may involve PHI — decides if it's a reportable breach and tracks the 60-day notification clock."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New assessment</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Reportable breaches" value={stats.reportable} icon={ShieldAlert} tone={stats.reportable ? "destructive" : "success"} loading={q.isLoading} />
        <StatCard label="Drafts in progress" value={stats.open} icon={ShieldAlert} loading={q.isLoading} />
        <StatCard label="Within 60-day clock" value={stats.dueSoon} icon={Clock} tone={stats.dueSoon ? "warning" : "default"} loading={q.isLoading} />
      </div>

      <Card>
        <CardHeader><p className="text-sm text-muted-foreground">Documented breach determinations. Reportable breaches must be notified within 60 days of discovery.</p></CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No assessments yet" description="Start a four-factor assessment when a potential breach is discovered. Report new events under the Incidents tab." action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> New assessment</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Incident</th>
                    <th className="pb-2 pr-4 font-medium">Discovered</th>
                    <th className="pb-2 pr-4 font-medium">Determination</th>
                    <th className="pb-2 pr-4 font-medium">Notify by</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => {
                    const dl = deadlineFor(a.discoveredDate);
                    const du = dl ? daysUntil(dl.toISOString()) : null;
                    const urgent = a.determination === "reportable_breach" && du !== null && du <= 60;
                    return (
                      <tr key={a.id} className="cursor-pointer border-b border-border/50 hover:bg-secondary/20" onClick={() => setEditing(a)}>
                        <td data-label="Incident" className="py-3 pr-4 font-medium">{a.title}</td>
                        <td data-label="Discovered" className="py-3 pr-4 text-muted-foreground">{formatDate(a.discoveredDate)}</td>
                        <td data-label="Determination" className="py-3 pr-4"><Badge variant={DET_VARIANT[a.determination]}>{DET_LABEL[a.determination]}</Badge></td>
                        <td data-label="Notify by" className="py-3 pr-4">
                          {a.determination === "reportable_breach" && dl ? (
                            <span className={urgent ? "font-medium text-destructive" : "text-muted-foreground"}>{formatDate(dl.toISOString())}{du !== null && du >= 0 ? ` · ${du}d left` : du !== null ? " · overdue" : ""}</span>
                          ) : "—"}
                        </td>
                        <td data-label="Status" className="py-3"><Badge variant={a.status === "final" ? "success" : "secondary"} className="capitalize cursor-pointer">{a.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

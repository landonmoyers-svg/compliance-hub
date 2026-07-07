"use client";

import { useState, useMemo } from "react";
import { ShieldCheck, Plus, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { SraAssessment, SraFinding } from "@/lib/data/schema";
import { toast } from "sonner";

type Cat = SraFinding["category"];
const CAT_LABEL: Record<Cat, string> = { administrative: "Administrative Safeguards", physical: "Physical Safeguards", technical: "Technical Safeguards", organizational: "Organizational / Documentation" };
const CAT_ORDER: Cat[] = ["administrative", "physical", "technical", "organizational"];
const RISK_VARIANT: Record<string, "secondary" | "success" | "warning" | "destructive"> = { na: "secondary", low: "success", medium: "warning", high: "destructive" };

// HIPAA Security Rule safeguard checklist (45 CFR 164.308–316).
const TEMPLATE: { category: Cat; question: string }[] = [
  { category: "administrative", question: "Has a documented risk analysis of systems that store or transmit ePHI been conducted? (§164.308(a)(1))" },
  { category: "administrative", question: "Is a Security Official designated and responsible for security policies and procedures? (§164.308(a)(2))" },
  { category: "administrative", question: "Are workforce access authorizations, changes, and terminations documented (onboarding/offboarding)? (§164.308(a)(3))" },
  { category: "administrative", question: "Is there a sanction policy for workforce members who violate security policies? (§164.308(a)(1)(ii)(C))" },
  { category: "administrative", question: "Is periodic security awareness training provided to all workforce members? (§164.308(a)(5))" },
  { category: "administrative", question: "Is there a documented security incident response and breach notification procedure? (§164.308(a)(6))" },
  { category: "administrative", question: "Is there a contingency plan — data backup, disaster recovery, and emergency-mode operation? (§164.308(a)(7))" },
  { category: "administrative", question: "Are business associate agreements in place with every vendor that handles ePHI? (§164.308(b))" },
  { category: "physical", question: "Are facilities secured against unauthorized physical access (locks, alarms, visitor control)? (§164.310(a))" },
  { category: "physical", question: "Are workstations positioned and managed to prevent unauthorized viewing of ePHI? (§164.310(b)-(c))" },
  { category: "physical", question: "Is there a policy for secure disposal and re-use of media/devices containing ePHI? (§164.310(d))" },
  { category: "technical", question: "Is access controlled by unique user IDs and strong authentication (MFA where feasible)? (§164.312(a)(1))" },
  { category: "technical", question: "Is ePHI encrypted at rest and in transit where appropriate? (§164.312(a)(2)(iv),(e))" },
  { category: "technical", question: "Are audit logs enabled and periodically reviewed for systems with ePHI? (§164.312(b))" },
  { category: "technical", question: "Are automatic logoff and session controls configured? (§164.312(a)(2)(iii))" },
  { category: "technical", question: "Are anti-malware protection and timely patching processes in place? (§164.308(a)(5)(ii)(B))" },
  { category: "organizational", question: "Are security policies and procedures documented, reviewed, and updated at least annually? (§164.316(a))" },
  { category: "organizational", question: "Are records of required security activities retained for at least six years? (§164.316(b)(2))" },
];

/* ------------------------------ finding row ------------------------------ */

function FindingRow({ finding, onSave }: { finding: SraFinding; onSave: (patch: Partial<SraFinding>) => void }) {
  const [response, setResponse] = useState(finding.response ?? "");
  const [remediation, setRemediation] = useState(finding.remediation ?? "");
  const [owner, setOwner] = useState(finding.remediationOwner ?? "");
  const [due, setDue] = useState(finding.remediationDue?.slice(0, 10) ?? "");
  const showRemediation = finding.riskLevel === "medium" || finding.riskLevel === "high";

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{finding.question}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <textarea className="input w-full resize-none text-sm" rows={2} placeholder="Findings / current state" value={response} onChange={(e) => setResponse(e.target.value)} onBlur={() => response !== (finding.response ?? "") && onSave({ response })} />
        <select className="input h-9 text-sm" value={finding.riskLevel} onChange={(e) => onSave({ riskLevel: e.target.value as SraFinding["riskLevel"] })}>
          <option value="na">Not assessed</option><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option>
        </select>
      </div>
      {showRemediation && (
        <div className="mt-2 space-y-2 rounded-md bg-warning/5 p-2">
          <p className="text-xs font-medium text-muted-foreground">Remediation plan</p>
          <textarea className="input w-full resize-none text-sm" rows={2} placeholder="What will be done to reduce this risk?" value={remediation} onChange={(e) => setRemediation(e.target.value)} onBlur={() => remediation !== (finding.remediation ?? "") && onSave({ remediation })} />
          <div className="grid grid-cols-3 gap-2">
            <input className="input text-sm" placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} onBlur={() => owner !== (finding.remediationOwner ?? "") && onSave({ remediationOwner: owner })} />
            <input type="date" className="input text-sm" value={due} onChange={(e) => setDue(e.target.value)} onBlur={() => onSave({ remediationDue: due ? dateInputToISO(due) : null })} />
            <select className="input text-sm" value={finding.remediationStatus} onChange={(e) => onSave({ remediationStatus: e.target.value as SraFinding["remediationStatus"] })}>
              <option value="none">— status —</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option><option value="accepted">Risk accepted</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

export default function SraPage() {
  const { profile } = useAuth();
  const assessQ = useCollection("sraAssessments");
  const findingsQ = useCollection("sraFindings");
  const createAssess = useCreate("sraAssessments");
  const updateAssess = useUpdate("sraAssessments");
  const createFinding = useCreate("sraFindings");
  const updateFinding = useUpdate("sraFindings");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const assessments = useMemo(() => assessQ.data ?? [], [assessQ.data]);
  const findings = useMemo(() => findingsQ.data ?? [], [findingsQ.data]);
  const selected = assessments.find((a) => a.id === selectedId) ?? null;
  const selectedFindings = useMemo(() => findings.filter((f) => f.assessmentId === selectedId), [findings, selectedId]);

  async function startAssessment() {
    setStarting(true);
    try {
      const year = new Date().getFullYear();
      const a = await createAssess.mutateAsync({
        title: `${year} Annual Security Risk Assessment`, periodYear: year, status: "in_progress",
        startedDate: new Date().toISOString(), completedByName: profile?.fullName || undefined,
      });
      for (const t of TEMPLATE) {
        await createFinding.mutateAsync({ assessmentId: a.id, category: t.category, question: t.question, riskLevel: "na", remediationStatus: "none" });
      }
      toast.success("Assessment started — work through each safeguard.");
      setSelectedId(a.id);
    } catch { toast.error("Couldn't start the assessment."); }
    finally { setStarting(false); }
  }

  function progressOf(assessmentId: string) {
    const fs = findings.filter((f) => f.assessmentId === assessmentId);
    if (fs.length === 0) return 0;
    const answered = fs.filter((f) => f.riskLevel !== "na").length;
    return Math.round((answered / fs.length) * 100);
  }
  function openRemediations(assessmentId: string) {
    return findings.filter((f) => f.assessmentId === assessmentId && (f.riskLevel === "medium" || f.riskLevel === "high") && f.remediationStatus !== "complete" && f.remediationStatus !== "accepted").length;
  }

  if (assessQ.isError) return <div className="space-y-6"><PageHeader title="Security Risk Assessment" /><ErrorState message="We couldn't load assessments." onRetry={() => void assessQ.refetch()} /></div>;

  // ---- Detail view ----
  if (selected) {
    const answered = selectedFindings.filter((f) => f.riskLevel !== "na").length;
    const highs = selectedFindings.filter((f) => f.riskLevel === "high").length;
    const meds = selectedFindings.filter((f) => f.riskLevel === "medium").length;
    const register = selectedFindings.filter((f) => f.riskLevel === "medium" || f.riskLevel === "high");
    return (
      <div className="space-y-6">
        <PageHeader
          title={selected.title}
          description={`Started ${formatDate(selected.startedDate)} · ${answered}/${selectedFindings.length} safeguards assessed`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}><ArrowLeft className="size-4" /> All assessments</Button>
              {selected.status !== "complete" && (
                <Button onClick={() => void updateAssess.mutateAsync({ id: selected.id, patch: { status: "complete", completedDate: new Date().toISOString(), completedByName: profile?.fullName || undefined } }).then(() => toast.success("Assessment marked complete"))}>
                  <Check className="size-4" /> Mark complete
                </Button>
              )}
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="High-risk findings" value={highs} icon={AlertTriangle} tone={highs ? "destructive" : "success"} loading={findingsQ.isLoading} />
          <StatCard label="Medium-risk findings" value={meds} icon={AlertTriangle} tone={meds ? "warning" : "default"} loading={findingsQ.isLoading} />
          <StatCard label="Open remediations" value={openRemediations(selected.id)} icon={ShieldCheck} loading={findingsQ.isLoading} />
        </div>

        {register.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Risk register</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {register.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5 text-sm last:border-0">
                  <span className="truncate">{f.question.replace(/\s*\(§.*\)$/, "")}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={RISK_VARIANT[f.riskLevel]} className="capitalize">{f.riskLevel}</Badge>
                    <Badge variant={f.remediationStatus === "complete" || f.remediationStatus === "accepted" ? "success" : "outline"} className="capitalize">{f.remediationStatus === "none" ? "no plan" : f.remediationStatus.replace("_", " ")}</Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {CAT_ORDER.map((cat) => {
          const fs = selectedFindings.filter((f) => f.category === cat);
          if (fs.length === 0) return null;
          return (
            <Card key={cat}>
              <CardHeader><CardTitle className="text-sm">{CAT_LABEL[cat]}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {fs.map((f) => <FindingRow key={f.id} finding={f} onSave={(patch) => void updateFinding.mutateAsync({ id: f.id, patch })} />)}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Risk Assessment"
        description="Conduct the required annual HIPAA Security Rule risk assessment: work through each safeguard, rate the risk, and track remediation."
        actions={<Button onClick={startAssessment} disabled={starting}><Plus className="size-4" /> {starting ? "Starting…" : "Start assessment"}</Button>}
      />
      <Card>
        <CardHeader><p className="text-sm text-muted-foreground">Each assessment walks the administrative, physical, technical, and organizational safeguards of 45 CFR 164.308–316.</p></CardHeader>
        <CardContent>
          {assessQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : assessments.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No assessments yet" description="Start your annual Security Risk Assessment — it's the document regulators ask for first." action={<Button onClick={startAssessment} disabled={starting}><Plus className="size-4" /> Start assessment</Button>} />
          ) : (
            <div className="space-y-2">
              {assessments.map((a) => {
                const pct = progressOf(a.id);
                return (
                  <button key={a.id} onClick={() => setSelectedId(a.id)} className="flex w-full items-center gap-4 rounded-lg border border-border p-3 text-left hover:bg-secondary/20">
                    <div className="flex-1">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">Started {formatDate(a.startedDate)}{a.completedDate ? ` · completed ${formatDate(a.completedDate)}` : ""}</p>
                    </div>
                    {openRemediations(a.id) > 0 && <Badge variant="warning">{openRemediations(a.id)} open</Badge>}
                    <div className="w-28">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{pct}%</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <Badge variant={(a as SraAssessment).status === "complete" ? "success" : "secondary"} className="capitalize">{(a as SraAssessment).status.replace("_", " ")}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

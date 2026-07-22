"use client";

import { useState, useMemo } from "react";
import { ShieldCheck, Plus, ArrowLeft, Check, AlertTriangle, Sparkles, Quote } from "lucide-react";
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
import { humanizeLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { SraAssessment, SraFinding } from "@/lib/data/schema";
import { toast } from "sonner";

type Cat = SraFinding["category"];
type Status = SraFinding["status"];
const CAT_LABEL: Record<Cat, string> = { administrative: "Administrative Safeguards", physical: "Physical Safeguards", technical: "Technical Safeguards", organizational: "Organizational / Documentation" };
const CAT_ORDER: Cat[] = ["administrative", "physical", "technical", "organizational"];
const RISK_VARIANT: Record<string, "secondary" | "success" | "warning" | "destructive"> = { na: "secondary", low: "success", medium: "warning", high: "destructive" };

// A structured answer drives everything: it sets the risk level automatically.
const STATUS_TO_RISK: Record<Status, SraFinding["riskLevel"]> = { na: "na", yes: "low", partial: "medium", no: "high" };
const RISK_TO_STATUS: Record<SraFinding["riskLevel"], Status> = { na: "na", low: "yes", medium: "partial", high: "no" };
const STATUS_OPTIONS: { value: Status; label: string; active: string }[] = [
  { value: "yes", label: "In place", active: "bg-success/20 text-success ring-success/40" },
  { value: "partial", label: "Partial", active: "bg-warning/20 text-warning ring-warning/40" },
  { value: "no", label: "Gap", active: "bg-destructive/20 text-destructive ring-destructive/40" },
  { value: "na", label: "N/A", active: "bg-secondary text-muted-foreground ring-border" },
];

// HIPAA Security Rule safeguard checklist (45 CFR 164.308–316). Each safeguard
// carries its regulation citation and a set of common controls the user can just
// check off instead of typing.
type Tpl = { category: Cat; question: string; cfr: string; options: string[] };
const TEMPLATE: Tpl[] = [
  { category: "administrative", cfr: "45 CFR §164.308(a)(1)", question: "Has a documented risk analysis of systems that store or transmit ePHI been conducted? (§164.308(a)(1))", options: ["Risk analysis completed this year", "Documented in this tool", "Reviewed by Security Official", "Findings tracked to remediation"] },
  { category: "administrative", cfr: "45 CFR §164.308(a)(2)", question: "Is a Security Official designated and responsible for security policies and procedures? (§164.308(a)(2))", options: ["Security Official named", "Responsibilities documented", "Shown on org chart"] },
  { category: "administrative", cfr: "45 CFR §164.308(a)(3)", question: "Are workforce access authorizations, changes, and terminations documented (onboarding/offboarding)? (§164.308(a)(3))", options: ["Onboarding checklist", "Offboarding revokes access", "Access reviewed periodically", "Unique account per user"] },
  { category: "administrative", cfr: "45 CFR §164.308(a)(1)(ii)(C)", question: "Is there a sanction policy for workforce members who violate security policies? (§164.308(a)(1)(ii)(C))", options: ["Sanction policy documented", "Communicated to workforce", "Enforcement tracked"] },
  { category: "administrative", cfr: "45 CFR §164.308(a)(5)", question: "Is periodic security awareness training provided to all workforce members? (§164.308(a)(5))", options: ["Annual HIPAA training assigned", "Completion tracked", "New hires trained", "Periodic reminders sent"] },
  { category: "administrative", cfr: "45 CFR §164.308(a)(6)", question: "Is there a documented security incident response and breach notification procedure? (§164.308(a)(6))", options: ["Incident procedure documented", "Breach 4-factor tool in use", "Incident log maintained"] },
  { category: "administrative", cfr: "45 CFR §164.308(a)(7)", question: "Is there a contingency plan — data backup, disaster recovery, and emergency-mode operation? (§164.308(a)(7))", options: ["Data backups run", "Offsite copy kept", "Disaster recovery plan", "Restore tested", "Emergency-mode plan"] },
  { category: "administrative", cfr: "45 CFR §164.308(b)", question: "Are business associate agreements in place with every vendor that handles ePHI? (§164.308(b))", options: ["BAAs on file for all ePHI vendors", "Tracked in Vendor Management", "Reviewed annually"] },
  { category: "physical", cfr: "45 CFR §164.310(a)", question: "Are facilities secured against unauthorized physical access (locks, alarms, visitor control)? (§164.310(a))", options: ["Doors locked / badged", "Alarm system", "Visitor sign-in", "After-hours controls"] },
  { category: "physical", cfr: "45 CFR §164.310(b)-(c)", question: "Are workstations positioned and managed to prevent unauthorized viewing of ePHI? (§164.310(b)-(c))", options: ["Screens positioned privately", "Auto-lock enabled", "Clean-desk policy", "Privacy screens"] },
  { category: "physical", cfr: "45 CFR §164.310(d)", question: "Is there a policy for secure disposal and re-use of media/devices containing ePHI? (§164.310(d))", options: ["Secure wipe before reuse", "Shredding of media", "Disposal log", "Encryption on portable media"] },
  { category: "technical", cfr: "45 CFR §164.312(a)(1)", question: "Is access controlled by unique user IDs and strong authentication (MFA where feasible)? (§164.312(a)(1))", options: ["Unique user IDs", "MFA enabled", "Strong password policy", "Role-based access"] },
  { category: "technical", cfr: "45 CFR §164.312(a)(2)(iv),(e)", question: "Is ePHI encrypted at rest and in transit where appropriate? (§164.312(a)(2)(iv),(e))", options: ["TLS/HTTPS in transit", "Encryption at rest", "Encrypted email/portal for ePHI", "Full-disk encryption"] },
  { category: "technical", cfr: "45 CFR §164.312(b)", question: "Are audit logs enabled and periodically reviewed for systems with ePHI? (§164.312(b))", options: ["Audit logging enabled", "Logs reviewed periodically", "Alerts on anomalies", "Retention ≥ 6 years"] },
  { category: "technical", cfr: "45 CFR §164.312(a)(2)(iii)", question: "Are automatic logoff and session controls configured? (§164.312(a)(2)(iii))", options: ["Auto-logoff configured", "Session timeout", "Idle screen lock"] },
  { category: "technical", cfr: "45 CFR §164.308(a)(5)(ii)(B)", question: "Are anti-malware protection and timely patching processes in place? (§164.308(a)(5)(ii)(B))", options: ["Endpoint anti-malware", "Automatic OS updates", "App patching process", "Firewall enabled"] },
  { category: "organizational", cfr: "45 CFR §164.316(a)", question: "Are security policies and procedures documented, reviewed, and updated at least annually? (§164.316(a))", options: ["Policies documented", "Reviewed annually", "Version-controlled", "Workforce acknowledgment captured"] },
  { category: "organizational", cfr: "45 CFR §164.316(b)(2)", question: "Are records of required security activities retained for at least six years? (§164.316(b)(2))", options: ["Retention policy ≥ 6 yrs", "Version history retained", "Backups retained", "Audit trail retained"] },
];
const TPL_BY_Q = new Map(TEMPLATE.map((t) => [t.question, t]));

function effectiveStatus(f: SraFinding): Status {
  if (f.status && f.status !== "na") return f.status;
  // Back-compat: older rows only had a risk level; derive a status from it.
  if (f.riskLevel !== "na") return RISK_TO_STATUS[f.riskLevel];
  return "na";
}

/* ------------------------------ finding row ------------------------------ */

function FindingRow({ finding, owners, onSave }: { finding: SraFinding; owners: string[]; onSave: (patch: Partial<SraFinding>) => void }) {
  const tpl = TPL_BY_Q.get(finding.question);
  const options = tpl?.options ?? [];
  const status = effectiveStatus(finding);
  const evidence = finding.evidence ?? [];
  const [response, setResponse] = useState(finding.response ?? "");
  const [remediation, setRemediation] = useState(finding.remediation ?? "");
  const [due, setDue] = useState(finding.remediationDue?.slice(0, 10) ?? "");
  const [draftingRem, setDraftingRem] = useState(false);
  const showRemediation = status === "partial" || status === "no";

  async function draftRemediation() {
    setDraftingRem(true);
    const tId = toast.loading("Drafting remediation…");
    try {
      const res = await fetch("/api/ai/sra-remediation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: finding.question, cfr: tpl?.cfr ?? "", status, response }),
      });
      const d = await res.json() as { remediation?: string; owner?: string; dueWeeks?: number; error?: string };
      if (!res.ok || !d.remediation) { toast.error(d.error ?? "Draft failed.", { id: tId }); return; }
      setRemediation(d.remediation);
      const patch: Partial<SraFinding> = { remediation: d.remediation };
      if (d.owner && !finding.remediationOwner) patch.remediationOwner = d.owner;
      if (typeof d.dueWeeks === "number" && d.dueWeeks > 0 && !finding.remediationDue) {
        const dt = new Date(Date.now() + d.dueWeeks * 7 * 86400000).toISOString().slice(0, 10);
        setDue(dt); patch.remediationDue = dateInputToISO(dt);
      }
      if (finding.remediationStatus === "none") patch.remediationStatus = "open";
      onSave(patch);
      toast.success("Remediation drafted — review and adjust.", { id: tId });
    } catch { toast.error("Couldn't reach the planner.", { id: tId }); }
    finally { setDraftingRem(false); }
  }
  const label = finding.question.replace(/\s*\(§.*\)$/, "");

  function setStatus(value: Status) {
    onSave({ status: value, riskLevel: STATUS_TO_RISK[value], aiSuggested: false });
  }
  function toggleEvidence(opt: string) {
    const next = evidence.includes(opt) ? evidence.filter((e) => e !== opt) : [...evidence, opt];
    onSave({ evidence: next });
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {finding.aiSuggested && <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-primary"><Sparkles className="size-3" /> AI suggested — review</Badge>}
      </div>
      {tpl && <p className="mt-0.5 text-[11px] text-muted-foreground">{tpl.cfr}</p>}

      {/* Structured answer: one tap sets the risk automatically */}
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Compliance status">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setStatus(o.value)}
            aria-pressed={status === o.value}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
              status === o.value ? o.active : "bg-transparent text-muted-foreground ring-border hover:bg-secondary",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Evidence checkboxes — click instead of type */}
      {options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const on = evidence.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleEvidence(opt)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                  on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                <span className={cn("flex size-3.5 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                  {on && <Check className="size-2.5" />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {/* Citation from AI prefill */}
      {finding.citation && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-secondary/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          <Quote className="mt-0.5 size-3 shrink-0" /> <span><span className="font-medium text-foreground">Evidence:</span> {finding.citation}</span>
        </p>
      )}

      {/* Optional free-text detail (AI prefills this too) */}
      <textarea
        className="input mt-2 w-full resize-none text-sm"
        rows={2}
        placeholder="Findings / notes (optional — add anything the checkboxes don't cover)"
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        onBlur={() => response !== (finding.response ?? "") && onSave({ response })}
      />

      {showRemediation && (
        <div className="mt-2 space-y-2 rounded-md bg-warning/5 p-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Remediation plan</p>
            <Button size="sm" variant="outline" disabled={draftingRem} onClick={() => void draftRemediation()}>
              <Sparkles className="size-3.5" /> {draftingRem ? "Drafting…" : "Draft with AI"}
            </Button>
          </div>
          <textarea className="input w-full resize-none text-sm" rows={3} placeholder="What will be done to reduce this risk? — or draft it with AI" value={remediation} onChange={(e) => setRemediation(e.target.value)} onBlur={() => remediation !== (finding.remediation ?? "") && onSave({ remediation })} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input className="input text-sm" list="sra-owners" placeholder="Owner" defaultValue={finding.remediationOwner ?? ""} onBlur={(e) => e.target.value !== (finding.remediationOwner ?? "") && onSave({ remediationOwner: e.target.value })} />
            <input type="date" className="input text-sm" value={due} onChange={(e) => setDue(e.target.value)} onBlur={() => onSave({ remediationDue: due ? dateInputToISO(due) : null })} />
            <select className="input text-sm" value={finding.remediationStatus} onChange={(e) => onSave({ remediationStatus: e.target.value as SraFinding["remediationStatus"] })}>
              <option value="none">— status —</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option><option value="accepted">Risk accepted</option>
            </select>
          </div>
        </div>
      )}
      <datalist id="sra-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

export default function SraPage() {
  const { profile } = useAuth();
  const assessQ = useCollection("sraAssessments");
  const findingsQ = useCollection("sraFindings");
  const employeesQ = useCollection("employees");
  const createAssess = useCreate("sraAssessments");
  const updateAssess = useUpdate("sraAssessments");
  const createFinding = useCreate("sraFindings");
  const updateFinding = useUpdate("sraFindings");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

  const assessments = useMemo(() => assessQ.data ?? [], [assessQ.data]);
  const findings = useMemo(() => findingsQ.data ?? [], [findingsQ.data]);
  const owners = useMemo(() => (employeesQ.data ?? []).map((e) => [e.firstName, e.lastName].filter(Boolean).join(" ")).filter(Boolean).sort(), [employeesQ.data]);
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
        await createFinding.mutateAsync({ assessmentId: a.id, category: t.category, question: t.question, status: "na", evidence: [], aiSuggested: false, riskLevel: "na", remediationStatus: "none" });
      }
      toast.success("Assessment started — answer each safeguard, or let AI prefill from your data.");
      setSelectedId(a.id);
    } catch { toast.error("Couldn't start the assessment."); }
    finally { setStarting(false); }
  }

  async function aiPrefill() {
    if (!selected) return;
    setPrefilling(true);
    try {
      const payload = selectedFindings.map((f) => {
        const tpl = TPL_BY_Q.get(f.question);
        return { id: f.id, question: f.question, category: f.category, cfr: tpl?.cfr ?? "", options: tpl?.options ?? [] };
      });
      const res = await fetch("/api/ai/sra-prefill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ findings: payload }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI prefill failed");
      const suggestions: { id: string; status?: Status; response?: string; riskLevel?: SraFinding["riskLevel"]; citation?: string; evidence?: string[] }[] = data.suggestions ?? [];
      const valid = new Set(selectedFindings.map((f) => f.id));
      let applied = 0;
      await Promise.all(suggestions.filter((s) => valid.has(s.id)).map((s) => {
        const status = (["na", "yes", "partial", "no"] as Status[]).includes(s.status as Status) ? (s.status as Status) : "na";
        applied++;
        return updateFinding.mutateAsync({
          id: s.id,
          patch: {
            status,
            riskLevel: STATUS_TO_RISK[status],
            response: s.response ?? undefined,
            citation: s.citation ?? undefined,
            evidence: Array.isArray(s.evidence) ? s.evidence : [],
            aiSuggested: true,
          },
        });
      }));
      toast.success(`AI prefilled ${applied} safeguard${applied === 1 ? "" : "s"} from your live data — review each and adjust.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI prefill failed.");
    } finally { setPrefilling(false); }
  }

  function progressOf(assessmentId: string) {
    const fs = findings.filter((f) => f.assessmentId === assessmentId);
    if (fs.length === 0) return 0;
    const answered = fs.filter((f) => effectiveStatus(f) !== "na").length;
    return Math.round((answered / fs.length) * 100);
  }
  function openRemediations(assessmentId: string) {
    return findings.filter((f) => f.assessmentId === assessmentId && (f.riskLevel === "medium" || f.riskLevel === "high") && f.remediationStatus !== "complete" && f.remediationStatus !== "accepted").length;
  }

  if (assessQ.isError) return <div className="space-y-6"><PageHeader title="Security Risk Assessment" /><ErrorState message="We couldn't load assessments." onRetry={() => void assessQ.refetch()} /></div>;

  // ---- Detail view ----
  if (selected) {
    const answered = selectedFindings.filter((f) => effectiveStatus(f) !== "na").length;
    const highs = selectedFindings.filter((f) => f.riskLevel === "high").length;
    const meds = selectedFindings.filter((f) => f.riskLevel === "medium").length;
    const register = selectedFindings.filter((f) => f.riskLevel === "medium" || f.riskLevel === "high");
    const hasAiSuggestions = selectedFindings.some((f) => f.aiSuggested);
    return (
      <div className="space-y-6">
        <PageHeader
          title={selected.title}
          description={`Started ${formatDate(selected.startedDate)} · ${answered}/${selectedFindings.length} safeguards assessed`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}><ArrowLeft className="size-4" /> All assessments</Button>
              <Button variant="outline" onClick={aiPrefill} disabled={prefilling}><Sparkles className="size-4" /> {prefilling ? "Analyzing…" : "AI prefill"}</Button>
              {selected.status !== "complete" && (
                <Button onClick={() => void updateAssess.mutateAsync({ id: selected.id, patch: { status: "complete", completedDate: new Date().toISOString(), completedByName: profile?.fullName || undefined } }).then(() => toast.success("Assessment marked complete"))}>
                  <Check className="size-4" /> Mark complete
                </Button>
              )}
            </div>
          }
        />

        <Card>
          <CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              Answer each safeguard with one tap (<span className="text-success">In place</span> / <span className="text-warning">Partial</span> / <span className="text-destructive">Gap</span> / N/A) and check the controls that apply — the risk level is set for you.
              {" "}<span className="font-medium text-foreground">AI prefill</span> reads your live data (vendors &amp; BAAs, training completion, backups, audit logs, policies) and proposes an answer for every safeguard with a citation you can verify.
              {hasAiSuggestions && <span className="text-foreground"> Items marked <span className="text-primary">AI suggested</span> below are drafts — review before marking complete.</span>}
            </p>
          </CardContent>
        </Card>

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
                    <Badge variant={RISK_VARIANT[f.riskLevel]} className="capitalize">{humanizeLabel(f.riskLevel)}</Badge>
                    <Badge variant={f.remediationStatus === "complete" || f.remediationStatus === "accepted" ? "success" : "outline"} className="capitalize">{f.remediationStatus === "none" ? "no plan" : humanizeLabel(f.remediationStatus)}</Badge>
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
                {fs.map((f) => <FindingRow key={f.id} finding={f} owners={owners} onSave={(patch) => void updateFinding.mutateAsync({ id: f.id, patch })} />)}
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
        description="Conduct the required annual HIPAA Security Rule risk assessment: answer each safeguard with a tap, and let AI prefill from your live data."
        actions={<Button onClick={startAssessment} disabled={starting}><Plus className="size-4" /> {starting ? "Starting…" : "Start assessment"}</Button>}
      />
      <Card>
        <CardHeader><p className="text-sm text-muted-foreground">Each assessment walks the administrative, physical, technical, and organizational safeguards of 45 CFR 164.308–316. Answer with In place / Partial / Gap / N/A, check the controls that apply, and AI can propose cited answers from your data.</p></CardHeader>
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
                    <Badge variant={(a as SraAssessment).status === "complete" ? "success" : "secondary"} className="capitalize">{humanizeLabel((a as SraAssessment).status)}</Badge>
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

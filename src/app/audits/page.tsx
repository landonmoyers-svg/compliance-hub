"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Plus, ArrowLeft, Check, AlertTriangle, Sparkles, Quote } from "lucide-react";
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
import { cn } from "@/lib/cn";
import type { Audit, AuditItem } from "@/lib/data/schema";
import { toast } from "sonner";

const TYPE_LABEL: Record<Audit["auditType"], string> = { internal: "Internal compliance", mock_hipaa: "Mock HIPAA survey", mock_osha: "Mock OSHA survey", payer: "Payer / documentation", other: "Other" };

type Result = AuditItem["result"];
const RESULT_OPTIONS: { value: Result; label: string; active: string }[] = [
  { value: "pass", label: "Pass", active: "bg-success/20 text-success ring-success/40" },
  { value: "partial", label: "Partial", active: "bg-warning/20 text-warning ring-warning/40" },
  { value: "fail", label: "Fail", active: "bg-destructive/20 text-destructive ring-destructive/40" },
  { value: "na", label: "N/A", active: "bg-secondary text-muted-foreground ring-border" },
];

const TEMPLATES: Record<Audit["auditType"], { category: string; question: string }[]> = {
  mock_hipaa: [
    { category: "Privacy", question: "Notice of Privacy Practices is current, posted, and provided to patients." },
    { category: "Privacy", question: "Minimum-necessary access is enforced; workforce access is role-appropriate." },
    { category: "Privacy", question: "Business Associate Agreements are signed and current for all vendors handling PHI." },
    { category: "Security", question: "A current Security Risk Analysis exists with remediation tracked." },
    { category: "Security", question: "Unique user IDs, strong authentication (MFA), and automatic logoff are in place." },
    { category: "Security", question: "ePHI is encrypted at rest and in transit; audit logs are enabled and reviewed." },
    { category: "Breach", question: "A breach response procedure and 4-factor assessment process are documented." },
    { category: "Training", question: "All workforce completed HIPAA training within the last 12 months." },
  ],
  mock_osha: [
    { category: "HazCom", question: "SDS library is complete and accessible for all hazardous products." },
    { category: "Bloodborne", question: "Exposure Control Plan is current and BBP training is up to date." },
    { category: "Recordkeeping", question: "OSHA 300A is posted Feb 1–Apr 30 and injury logs are maintained." },
    { category: "PPE", question: "Appropriate PPE is available and staff are trained on its use." },
    { category: "Emergency", question: "Emergency Action Plan is documented and drills are conducted." },
    { category: "Safety", question: "Sharps disposal and biohazard handling meet standards." },
  ],
  payer: [
    { category: "Documentation", question: "Encounter notes support the level of service and CPT codes billed." },
    { category: "Documentation", question: "Provider credentials/enrollment are current for all billed services." },
    { category: "Billing", question: "Modifiers and coding follow payer policy; no duplicate/unbundled claims." },
    { category: "Consent", question: "Consent and financial responsibility forms are on file." },
  ],
  internal: [
    { category: "Policies", question: "Key policies exist, are current (reviewed in the last year), and acknowledged." },
    { category: "Credentialing", question: "All provider licenses, DEA, and certifications are current." },
    { category: "Controlled Substances", question: "CS inventory/reconciliation and CSDB checks are performed and logged." },
    { category: "Incidents", question: "Incidents are reported, investigated, and closed with corrective action." },
    { category: "Exclusion", question: "Staff and vendors are screened against OIG-LEIE/SAM at hire and monthly." },
    { category: "Training", question: "Required role-based training is assigned and completed on time." },
  ],
  other: [{ category: "General", question: "Define the items for this audit." }],
};

function ItemRow({ item, owners, onSave }: { item: AuditItem; owners: string[]; onSave: (patch: Partial<AuditItem>) => void }) {
  const [finding, setFinding] = useState(item.finding ?? "");
  const [remediation, setRemediation] = useState(item.remediation ?? "");
  const [due, setDue] = useState(item.remediationDue?.slice(0, 10) ?? "");
  const failed = item.result === "fail" || item.result === "partial";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{item.question}</p>
        {item.aiSuggested && <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-primary"><Sparkles className="size-3" /> AI suggested — review</Badge>}
      </div>

      {/* Tap to set result */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Result">
        {RESULT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onSave({ result: o.value, aiSuggested: false })}
            aria-pressed={item.result === o.value}
            className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors", item.result === o.value ? o.active : "bg-transparent text-muted-foreground ring-border hover:bg-secondary")}
          >
            {o.label}
          </button>
        ))}
        {failed && (
          <select className="input ml-1 h-8 py-0 text-sm" value={item.severity} onChange={(e) => onSave({ severity: e.target.value as AuditItem["severity"] })} aria-label="Severity">
            <option value="low">Low severity</option><option value="medium">Medium severity</option><option value="high">High severity</option>
          </select>
        )}
      </div>

      {item.citation && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-secondary/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          <Quote className="mt-0.5 size-3 shrink-0" /> <span><span className="font-medium text-foreground">Evidence:</span> {item.citation}</span>
        </p>
      )}

      {failed && (
        <div className="mt-2 space-y-2 rounded-md bg-destructive/5 p-2">
          <textarea className="input w-full resize-none text-sm" rows={2} placeholder="Finding" value={finding} onChange={(e) => setFinding(e.target.value)} onBlur={() => finding !== (item.finding ?? "") && onSave({ finding })} />
          <textarea className="input w-full resize-none text-sm" rows={2} placeholder="Corrective action / remediation" value={remediation} onChange={(e) => setRemediation(e.target.value)} onBlur={() => remediation !== (item.remediation ?? "") && onSave({ remediation })} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input className="input text-sm" list="audit-owners" placeholder="Owner" defaultValue={item.remediationOwner ?? ""} onBlur={(e) => e.target.value !== (item.remediationOwner ?? "") && onSave({ remediationOwner: e.target.value })} />
            <input type="date" className="input text-sm" value={due} onChange={(e) => setDue(e.target.value)} onBlur={() => onSave({ remediationDue: due ? dateInputToISO(due) : null })} />
            <select className="input text-sm" value={item.remediationStatus} onChange={(e) => onSave({ remediationStatus: e.target.value as AuditItem["remediationStatus"] })}>
              <option value="none">— status —</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="complete">Complete</option><option value="accepted">Accepted</option>
            </select>
          </div>
        </div>
      )}
      <datalist id="audit-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

export default function AuditsPage() {
  const { profile } = useAuth();
  const auditsQ = useCollection("audits");
  const itemsQ = useCollection("auditItems");
  const employeesQ = useCollection("employees");
  const createAudit = useCreate("audits");
  const updateAudit = useUpdate("audits");
  const createItem = useCreate("auditItems");
  const updateItem = useUpdate("auditItems");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [type, setType] = useState<Audit["auditType"]>("mock_hipaa");
  const [starting, setStarting] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

  const audits = useMemo(() => auditsQ.data ?? [], [auditsQ.data]);
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const owners = useMemo(() => (employeesQ.data ?? []).map((e) => [e.firstName, e.lastName].filter(Boolean).join(" ")).filter(Boolean).sort(), [employeesQ.data]);
  const selected = audits.find((a) => a.id === selectedId) ?? null;
  const selItems = useMemo(() => items.filter((i) => i.auditId === selectedId), [items, selectedId]);

  async function aiPrefill() {
    if (!selected) return;
    setPrefilling(true);
    try {
      const payload = selItems.map((i) => ({ id: i.id, question: i.question, category: i.category }));
      const res = await fetch("/api/ai/audit-prefill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: payload, auditType: selected.auditType }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI prefill failed");
      const suggestions: { id: string; result?: Result; severity?: AuditItem["severity"]; finding?: string; remediation?: string; citation?: string }[] = data.suggestions ?? [];
      const valid = new Set(selItems.map((i) => i.id));
      let applied = 0;
      await Promise.all(suggestions.filter((s) => valid.has(s.id)).map((s) => {
        const result = (["pass", "partial", "fail", "na"] as Result[]).includes(s.result as Result) ? (s.result as Result) : "na";
        applied++;
        return updateItem.mutateAsync({ id: s.id, patch: {
          result,
          severity: (["low", "medium", "high"] as AuditItem["severity"][]).includes(s.severity as AuditItem["severity"]) ? (s.severity as AuditItem["severity"]) : "low",
          finding: s.finding ?? undefined,
          remediation: s.remediation ?? undefined,
          citation: s.citation ?? undefined,
          aiSuggested: true,
        } });
      }));
      toast.success(`AI prefilled ${applied} item${applied === 1 ? "" : "s"} from your live data — review each.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI prefill failed.");
    } finally { setPrefilling(false); }
  }

  function scoreOf(auditId: string) {
    const its = items.filter((i) => i.auditId === auditId && i.result !== "na");
    if (its.length === 0) return null;
    const pass = its.filter((i) => i.result === "pass").length;
    return Math.round((pass / its.length) * 100);
  }
  function openFindings(auditId: string) {
    return items.filter((i) => i.auditId === auditId && (i.result === "fail" || i.result === "partial") && i.remediationStatus !== "complete" && i.remediationStatus !== "accepted").length;
  }

  async function start() {
    setStarting(true);
    try {
      const a = await createAudit.mutateAsync({ title: `${TYPE_LABEL[type]} — ${new Date().toLocaleDateString()}`, auditType: type, status: "in_progress", auditDate: new Date().toISOString(), auditorName: profile?.fullName || undefined });
      for (const t of TEMPLATES[type]) await createItem.mutateAsync({ auditId: a.id, category: t.category, question: t.question, result: "na", severity: "low", remediationStatus: "none", aiSuggested: false });
      toast.success("Audit started");
      setSelectedId(a.id);
    } catch { toast.error("Couldn't start the audit."); }
    finally { setStarting(false); }
  }

  if (auditsQ.isError) return <div className="space-y-6"><PageHeader title="Audits & Mock Surveys" /><ErrorState message="We couldn't load audits." onRetry={() => void auditsQ.refetch()} /></div>;

  if (selected) {
    const cats = Array.from(new Set(selItems.map((i) => i.category)));
    const fails = selItems.filter((i) => i.result === "fail").length;
    const score = scoreOf(selected.id);
    return (
      <div className="space-y-6">
        <PageHeader title={selected.title} description={`${TYPE_LABEL[selected.auditType]} · started ${formatDate(selected.auditDate)}`}
          actions={<div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSelectedId(null)}><ArrowLeft className="size-4" /> All audits</Button>
            <Button variant="outline" onClick={aiPrefill} disabled={prefilling}><Sparkles className="size-4" /> {prefilling ? "Analyzing…" : "AI prefill"}</Button>
            {selected.status !== "complete" && <Button onClick={() => void updateAudit.mutateAsync({ id: selected.id, patch: { status: "complete" } }).then(() => toast.success("Audit completed"))}><Check className="size-4" /> Complete</Button>}
          </div>} />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Score" value={score === null ? "—" : `${score}%`} icon={ClipboardCheck} tone={score === null ? "default" : score >= 90 ? "success" : score >= 70 ? "warning" : "destructive"} />
          <StatCard label="Failed items" value={fails} icon={AlertTriangle} tone={fails ? "destructive" : "success"} />
          <StatCard label="Open corrective actions" value={openFindings(selected.id)} icon={AlertTriangle} tone={openFindings(selected.id) ? "warning" : "default"} />
        </div>
        {cats.map((c) => (
          <Card key={c}>
            <CardHeader><CardTitle className="text-sm">{c}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selItems.filter((i) => i.category === c).map((i) => <ItemRow key={i.id} item={i} owners={owners} onSave={(patch) => void updateItem.mutateAsync({ id: i.id, patch })} />)}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audits & Mock Surveys" description="Run internal audits and mock HIPAA/OSHA/payer surveys, capture findings, and track corrective actions to closure."
        actions={<div className="flex gap-2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as Audit["auditType"])}>
            {(Object.keys(TYPE_LABEL) as Audit["auditType"][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <Button onClick={start} disabled={starting}><Plus className="size-4" /> {starting ? "Starting…" : "Start audit"}</Button>
        </div>} />
      <Card>
        <CardHeader><p className="text-sm text-muted-foreground">Each audit is seeded from a checklist for its type. Failed items capture a finding + corrective action.</p></CardHeader>
        <CardContent>
          {auditsQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : audits.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No audits yet" description="Run a mock HIPAA or OSHA survey to find gaps before a real one does." action={<Button onClick={start} disabled={starting}><Plus className="size-4" /> Start audit</Button>} />
          ) : (
            <div className="space-y-2">
              {audits.map((a) => {
                const score = scoreOf(a.id);
                return (
                  <button key={a.id} onClick={() => setSelectedId(a.id)} className="flex w-full items-center gap-4 rounded-lg border border-border p-3 text-left hover:bg-secondary/20">
                    <div className="flex-1">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{TYPE_LABEL[a.auditType]} · {formatDate(a.auditDate)}</p>
                    </div>
                    {openFindings(a.id) > 0 && <Badge variant="warning">{openFindings(a.id)} open</Badge>}
                    {score !== null && <Badge variant={score >= 90 ? "success" : score >= 70 ? "warning" : "destructive"}>{score}%</Badge>}
                    <Badge variant={a.status === "complete" ? "success" : "secondary"} className="capitalize">{a.status.replace("_", " ")}</Badge>
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

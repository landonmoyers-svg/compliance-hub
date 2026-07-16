"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Plus, ArrowLeft, Check, AlertTriangle, Sparkles, Quote, BookOpen, Search as SearchIcon, Upload } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { formatDate, dateInputToISO } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { humanizeLabel } from "@/lib/format";
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

type TemplateItem = { category: string; question: string; rubric: string; howToVerify: string; regCitation: string };

const TEMPLATES: Record<Audit["auditType"], TemplateItem[]> = {
  mock_hipaa: [
    { category: "Privacy", question: "Notice of Privacy Practices is current, posted, and provided to patients.",
      rubric: "Pass: current NPP posted at each site + on the website, and a signed acknowledgment (or documented good-faith effort) is on file for sampled patients. Partial: NPP exists but is outdated, not posted at every site, or acknowledgments are inconsistent. Fail: no current NPP, not provided to patients, or no acknowledgments.",
      howToVerify: "Pull the NPP and confirm the revision date and required content. Check it's posted in each clinic and on the site. Sample 5–10 recent charts for the signed acknowledgment or a documented refusal/good-faith effort.",
      regCitation: "45 CFR 164.520" },
    { category: "Privacy", question: "Minimum-necessary access is enforced; workforce access is role-appropriate.",
      rubric: "Pass: access is role-based and documented; a recent access review shows no over-provisioning. Partial: role-based in principle but no recent review, or a few mismatches. Fail: shared logins, everyone-sees-everything, or no access controls.",
      howToVerify: "Review the role→access matrix and the EHR user list. Sample 3–5 staff and confirm their access matches their role. Look for a dated access-review record.",
      regCitation: "45 CFR 164.502(b), 164.514(d)" },
    { category: "Privacy", question: "Business Associate Agreements are signed and current for all vendors handling PHI.",
      rubric: "Pass: every PHI-handling vendor has a signed, unexpired BAA on file. Partial: BAAs exist but some are missing, unsigned, or outdated. Fail: no BAAs or PHI shared with unbound vendors.",
      howToVerify: "List all vendors with PHI access (EHR, billing, shredding, email, backup). For each, open the signed BAA and check the signature + date in Vendor Management.",
      regCitation: "45 CFR 164.502(e), 164.308(b), 164.314(a)" },
    { category: "Security", question: "A current Security Risk Analysis exists with remediation tracked.",
      rubric: "Pass: an SRA completed within the last 12 months (or after a major change) with a risk-ranked remediation plan showing progress. Partial: an SRA exists but is stale or has no tracked remediation. Fail: no SRA.",
      howToVerify: "Open the Security Risk Assessment. Confirm the completion date, that it covers all ePHI systems, and that identified risks have owners, due dates, and status.",
      regCitation: "45 CFR 164.308(a)(1)(ii)(A)" },
    { category: "Security", question: "Unique user IDs, strong authentication (MFA), and automatic logoff are in place.",
      rubric: "Pass: unique logins for every user, MFA on all PHI systems, and automatic logoff configured. Partial: some but not all (e.g., MFA missing on one system, or no auto-logoff). Fail: shared accounts or no MFA.",
      howToVerify: "Confirm each system requires a unique login and MFA (check the admin console). Verify session-timeout/auto-logoff settings on workstations and the EHR.",
      regCitation: "45 CFR 164.312(a)(2)(i), (iii), (d)" },
    { category: "Security", question: "ePHI is encrypted at rest and in transit; audit logs are enabled and reviewed.",
      rubric: "Pass: full-disk/database encryption at rest, TLS in transit, and audit logs enabled with evidence of periodic review. Partial: encryption present but logs not reviewed, or gaps. Fail: unencrypted ePHI or no logging.",
      howToVerify: "Confirm device/database encryption settings and TLS. Open the audit log and confirm it captures access events; look for a dated log-review record.",
      regCitation: "45 CFR 164.312(a)(2)(iv), (b), (e)(2)(ii)" },
    { category: "Breach", question: "A breach response procedure and 4-factor assessment process are documented.",
      rubric: "Pass: a written breach-response SOP exists and past incidents show a documented 4-factor assessment within the 60-day clock. Partial: SOP exists but assessments are missing/late. Fail: no procedure.",
      howToVerify: "Open the breach-response SOP and the Breach Assessment tool. Review any past incidents for a completed 4-factor determination and notification timing.",
      regCitation: "45 CFR 164.400–414 (esp. 164.402, 164.404)" },
    { category: "Training", question: "All workforce completed HIPAA training within the last 12 months.",
      rubric: "Pass: 100% of active workforce has a dated completion within 12 months (with the attestation/quiz record). Partial: most complete but some overdue. Fail: no records or majority overdue.",
      howToVerify: "Open the Training roster, filter to the HIPAA module, and compare completions against the active-employee list. Spot-check the completion evidence.",
      regCitation: "45 CFR 164.530(b), 164.308(a)(5)" },
  ],
  mock_osha: [
    { category: "HazCom", question: "SDS library is complete and accessible for all hazardous products.",
      rubric: "Pass: an SDS is on file and readily accessible for every hazardous chemical in use, with a written HazCom program. Partial: most SDS present but some missing or not accessible. Fail: no SDS library or program.",
      howToVerify: "Walk each area, list hazardous products in use, and confirm a matching SDS in the library. Confirm staff know how to access it and that the written HazCom program exists.",
      regCitation: "29 CFR 1910.1200(e), (g)" },
    { category: "Bloodborne", question: "Exposure Control Plan is current and Bloodborne Pathogens (BBP) training is up to date.",
      rubric: "Pass: ECP reviewed within 12 months, lists tasks with exposure risk, and all at-risk staff have annual BBP training + HBV vaccination offer on record. Partial: ECP exists but stale or training gaps. Fail: no ECP.",
      howToVerify: "Open the ECP and check the annual review date. Confirm annual BBP training records and the Hepatitis B vaccination offer/declination for at-risk staff.",
      regCitation: "29 CFR 1910.1030(c), (g)(2)" },
    { category: "Recordkeeping", question: "OSHA 300/301 injury logs are maintained and the 300A summary is posted Feb 1–Apr 30.",
      rubric: "Pass: recordable injuries are logged on the 300 with 301 detail, and the 300A was posted for the required period (or a $0/no-injury summary was still posted). Partial: logs exist but incomplete or posting missed. Fail: no logs.",
      howToVerify: "Open the OSHA tracker; confirm each recordable case has 300 classification + 301 detail. Confirm the prior-year 300A was posted Feb 1–Apr 30. (≤10 employees may be exempt — verify.)",
      regCitation: "29 CFR 1904.32, 1904.7" },
    { category: "PPE", question: "Appropriate PPE is available and staff are trained on its use.",
      rubric: "Pass: a PPE hazard assessment exists, required PPE is stocked and accessible, and training is documented. Partial: PPE available but no assessment or training records. Fail: required PPE missing.",
      howToVerify: "Confirm a written PPE hazard assessment. Verify gloves/eye protection/gowns are stocked where needed and that use-training is documented.",
      regCitation: "29 CFR 1910.132" },
    { category: "Emergency", question: "Emergency Action Plan is documented and drills are conducted.",
      rubric: "Pass: written EAP covering evacuation/roles/alarms, plus documented drills at the expected cadence. Partial: EAP exists but no drill records. Fail: no EAP.",
      howToVerify: "Open the EAP and evacuation maps. Confirm dated fire/evacuation drill records in Emergency Prep and that staff know their roles.",
      regCitation: "29 CFR 1910.38, 1910.157(g)" },
    { category: "Safety", question: "Sharps disposal and biohazard handling meet standards.",
      rubric: "Pass: FDA-cleared sharps containers, not overfilled, at point of use; regulated-waste is labeled and a disposal contract/manifests exist. Partial: minor lapses (overfilled container, labeling gaps). Fail: improper disposal.",
      howToVerify: "Inspect sharps containers (fill level, mounting, location). Confirm biohazard labeling and a regulated-medical-waste hauler contract with manifests.",
      regCitation: "29 CFR 1910.1030(d)(4)" },
  ],
  payer: [
    { category: "Documentation", question: "Encounter notes support the level of service and CPT codes billed.",
      rubric: "Pass: sampled notes clearly support the billed E/M level and CPT/add-on codes with time or MDM documented. Partial: mostly supported with a few under/over-documented. Fail: notes routinely don't support the codes.",
      howToVerify: "Sample 10 recent encounters across providers. Compare the note (time or medical decision-making) to the billed codes; flag any not supported.",
      regCitation: "SSA 1833(e); CMS E/M documentation guidelines" },
    { category: "Documentation", question: "Provider credentials/enrollment are current for all billed services.",
      rubric: "Pass: every billing provider has current licensure, DEA (if applicable), and active payer enrollment/CAQH for the dates of service. Partial: current but enrollment lapses found. Fail: billing under lapsed credentials.",
      howToVerify: "Cross-check billing providers against the Credentials module and payer enrollment. Confirm no service was billed during a licensure/enrollment gap.",
      regCitation: "42 CFR 424.500 series; payer enrollment rules" },
    { category: "Billing", question: "Modifiers and coding follow payer policy; no duplicate/unbundled claims.",
      rubric: "Pass: modifier use is supported, NCCI edits respected, and no duplicate/unbundled claims in the sample. Partial: isolated errors. Fail: systemic unbundling or duplicates.",
      howToVerify: "Run a claims sample against NCCI edits and payer modifier policy. Check for duplicate DOS/CPT pairs and unsupported modifier 25/59 use.",
      regCitation: "CMS NCCI Policy Manual; 42 CFR 1003 (FCA exposure)" },
    { category: "Consent", question: "Consent and financial responsibility forms are on file.",
      rubric: "Pass: signed treatment consent and financial-responsibility/ABN (where required) on file for sampled patients. Partial: present but inconsistent. Fail: missing.",
      howToVerify: "Sample recent patients and confirm signed consent + financial responsibility (and ABN where Medicare non-coverage applies) are in the record.",
      regCitation: "Payer contract terms; Medicare ABN (CMS-R-131)" },
  ],
  internal: [
    { category: "Policies", question: "Key policies exist, are current (reviewed in the last year), and acknowledged.",
      rubric: "Pass: the core policy set exists, each reviewed within 12 months, with staff acknowledgments on file. Partial: policies exist but some stale or unacknowledged. Fail: missing core policies.",
      howToVerify: "Open the SOP Library; check review dates on core policies. Cross-check Policy Attestation for staff acknowledgments.",
      regCitation: "OIG Compliance Program guidance (7 elements)" },
    { category: "Credentialing", question: "All provider licenses, DEA, and certifications are current.",
      rubric: "Pass: every active provider's license, DEA, and required certs (CPR/BLS, board) are current with documents on file. Partial: current but some documents missing. Fail: any expired credential in use.",
      howToVerify: "Open the Credentials module, filter to active providers, and confirm no expired items and that each has an attached document.",
      regCitation: "State licensure; 21 CFR 1301 (DEA registration)" },
    { category: "Controlled Substances", question: "Controlled-substance records (receipt→administration→waste) and CSDB checks are complete and reconciled.",
      rubric: "Pass: a complete chain of custody per bottle from receipt to administration/waste, a biennial inventory on file, reconciliations balance, and CSDB/PDMP checks are logged. Partial: records exist but gaps or unreconciled counts. Fail: missing logs or unexplained discrepancies.",
      howToVerify: "In Controlled Substances, trace 2–3 bottles end-to-end. Confirm the biennial inventory, that counts reconcile, waste is witnessed, and PDMP/CSDB checks are documented.",
      regCitation: "21 CFR 1304 (records); 1304.11 (inventory); state PDMP" },
    { category: "Incidents", question: "Incidents are reported, investigated, and closed with corrective action.",
      rubric: "Pass: incidents are logged with objective facts, investigated, and closed with a documented corrective action (CAPA). Partial: reported but not consistently closed. Fail: no incident process.",
      howToVerify: "Open the Incidents hub. Sample recent incidents and confirm each has an investigation, root cause, and a closed or tracked corrective action.",
      regCitation: "OIG Compliance guidance; 29 CFR 1904 (if injury)" },
    { category: "Exclusion", question: "Staff and vendors are screened against federal exclusion lists (OIG-LEIE/SAM) at hire and monthly.",
      rubric: "Pass: every active employee and PHI/billing vendor has a current (within ~30 days) OIG-LEIE + SAM screening with proof on file. Partial: screening happens but gaps or missing proof. Fail: no screening.",
      howToVerify: "Open Exclusion Screening; check coverage vs. the active roster and that each has an uploaded result document dated within the monthly cadence.",
      regCitation: "SSA 1128/1128A; 42 CFR 1001; OIG SAB (05/2013)" },
    { category: "Training", question: "Required role-based training is assigned and completed on time.",
      rubric: "Pass: each role's required training set is assigned and completed on schedule with evidence. Partial: assigned but some overdue. Fail: no role-based assignment.",
      howToVerify: "Compare Org Chart role requirements to Training assignments/completions per employee; confirm evidence for completed items and flag overdue.",
      regCitation: "OIG Compliance guidance (effective training)" },
  ],
  other: [{ category: "General", question: "Define the items for this audit.", rubric: "", howToVerify: "", regCitation: "" }],
};

function ItemRow({ item, owners, onSave }: { item: AuditItem; owners: string[]; onSave: (patch: Partial<AuditItem>) => void }) {
  const [finding, setFinding] = useState(item.finding ?? "");
  const [remediation, setRemediation] = useState(item.remediation ?? "");
  const [due, setDue] = useState(item.remediationDue?.slice(0, 10) ?? "");
  const [guideOpen, setGuideOpen] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const failed = item.result === "fail" || item.result === "partial";
  const rated = item.result !== "na";

  async function uploadEvidence(f: File) {
    setUploadingEvidence(true);
    try {
      const url = await uploadFile(f, "audit-evidence");
      onSave({ evidenceUrl: url });
      toast.success("Evidence attached");
    } catch { toast.error("Couldn't upload the evidence."); }
    finally { setUploadingEvidence(false); }
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{item.question}</p>
        {item.aiSuggested && <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-primary"><Sparkles className="size-3" /> AI suggested — review</Badge>}
      </div>

      {/* AUDIT-1: rubric + how-to-verify + citation, so ratings aren't a blind yes/no */}
      {(item.rubric || item.howToVerify) && (
        <div className="mt-2">
          <button type="button" onClick={() => setGuideOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <BookOpen className="size-3.5" /> {guideOpen ? "Hide" : "How to score this"}
            {item.regCitation && <span className="ml-1 font-normal text-muted-foreground">· {item.regCitation}</span>}
          </button>
          {guideOpen && (
            <div className="mt-2 space-y-2 rounded-md border border-border bg-secondary/20 p-2.5 text-xs leading-relaxed">
              {item.rubric && <p><span className="font-semibold text-foreground">Rubric.</span> {item.rubric}</p>}
              {item.howToVerify && <p className="flex items-start gap-1.5"><SearchIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" /><span><span className="font-semibold text-foreground">How to verify.</span> {item.howToVerify}</span></p>}
              {item.regCitation && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Citation:</span> {item.regCitation}</p>}
            </div>
          )}
        </div>
      )}

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
          <Quote className="mt-0.5 size-3 shrink-0" /> <span><span className="font-medium text-foreground">AI note:</span> {item.citation}</span>
        </p>
      )}

      {/* AUDIT-1: attach the proof that supports the rating */}
      {rated && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Evidence:</span>
          {item.evidenceUrl ? (
            <FileLink path={item.evidenceUrl} label="View attached" className="inline-flex items-center gap-1 text-primary hover:underline" />
          ) : (
            <span className="text-muted-foreground">none attached</span>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-secondary/40">
            {uploadingEvidence ? <><Sparkles className="size-3 animate-pulse" /> Uploading…</> : <><Upload className="size-3" /> {item.evidenceUrl ? "Replace" : "Attach proof"}</>}
            <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploadingEvidence} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEvidence(f); }} />
          </label>
        </div>
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
      for (const t of TEMPLATES[type]) await createItem.mutateAsync({ auditId: a.id, category: t.category, question: t.question, result: "na", severity: "low", remediationStatus: "none", aiSuggested: false, rubric: t.rubric || undefined, howToVerify: t.howToVerify || undefined, regCitation: t.regCitation || undefined });
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
                    <Badge variant={a.status === "complete" ? "success" : "secondary"} className="capitalize">{humanizeLabel(a.status)}</Badge>
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

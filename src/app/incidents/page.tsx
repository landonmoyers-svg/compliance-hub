"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert, Plus, Search, Check, X, AlertTriangle, Sparkles, ExternalLink } from "lucide-react";
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
import { useSort, SortHeader } from "@/components/shared/sortable";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { formatDate, dateInputToISO, isExpired } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import type { Incident, CorrectiveAction } from "@/lib/data/schema";
import { toast } from "sonner";

const CATEGORY_LABEL: Record<string, string> = {
  privacy_hipaa: "Privacy / HIPAA", safety_osha: "Safety / OSHA", billing: "Billing",
  hr_conduct: "HR / Conduct", medication: "Medication", security: "Security", other: "Other",
};
const SEVERITY_VARIANT = { low: "secondary", medium: "warning", high: "destructive", critical: "destructive" } as const;
const STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "outline"> = {
  new: "warning", triaged: "outline", investigating: "warning", corrective_action: "outline", closed: "success",
};
const CAPA_STATUS_VARIANT: Record<string, "secondary" | "warning" | "success" | "outline"> = {
  open: "warning", in_progress: "warning", verifying: "outline", complete: "success", cancelled: "secondary",
};
const INCIDENT_STATUSES = ["new", "triaged", "investigating", "corrective_action", "closed"] as const;

// Report types drive intake, anonymity, and routing. Anonymous is allowed ONLY
// for whistleblower/compliance concerns; medicine + OSHA expect a signed name on
// injury/patient/HIPAA/conduct reports.
const REPORT_TYPES = {
  hipaa_privacy: {
    label: "HIPAA / privacy incident",
    blurb: "A privacy or security event involving PHI — wrong-patient disclosure, lost/stolen device, misdirected fax or email, snooping, or unauthorized access.",
    category: "privacy_hipaa" as Incident["category"],
    route: { href: "/breach-assessment", label: "Start a Breach Assessment (4-factor)" },
    allowAnonymous: false,
  },
  injury: {
    label: "Injury — staff or patient",
    blurb: "A physical injury or exposure — needlestick, sharps, fall, or any work-related injury or illness.",
    category: "safety_osha" as Incident["category"],
    route: { href: "/osha-tracker", label: "Log an OSHA injury record" },
    allowAnonymous: false,
  },
  patient_safety: {
    label: "Patient incident / safety event",
    blurb: "A patient-safety event — medication error, adverse reaction, near miss, or a concern about care delivered.",
    category: "medication" as Incident["category"],
    route: null,
    allowAnonymous: false,
  },
  staff_conduct: {
    label: "Staff incident / conduct",
    blurb: "A workplace conduct issue — policy violation, harassment, or a behavior concern involving staff.",
    category: "hr_conduct" as Incident["category"],
    route: null,
    allowAnonymous: false,
  },
  whistleblower: {
    label: "Whistleblower / compliance concern",
    blurb: "A good-faith report of suspected fraud, illegal conduct, or a serious compliance concern. This is the only report type that may be submitted anonymously.",
    category: "other" as Incident["category"],
    route: null,
    allowAnonymous: true,
  },
  other: {
    label: "Other",
    blurb: "Anything that doesn't fit the types above.",
    category: "other" as Incident["category"],
    route: null,
    allowAnonymous: false,
  },
} as const;
type ReportTypeKey = keyof typeof REPORT_TYPES;

const OBSERVED_GUIDANCE = "Report only what you personally observed or what was directly communicated to you. Stick to objective facts — do not speculate about the what, why, how, who, or when unless it is provable or documented.";
const ATTESTATION_TEXT = "I attest that this report is true and accurate to the best of my knowledge, and that I have described only what I personally observed or was directly told. I understand this report may become part of the practice's official compliance records.";

/* ------------------------------ report dialog ------------------------------ */

function ReportDialog({ locations, onClose, onSubmit, saving }: {
  locations: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (d: { reportType: ReportTypeKey; title: string; description: string; severity: Incident["severity"]; occurredDate: string; locationId: string; anonymous: boolean; attested: boolean; file: File | null }) => void;
  saving: boolean;
}) {
  const [reportType, setReportType] = useState<ReportTypeKey>("hipaa_privacy");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Incident["severity"]>("medium");
  const [occurredDate, setOccurredDate] = useState("");
  const [locationId, setLocationId] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [attested, setAttested] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const meta = REPORT_TYPES[reportType];
  const canAnon = meta.allowAnonymous;
  const effectiveAnon = canAnon && anonymous;
  // Signed reports must attest; anonymous whistleblower reports need no signature.
  const canSubmit = !!title.trim() && !saving && (effectiveAnon || attested);

  function pickType(t: ReportTypeKey) {
    setReportType(t);
    if (!REPORT_TYPES[t].allowAnonymous) setAnonymous(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Report an incident or concern</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Report type *</label>
            <select className="input w-full" value={reportType} onChange={(e) => pickType(e.target.value as ReportTypeKey)}>
              {(Object.keys(REPORT_TYPES) as ReportTypeKey[]).map((k) => <option key={k} value={k}>{REPORT_TYPES[k].label}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          </div>

          {/* INC-3: objective-facts guidance, shown prominently */}
          <div className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-foreground">{OBSERVED_GUIDANCE}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">What happened? *</label>
            <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short factual summary" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Severity</label>
              <select className="input w-full" value={severity} onChange={(e) => setSeverity(e.target.value as Incident["severity"])}>
                {(["low", "medium", "high", "critical"] as const).map((s) => <option key={s} value={s}>{humanizeLabel(s)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date it occurred</label>
              <input type="date" className="input w-full" value={occurredDate} onChange={(e) => setOccurredDate(e.target.value)} />
            </div>
          </div>
          {locations.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <select className="input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Not specified</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Details</label>
            <textarea className="input w-full resize-none" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Objectively describe what you observed or were told, who was involved, and any immediate actions taken." />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Evidence <span className="text-muted-foreground">(optional)</span></label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
              <Plus className="size-4" />
              {file ? file.name : "Attach a photo or document"}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {/* INC-4: anonymity only for whistleblower; INC-5: attestation otherwise */}
          {canAnon ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4" />
              Submit anonymously (your name won’t be attached to this report)
            </label>
          ) : (
            <p className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
              This report type is submitted under your name — {" "}
              medicine and OSHA expect a signed reporter on injury, patient, HIPAA, and conduct reports. Only whistleblower/compliance concerns may be anonymous.
            </p>
          )}
          {!effectiveAnon && (
            <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-xs leading-relaxed">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
              <span>{ATTESTATION_TEXT} <span className="text-destructive">*</span></span>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit({ reportType, title, description, severity, occurredDate, locationId, anonymous: effectiveAnon, attested: effectiveAnon ? false : attested, file })} disabled={!canSubmit}>
            {saving ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ detail + CAPA ------------------------------ */

const ROOT_CAUSES = ["Human error", "Process gap", "Training gap", "System / technical failure", "Communication breakdown", "Policy / procedure gap", "External / vendor issue", "Inadequate supervision", "Documentation error"];

function IncidentDetail({ incident, capas, isAdmin, owners, locations, onClose, onStatus, onAddCapa, onUpdateCapa, onAiDraft }: {
  incident: Incident;
  capas: CorrectiveAction[];
  isAdmin: boolean;
  owners: string[];
  locations: { id: string; name: string }[];
  onClose: () => void;
  onStatus: (status: Incident["status"]) => void;
  onAddCapa: (d: { title: string; rootCause: string; actionPlan: string; ownerName: string; dueDate: string }) => void;
  onUpdateCapa: (id: string, patch: Partial<CorrectiveAction>) => void;
  onAiDraft: () => Promise<{ title?: string; rootCause?: string; actionPlan?: string; citation?: string } | null>;
}) {
  const [showCapa, setShowCapa] = useState(false);
  const [title, setTitle] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [citation, setCitation] = useState("");
  const [drafting, setDrafting] = useState(false);

  async function aiDraft() {
    setDrafting(true);
    try {
      const d = await onAiDraft();
      if (d) {
        setTitle(d.title ?? "");
        setRootCause(d.rootCause ?? "");
        setActionPlan(d.actionPlan ?? "");
        setCitation(d.citation ?? "");
        setShowCapa(true);
      }
    } finally { setDrafting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{incident.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={SEVERITY_VARIANT[incident.severity]} className="capitalize">{humanizeLabel(incident.severity)}</Badge>
              <Badge variant="outline">{REPORT_TYPES[incident.reportType]?.label ?? CATEGORY_LABEL[incident.category]}</Badge>
              <span>· Reported {formatDate(incident.createdDate)}</span>
              <span>· by {incident.anonymous ? "Anonymous" : incident.reportedByName || "—"}{!incident.anonymous && incident.attested ? " (attested)" : ""}</span>
              {incident.locationId && locations.find((l) => l.id === incident.locationId) && <span>· {locations.find((l) => l.id === incident.locationId)!.name}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {incident.description && <p className="whitespace-pre-wrap text-sm">{incident.description}</p>}

          {incident.evidenceUrl && (
            <FileLink path={incident.evidenceUrl} label="View attached evidence" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" />
          )}

          {/* INC-2: connect the incident to the specialized tool for its type */}
          {REPORT_TYPES[incident.reportType]?.route && (
            <Link href={REPORT_TYPES[incident.reportType]!.route!.href} className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm hover:bg-primary/10">
              <span>{incident.reportType === "hipaa_privacy" ? "This may be a reportable breach — run the 4-factor assessment." : "Record this injury in the OSHA log."}</span>
              <span className="flex items-center gap-1 font-medium text-primary">{REPORT_TYPES[incident.reportType]!.route!.label} <ExternalLink className="size-3.5" /></span>
            </Link>
          )}

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Status</span>
            {isAdmin ? (
              <select className="input" value={incident.status} onChange={(e) => onStatus(e.target.value as Incident["status"])}>
                {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{humanizeLabel(s)}</option>)}
              </select>
            ) : (
              <Badge variant={STATUS_VARIANT[incident.status]} className="capitalize">{humanizeLabel(incident.status)}</Badge>
            )}
          </div>

          {/* Corrective actions */}
          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Corrective actions ({capas.length})</h3>
              {isAdmin && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={aiDraft} disabled={drafting}><Sparkles className="size-3.5" /> {drafting ? "Drafting…" : "AI draft"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowCapa((s) => !s)}><Plus className="size-3.5" /> Add</Button>
                </div>
              )}
            </div>

            {capas.length === 0 && !showCapa && <p className="text-sm text-muted-foreground">No corrective actions yet.</p>}

            <div className="space-y-2">
              {capas.map((c) => {
                const overdue = c.status !== "complete" && c.status !== "cancelled" && isExpired(c.dueDate);
                return (
                  <div key={c.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{c.title}</p>
                      <Badge variant={CAPA_STATUS_VARIANT[c.status]} className="capitalize shrink-0">{humanizeLabel(c.status)}</Badge>
                    </div>
                    {c.rootCause && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Root cause:</span> {c.rootCause}</p>}
                    {c.actionPlan && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Plan:</span> {c.actionPlan}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.ownerName && <span>Owner: {c.ownerName}</span>}
                      {c.dueDate && <span className={overdue ? "text-destructive font-medium" : ""}>Due {formatDate(c.dueDate)}{overdue ? " · overdue" : ""}</span>}
                      {c.verifiedDate && <span className="text-success">Verified {formatDate(c.verifiedDate)}</span>}
                    </div>
                    {isAdmin && c.status !== "complete" && c.status !== "cancelled" && (
                      <div className="mt-2 flex gap-1.5">
                        {c.status === "open" && <Button size="sm" variant="ghost" onClick={() => onUpdateCapa(c.id, { status: "in_progress" })}>Start</Button>}
                        <Button size="sm" variant="ghost" onClick={() => onUpdateCapa(c.id, { status: "complete", verifiedDate: new Date().toISOString() })}><Check className="size-3.5" /> Verify complete</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {showCapa && isAdmin && (
              <div className="mt-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                {citation && (
                  <p className="flex items-start gap-1.5 rounded-md bg-secondary/40 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" /> <span><span className="font-medium text-foreground">AI draft — review &amp; edit.</span> Reference: {citation}</span>
                  </p>
                )}
                <input className="input w-full" placeholder="Corrective action title *" value={title} onChange={(e) => setTitle(e.target.value)} />
                <input className="input w-full" list="capa-root-causes" placeholder="Root cause" value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
                <textarea className="input w-full resize-none" rows={3} placeholder="Action plan" value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input className="input w-full" list="capa-owners" placeholder="Owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                  <input type="date" className="input w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setShowCapa(false); setCitation(""); }}>Cancel</Button>
                  <Button size="sm" disabled={!title.trim()} onClick={() => { onAddCapa({ title, rootCause, actionPlan, ownerName, dueDate }); setShowCapa(false); setTitle(""); setRootCause(""); setActionPlan(""); setOwnerName(""); setDueDate(""); setCitation(""); }}>Add corrective action</Button>
                </div>
                <datalist id="capa-root-causes">{ROOT_CAUSES.map((r) => <option key={r} value={r} />)}</datalist>
                <datalist id="capa-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

export default function IncidentsPage() {
  const { profile, isAdmin } = useAuth();
  const router = useRouter();
  const myUserId = profile?.userId ?? "";
  const incidentsQ = useCollection("incidents");
  const capasQ = useCollection("correctiveActions");
  const employeesQ = useCollection("employees");
  const locationsQ = useCollection("locations");
  const createIncident = useCreate("incidents");
  const updateIncident = useUpdate("incidents");
  const createCapa = useCreate("correctiveActions");
  const updateCapa = useUpdate("correctiveActions");

  const [reporting, setReporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const incidents = useMemo(() => incidentsQ.data ?? [], [incidentsQ.data]);
  const capas = useMemo(() => capasQ.data ?? [], [capasQ.data]);
  const locations = useMemo(() => (locationsQ.data ?? []).map((l) => ({ id: l.id, name: l.name })), [locationsQ.data]);
  const owners = useMemo(() => (employeesQ.data ?? []).map((e) => [e.firstName, e.lastName].filter(Boolean).join(" ")).filter(Boolean).sort(), [employeesQ.data]);

  async function aiDraftCapa(incident: Incident) {
    try {
      const res = await fetch("/api/ai/capa-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: incident.title, category: incident.category, description: incident.description, severity: incident.severity }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI draft failed");
      return data as { title?: string; rootCause?: string; actionPlan?: string; citation?: string };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI draft failed.");
      return null;
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return incidents.filter((i) => !q || i.title.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
  }, [incidents, search]);

  const openIncident = incidents.find((i) => i.id === openId) ?? null;
  const capasFor = (incidentId: string) => capas.filter((c) => c.incidentId === incidentId);

  const SEVERITY_RANK: Record<Incident["severity"], number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const { sorted, sort, toggle } = useSort(filtered, {
    incident: (i) => i.title,
    category: (i) => CATEGORY_LABEL[i.category],
    severity: (i) => SEVERITY_RANK[i.severity],
    reported: (i) => i.createdDate,
    capas: (i) => capasFor(i.id).length,
    status: (i) => i.status,
  });

  const stats = useMemo(() => {
    const open = incidents.filter((i) => i.status !== "closed").length;
    const investigating = incidents.filter((i) => i.status === "investigating").length;
    const overdueCapas = capas.filter((c) => c.status !== "complete" && c.status !== "cancelled" && isExpired(c.dueDate)).length;
    return { open, investigating, overdueCapas };
  }, [incidents, capas]);

  async function submitReport(d: { reportType: ReportTypeKey; title: string; description: string; severity: Incident["severity"]; occurredDate: string; locationId: string; anonymous: boolean; attested: boolean; file: File | null }) {
    setSaving(true);
    try {
      let evidenceUrl: string | null = null;
      if (d.file) {
        try { evidenceUrl = await uploadFile(d.file, "incidents"); }
        catch { toast.error("Couldn't upload the evidence file — submitting without it."); }
      }
      const created = await createIncident.mutateAsync({
        title: d.title.trim(),
        reportType: d.reportType,
        category: REPORT_TYPES[d.reportType].category,
        description: d.description.trim() || undefined,
        severity: d.severity,
        status: "new",
        anonymous: d.anonymous,
        attested: d.attested,
        reportedByUserId: d.anonymous ? null : (myUserId || null),
        reportedByName: d.anonymous ? undefined : (profile?.fullName || undefined),
        locationId: d.locationId || null,
        occurredDate: d.occurredDate ? dateInputToISO(d.occurredDate) : null,
        evidenceUrl,
      });
      setReporting(false);
      // INC-2: route HIPAA → Breach Assessment, injury → OSHA record. Carry the
      // new incident's id (opaque UUID only — no PHI in the URL) so the breach
      // assessment can pre-fill title/date/what-happened from it.
      const route = REPORT_TYPES[d.reportType].route;
      if (route) {
        const href = route.href === "/breach-assessment"
          ? `${route.href}?fromIncident=${created.id}`
          : route.href;
        toast.success("Report submitted. Next step recommended:", {
          description: route.label,
          action: { label: "Go", onClick: () => router.push(href) },
          duration: 8000,
        });
      } else {
        toast.success("Report submitted. Thank you.");
      }
    } catch {
      toast.error("Couldn't submit the report.");
    } finally {
      setSaving(false);
    }
  }

  async function addCapa(incidentId: string, d: { title: string; rootCause: string; actionPlan: string; ownerName: string; dueDate: string }) {
    try {
      await createCapa.mutateAsync({
        incidentId,
        title: d.title.trim(),
        rootCause: d.rootCause.trim() || undefined,
        actionPlan: d.actionPlan.trim() || undefined,
        ownerName: d.ownerName.trim() || undefined,
        dueDate: d.dueDate ? dateInputToISO(d.dueDate) : null,
        status: "open",
      });
      if (openIncident && openIncident.status !== "corrective_action" && openIncident.status !== "closed") {
        await updateIncident.mutateAsync({ id: incidentId, patch: { status: "corrective_action" } });
      }
      toast.success("Corrective action added");
    } catch { toast.error("Couldn't add the corrective action."); }
  }

  if (incidentsQ.isError) {
    return <div className="space-y-6"><PageHeader title="Incidents & Corrective Actions" /><ErrorState message="We couldn't load incidents." onRetry={() => void incidentsQ.refetch()} /></div>;
  }

  return (
    <div className="space-y-6">
      <PageTabs tabs={INCIDENT_TABS} />
      {reporting && <ReportDialog locations={locations} onClose={() => setReporting(false)} onSubmit={submitReport} saving={saving} />}
      {openIncident && (
        <IncidentDetail
          incident={openIncident}
          capas={capasFor(openIncident.id)}
          isAdmin={isAdmin}
          owners={owners}
          locations={locations}
          onClose={() => setOpenId(null)}
          onStatus={(status) => void updateIncident.mutateAsync({ id: openIncident.id, patch: { status } })}
          onAddCapa={(d) => void addCapa(openIncident.id, d)}
          onUpdateCapa={(id, patch) => void updateCapa.mutateAsync({ id, patch })}
          onAiDraft={() => aiDraftCapa(openIncident)}
        />
      )}

      <PageHeader
        title="Incidents & Corrective Actions"
        description="The starting point when anything happens: staff report incidents and concerns here, and corrective actions are tracked to closure."
        actions={<Button onClick={() => setReporting(true)}><Plus className="size-4" /> Report incident</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open incidents" value={stats.open} icon={ShieldAlert} tone={stats.open ? "warning" : "success"} loading={incidentsQ.isLoading} />
        <StatCard label="Under investigation" value={stats.investigating} icon={AlertTriangle} loading={incidentsQ.isLoading} />
        <StatCard label="Overdue corrective actions" value={stats.overdueCapas} icon={AlertTriangle} tone={stats.overdueCapas ? "destructive" : "default"} loading={capasQ.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input className="input w-full pl-9" placeholder="Search incidents…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {incidentsQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No incidents" description={isAdmin ? "Reported incidents will appear here." : "You haven't reported any incidents."} action={<Button onClick={() => setReporting(true)}><Plus className="size-4" /> Report incident</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Incident" sortKey="incident" sort={sort} onToggle={toggle} />
                    <SortHeader label="Category" sortKey="category" sort={sort} onToggle={toggle} />
                    <SortHeader label="Severity" sortKey="severity" sort={sort} onToggle={toggle} />
                    <SortHeader label="Reported" sortKey="reported" sort={sort} onToggle={toggle} />
                    <SortHeader label="Corrective actions" sortKey="capas" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} className="pr-0" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((i) => (
                    <tr key={i.id} className="cursor-pointer border-b border-border/50 hover:bg-secondary/20" onClick={() => setOpenId(i.id)}>
                      <td data-label="Incident" className="py-3 pr-4 font-medium">{i.title}{i.anonymous && <span className="ml-2 text-xs text-muted-foreground">(anonymous)</span>}</td>
                      <td data-label="Category" className="py-3 pr-4 text-muted-foreground">{CATEGORY_LABEL[i.category]}</td>
                      <td data-label="Severity" className="py-3 pr-4"><Badge variant={SEVERITY_VARIANT[i.severity]} className="capitalize">{humanizeLabel(i.severity)}</Badge></td>
                      <td data-label="Reported" className="py-3 pr-4 text-muted-foreground">{formatDate(i.createdDate)}</td>
                      <td data-label="Corrective actions" className="py-3 pr-4 text-muted-foreground">{capasFor(i.id).length}</td>
                      <td data-label="Status" className="py-3"><Badge variant={STATUS_VARIANT[i.status]} className="capitalize cursor-pointer">{humanizeLabel(i.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Plus, Upload, Sparkles, FileText, X } from "lucide-react";
import { useCreate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { credentialTypes } from "@/lib/data/schema";
import { dateInputToISO } from "@/lib/dates";
import { toast } from "sonner";

const MAX_MB = 15;

const CRED_TYPE_LABEL: Record<string, string> = {
  license: "Professional license",
  certification: "Board / specialty certification",
  dea: "DEA registration",
  cpr_bls_acls: "CPR / BLS / ACLS card",
  immunization: "Immunization record",
  background_check: "Background check",
  other: "Other",
};

const POLICY_TYPES = ["malpractice", "general_liability", "cyber", "workers_comp", "property", "other"] as const;
const POLICY_TYPE_LABEL: Record<string, string> = {
  malpractice: "Malpractice / professional liability",
  general_liability: "General liability",
  cyber: "Cyber liability",
  workers_comp: "Workers' compensation",
  property: "Property",
  other: "Other",
};

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = reader.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function analyzableMedia(file: File): string | null {
  const t = file.type;
  if (t === "application/pdf" || t.startsWith("image/")) return t;
  return null;
}

function DialogShell({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

/** Shared file picker that reads the file, runs the AI extractor, and reports back. */
function FilePicker({ file, setFile, onAnalyze, analyzing, accept }: {
  file: File | null; setFile: (f: File | null) => void; onAnalyze: (f: File) => void; analyzing: boolean; accept: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Document <span className="font-normal text-muted-foreground">(optional — we’ll read it and fill in the details)</span></label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > MAX_MB * 1024 * 1024) { toast.error(`File too large (max ${MAX_MB}MB).`); return; }
          setFile(f);
          if (analyzableMedia(f)) onAnalyze(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 truncate"><FileText className="size-4 shrink-0 text-primary" /><span className="truncate">{file.name}</span></span>
          <div className="flex items-center gap-2">
            {analyzing && <span className="flex items-center gap-1 text-xs text-primary"><Sparkles className="size-3 animate-pulse" /> Reading…</span>}
            <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> Upload document
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Credential ------------------------------ */

export function AddCredentialButton({ myUserId, myName, onAdded }: { myUserId: string; myName: string; onAdded?: () => void }) {
  const createMut = useCreate("credentials");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    credentialName: "", credentialType: "license", issuingBody: "", credentialNumber: "", issueDate: "", expirationDate: "",
  });

  function reset() { setForm({ credentialName: "", credentialType: "license", issuingBody: "", credentialNumber: "", issueDate: "", expirationDate: "" }); setFile(null); }

  async function analyze(f: File) {
    const media = analyzableMedia(f);
    if (!media) return;
    setAnalyzing(true);
    try {
      const fileBase64 = await fileToBase64(f);
      const res = await fetch("/api/ai/credential-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // No people roster — this record is always assigned to the current user only.
        body: JSON.stringify({ fileBase64, mediaType: media }),
      });
      if (res.status === 429) { toast.error("Daily AI limit reached — enter the details manually."); return; }
      const d = await res.json() as { credentialType?: string; credentialName?: string; issuingBody?: string | null; credentialNumber?: string | null; issueDate?: string | null; expirationDate?: string | null };
      if (res.ok) {
        setForm((p) => ({
          credentialName: p.credentialName || d.credentialName || "",
          credentialType: d.credentialType && (credentialTypes as readonly string[]).includes(d.credentialType) ? d.credentialType : p.credentialType,
          issuingBody: p.issuingBody || d.issuingBody || "",
          credentialNumber: p.credentialNumber || d.credentialNumber || "",
          issueDate: p.issueDate || (d.issueDate ?? ""),
          expirationDate: p.expirationDate || (d.expirationDate ?? ""),
        }));
        toast.success("Filled in from your document — review and save.");
      } else {
        toast.error("Couldn't read that document — enter the details manually.");
      }
    } catch { toast.error("Couldn't read that document — enter the details manually."); }
    finally { setAnalyzing(false); }
  }

  async function save() {
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) documentUrl = await uploadFile(file, "credential");
      await createMut.mutateAsync({
        employeeUserId: myUserId || null,
        employeeName: myName,
        credentialName: form.credentialName.trim(),
        credentialType: form.credentialType as (typeof credentialTypes)[number],
        issuingBody: form.issuingBody.trim() || undefined,
        credentialNumber: form.credentialNumber.trim() || undefined,
        issueDate: form.issueDate ? dateInputToISO(form.issueDate) : undefined,
        expirationDate: form.expirationDate ? dateInputToISO(form.expirationDate) : undefined,
        documentUrl,
      });
      toast.success("Added to your credentials");
      setOpen(false); reset(); onAdded?.();
    } catch { toast.error("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Add</Button>
      {open && (
        <DialogShell
          title="Add a credential or license"
          subtitle="Only you and compliance administrators can see this."
          onClose={() => { if (!saving) { setOpen(false); reset(); } }}
          footer={<>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={!form.credentialName.trim() || saving || analyzing}>{saving ? "Saving…" : "Save"}</Button>
          </>}
        >
          <FilePicker file={file} setFile={setFile} onAnalyze={analyze} analyzing={analyzing} accept=".pdf,.png,.jpg,.jpeg,.webp" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Name *</label>
              <input className="input w-full" value={form.credentialName} onChange={set("credentialName")} placeholder="e.g. Utah RN License" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <select className="input w-full" value={form.credentialType} onChange={set("credentialType")}>
                {credentialTypes.map((t) => <option key={t} value={t}>{CRED_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Issuing body</label>
              <input className="input w-full" value={form.issuingBody} onChange={set("issuingBody")} placeholder="e.g. Utah DOPL" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Number</label>
              <input className="input w-full" value={form.credentialNumber} onChange={set("credentialNumber")} placeholder="License / cert #" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Issued</label>
              <input type="date" className="input w-full" value={form.issueDate} onChange={set("issueDate")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Expires</label>
              <input type="date" className="input w-full" value={form.expirationDate} onChange={set("expirationDate")} />
            </div>
          </div>
        </DialogShell>
      )}
    </>
  );
}

/* ------------------------------ Insurance ------------------------------ */

export function AddInsuranceButton({ myUserId, myName, onAdded }: { myUserId: string; myName: string; onAdded?: () => void }) {
  const createMut = useCreate("insurancePolicies");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    policyName: "", policyType: "malpractice", carrierName: "", policyNumber: "", coverageAmount: "", annualPremium: "", renewalDate: "",
  });

  function reset() { setForm({ policyName: "", policyType: "malpractice", carrierName: "", policyNumber: "", coverageAmount: "", annualPremium: "", renewalDate: "" }); setFile(null); }

  async function analyze(f: File) {
    const media = analyzableMedia(f);
    if (!media) return;
    setAnalyzing(true);
    try {
      const fileBase64 = await fileToBase64(f);
      const res = await fetch("/api/ai/insurance-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mediaType: media }),
      });
      if (res.status === 429) { toast.error("Daily AI limit reached — enter the details manually."); return; }
      const d = await res.json() as { policyType?: string; policyName?: string; carrierName?: string | null; policyNumber?: string | null; coverageAmount?: number | null; annualPremium?: number | null; renewalDate?: string | null };
      if (res.ok) {
        setForm((p) => ({
          policyName: p.policyName || d.policyName || "",
          policyType: d.policyType && (POLICY_TYPES as readonly string[]).includes(d.policyType) ? d.policyType : p.policyType,
          carrierName: p.carrierName || d.carrierName || "",
          policyNumber: p.policyNumber || d.policyNumber || "",
          coverageAmount: p.coverageAmount || (d.coverageAmount != null ? String(d.coverageAmount) : ""),
          annualPremium: p.annualPremium || (d.annualPremium != null ? String(d.annualPremium) : ""),
          renewalDate: p.renewalDate || (d.renewalDate ?? ""),
        }));
        toast.success("Filled in from your document — review and save.");
      } else {
        toast.error("Couldn't read that document — enter the details manually.");
      }
    } catch { toast.error("Couldn't read that document — enter the details manually."); }
    finally { setAnalyzing(false); }
  }

  async function save() {
    setSaving(true);
    try {
      let documentUrl: string | null = null;
      if (file) documentUrl = await uploadFile(file, "insurance");
      const coverageCents = form.coverageAmount.trim() ? Math.round(Number(form.coverageAmount.replace(/[,$]/g, "")) * 100) : null;
      const premiumCents = form.annualPremium.trim() ? Math.round(Number(form.annualPremium.replace(/[,$]/g, "")) * 100) : null;
      await createMut.mutateAsync({
        policyName: form.policyName.trim(),
        policyType: form.policyType,
        carrierName: form.carrierName.trim() || undefined,
        policyNumber: form.policyNumber.trim() || undefined,
        coverageAmountCents: coverageCents != null && !Number.isNaN(coverageCents) ? coverageCents : null,
        annualPremiumCents: premiumCents != null && !Number.isNaN(premiumCents) ? premiumCents : null,
        renewalDate: form.renewalDate ? dateInputToISO(form.renewalDate) : undefined,
        holderUserId: myUserId || null,
        holderName: myName,
        documentUrl,
      });
      toast.success("Added to your insurance");
      setOpen(false); reset(); onAdded?.();
    } catch { toast.error("Failed to save. Please try again."); }
    finally { setSaving(false); }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Add</Button>
      {open && (
        <DialogShell
          title="Add an insurance policy"
          subtitle="Only you and compliance administrators can see this."
          onClose={() => { if (!saving) { setOpen(false); reset(); } }}
          footer={<>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={!form.policyName.trim() || saving || analyzing}>{saving ? "Saving…" : "Save"}</Button>
          </>}
        >
          <FilePicker file={file} setFile={setFile} onAnalyze={analyze} analyzing={analyzing} accept=".pdf,.png,.jpg,.jpeg,.webp" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Policy name *</label>
              <input className="input w-full" value={form.policyName} onChange={set("policyName")} placeholder="e.g. Professional Liability" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <select className="input w-full" value={form.policyType} onChange={set("policyType")}>
                {POLICY_TYPES.map((t) => <option key={t} value={t}>{POLICY_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Carrier</label>
              <input className="input w-full" value={form.carrierName} onChange={set("carrierName")} placeholder="Insurer" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Policy number</label>
              <input className="input w-full" value={form.policyNumber} onChange={set("policyNumber")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Renews</label>
              <input type="date" className="input w-full" value={form.renewalDate} onChange={set("renewalDate")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Coverage ($)</label>
              <input inputMode="numeric" className="input w-full" value={form.coverageAmount} onChange={set("coverageAmount")} placeholder="1000000" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Annual premium ($)</label>
              <input inputMode="numeric" className="input w-full" value={form.annualPremium} onChange={set("annualPremium")} placeholder="2400" />
            </div>
          </div>
        </DialogShell>
      )}
    </>
  );
}

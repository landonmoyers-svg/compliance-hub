"use client";

import { useState, useMemo, useRef } from "react";
import { Shield, Plus, Search, Upload, FileText, Sparkles, X } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, daysUntil, isExpired, dateInputToISO } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import { PersonSelect } from "@/components/shared/person-select";
import { PersonLink } from "@/components/shared/person-link";
import { FileLink } from "@/components/shared/file-link";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import type { InsurancePolicyRecord } from "@/lib/data/schema";
import { toast } from "sonner";

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

const MAX_MB = 15;

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = reader.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Returns the media type if the file can be sent to the AI extractor, else null. */
function analyzableMedia(file: File): string | null {
  const t = file.type;
  if (t === "application/pdf" || t.startsWith("image/")) return t;
  return null;
}

/* ----------------------------- dialog ------------------------------- */

interface PolicyForm {
  policyName: string;
  policyType: string;
  carrierName: string;
  policyNumber: string;
  coverageAmountCents: string;
  annualPremiumCents: string;
  renewalDate: string;
  holderUserId: string | null;
  holderName: string;
}

const EMPTY: PolicyForm = {
  policyName: "",
  policyType: "malpractice",
  carrierName: "",
  policyNumber: "",
  coverageAmountCents: "",
  annualPremiumCents: "",
  renewalDate: "",
  holderUserId: null,
  holderName: "",
};

function PolicyDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: InsurancePolicyRecord;
  onClose: () => void;
  onSave: (data: PolicyForm, file: File | null) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PolicyForm>(
    initial
      ? {
          policyName: initial.policyName,
          policyType: initial.policyType,
          carrierName: initial.carrierName ?? "",
          policyNumber: initial.policyNumber ?? "",
          coverageAmountCents: initial.coverageAmountCents != null ? String(initial.coverageAmountCents / 100) : "",
          annualPremiumCents: initial.annualPremiumCents != null ? String(initial.annualPremiumCents / 100) : "",
          renewalDate: initial.renewalDate ?? "",
          holderUserId: initial.holderUserId ?? null,
          holderName: initial.holderName ?? "",
        }
      : EMPTY,
  );
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set =
    (k: keyof PolicyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  // Read the uploaded policy with the AI extractor and fill in blank fields.
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
          ...p,
          policyName: p.policyName || d.policyName || "",
          policyType: p.policyType && p.policyType !== "malpractice" ? p.policyType : (d.policyType || p.policyType),
          carrierName: p.carrierName || d.carrierName || "",
          policyNumber: p.policyNumber || d.policyNumber || "",
          coverageAmountCents: p.coverageAmountCents || (d.coverageAmount != null ? String(d.coverageAmount) : ""),
          annualPremiumCents: p.annualPremiumCents || (d.annualPremium != null ? String(d.annualPremium) : ""),
          renewalDate: p.renewalDate || (d.renewalDate ?? ""),
        }));
        toast.success("Filled in from the document — review and save.");
      } else {
        toast.error("Couldn't read that document — enter the details manually.");
      }
    } catch { toast.error("Couldn't read that document — enter the details manually."); }
    finally { setAnalyzing(false); }
  }

  function pickFile(f: File) {
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`File too large (max ${MAX_MB}MB).`); return; }
    setFile(f);
    if (analyzableMedia(f)) void analyze(f);
  }

  const coverageNum = parseFloat(form.coverageAmountCents);
  const premiumNum = parseFloat(form.annualPremiumCents);
  const coverageValid = form.coverageAmountCents === "" || (!isNaN(coverageNum) && coverageNum >= 0);
  const premiumValid = form.annualPremiumCents === "" || (!isNaN(premiumNum) && premiumNum >= 0);
  const canSave = form.policyName.trim() !== "" && coverageValid && premiumValid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit policy" : "Add policy"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Policy document <span className="font-normal text-muted-foreground">(PDF/image — we’ll read it and fill in the details below)</span></label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
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
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="size-4" /> Upload policy
                </Button>
                {initial?.documentUrl && <span className="text-xs text-muted-foreground">A document is already attached.</span>}
              </div>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Policy name *</label>
            <input className="input w-full" value={form.policyName} onChange={set("policyName")} placeholder="e.g. Professional Liability" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <input className="input w-full" value={form.policyType} onChange={set("policyType")} placeholder="malpractice, cyber, general…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Carrier</label>
            <input className="input w-full" value={form.carrierName} onChange={set("carrierName")} placeholder="Insurance carrier" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Policy number</label>
            <input className="input w-full" value={form.policyNumber} onChange={set("policyNumber")} placeholder="Policy #" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Renewal date</label>
            <input type="date" className="input w-full" value={form.renewalDate} onChange={set("renewalDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Coverage amount ($)</label>
            <input type="number" min="0" className="input w-full" value={form.coverageAmountCents} onChange={set("coverageAmountCents")} placeholder="0" />
            {!coverageValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Annual premium ($)</label>
            <input type="number" min="0" className="input w-full" value={form.annualPremiumCents} onChange={set("annualPremiumCents")} placeholder="0" />
            {!premiumValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="sm:col-span-2">
            <PersonSelect
              label="Individual holder (optional — leave blank for org-wide policies)"
              value={{ userId: form.holderUserId, name: form.holderName }}
              onChange={(v) => setForm((p) => ({ ...p, holderUserId: v.userId, holderName: v.name }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form, file)} disabled={!canSave || saving || analyzing}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function InsuranceVaultPage() {
  const { data, isLoading, isError, refetch } = useCollection("insurancePolicies");
  const createMut = useCreate("insurancePolicies");
  const updateMut = useUpdate("insurancePolicies");

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InsurancePolicyRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const policies = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return policies.filter(
      (p) =>
        !q ||
        p.policyName.toLowerCase().includes(q) ||
        (p.carrierName ?? "").toLowerCase().includes(q),
    );
  }, [policies, search]);

  const { sorted, sort, toggle } = useSort(filtered, {
    policyName: (p) => p.policyName,
    type: (p) => p.policyType,
    carrier: (p) => p.carrierName,
    policyNumber: (p) => p.policyNumber,
    coverage: (p) => p.coverageAmountCents,
    premium: (p) => p.annualPremiumCents,
    renewal: (p) => p.renewalDate,
    holder: (p) => p.holderName,
  });

  const stats = useMemo(() => {
    const expired = policies.filter((p) => isExpired(p.renewalDate));
    const expiringSoon = policies.filter((p) => {
      const d = daysUntil(p.renewalDate);
      return d !== null && d >= 0 && d <= 60 && !isExpired(p.renewalDate);
    });
    return { total: policies.length, expired: expired.length, expiringSoon: expiringSoon.length };
  }, [policies]);

  async function handleSave(form: PolicyForm, file: File | null) {
    setSaving(true);
    try {
      const tooCents = (s: string) => {
        const n = parseFloat(String(s).replace(/[,$]/g, ""));
        return s === "" || isNaN(n) ? undefined : Math.round(n * 100);
      };
      let documentUrl: string | null | undefined;
      if (file) documentUrl = await uploadFile(file, "insurance");
      const payload = {
        policyName: form.policyName.trim(),
        policyType: form.policyType.trim() || "malpractice",
        carrierName: form.carrierName.trim() || undefined,
        policyNumber: form.policyNumber.trim() || undefined,
        coverageAmountCents: tooCents(form.coverageAmountCents),
        annualPremiumCents: tooCents(form.annualPremiumCents),
        renewalDate: form.renewalDate ? dateInputToISO(form.renewalDate) : undefined,
        holderUserId: form.holderUserId,
        holderName: form.holderName.trim() || null,
        // Only overwrite the attached document when a new file was uploaded.
        ...(documentUrl !== undefined && { documentUrl }),
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Policy updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Policy added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insurance Vault" />
        <ErrorState message="We couldn't load insurance policies." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <PolicyDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Insurance Vault"
        description="Track all insurance policies, renewal dates, and coverage amounts."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={policies}
              collection="insurancePolicies"
              keyOf={(p) => dupNorm(p.policyNumber) || (dupNorm(p.policyName) + dupNorm(p.carrierName)) || null}
              describe={(p) => ({ title: p.policyName, subtitle: [p.carrierName, p.policyNumber ? `#${p.policyNumber}` : ""].filter(Boolean).join(" · "), hasFile: !!p.documentUrl })}
              score={(p) => (p.documentUrl ? 2 : 0) + (p.policyNumber ? 1 : 0)}
            />
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add policy
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total policies" value={stats.total} icon={Shield} loading={isLoading} />
        <StatCard label="Expiring ≤60d" value={stats.expiringSoon} icon={Shield} tone={stats.expiringSoon ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Expired / lapsed" value={stats.expired} icon={Shield} tone={stats.expired ? "destructive" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search by name or carrier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No policies found"
              description={search ? "Try adjusting your search." : "Add your first insurance policy."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add policy</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Policy name" sortKey="policyName" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Carrier" sortKey="carrier" sort={sort} onToggle={toggle} />
                    <SortHeader label="Policy #" sortKey="policyNumber" sort={sort} onToggle={toggle} />
                    <SortHeader label="Coverage" sortKey="coverage" sort={sort} onToggle={toggle} align="right" />
                    <SortHeader label="Premium / yr" sortKey="premium" sort={sort} onToggle={toggle} align="right" />
                    <SortHeader label="Renewal" sortKey="renewal" sort={sort} onToggle={toggle} />
                    <SortHeader label="Holder" sortKey="holder" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const expired = isExpired(p.renewalDate);
                    const days = daysUntil(p.renewalDate);
                    const expiringSoon = days !== null && days >= 0 && days <= 60;
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Policy name" className="py-3 pr-4 font-medium">
                          {p.documentUrl
                            ? <FileLink path={p.documentUrl} label={p.policyName} className="text-primary hover:underline" />
                            : p.policyName}
                        </td>
                        <td data-label="Type" className="py-3 pr-4 capitalize">{humanizeLabel(p.policyType)}</td>
                        <td data-label="Carrier" className="py-3 pr-4">{p.carrierName ?? "—"}</td>
                        <td data-label="Policy #" className="py-3 pr-4 font-mono text-xs text-muted-foreground">{p.policyNumber ?? "—"}</td>
                        <td data-label="Coverage" className="py-3 pr-4 text-right">{formatCents(p.coverageAmountCents)}</td>
                        <td data-label="Premium / yr" className="py-3 pr-4 text-right">{formatCents(p.annualPremiumCents)}</td>
                        <td data-label="Renewal" className="py-3 pr-4">
                          {p.renewalDate ? (
                            <div>
                              <div className={expired ? "text-destructive" : expiringSoon ? "text-warning" : ""}>{formatDate(p.renewalDate)}</div>
                              {expired ? (
                                <button type="button" onClick={() => setEditing(p)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                                  <Badge variant="destructive" className="mt-1">Expired</Badge>
                                </button>
                              ) : expiringSoon ? (
                                <div className="text-xs text-warning">{days === 0 ? "Today" : `${days}d`}</div>
                              ) : null}
                            </div>
                          ) : "—"}
                        </td>
                        <td data-label="Holder" className="py-3 pr-4">
                          {p.holderName ? <PersonLink userId={p.holderUserId ?? null} name={p.holderName} /> : <span className="text-muted-foreground">Org-wide</span>}
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex gap-2 md:justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                            {p.documentUrl && (
                              <FileLink path={p.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />
                            )}
                            <AdminDeleteButton collection="insurancePolicies" id={p.id} label={p.policyName} noun="policy" onDeleted={() => void refetch()} />
                          </div>
                        </td>
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

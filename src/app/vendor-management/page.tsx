"use client";

import { useState, useMemo } from "react";
import { Building2, Plus, Search, AlertTriangle, ShieldCheck, X, Check } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PageHeader } from "@/components/shared/page-header";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { formatDate } from "@/lib/dates";
import type { VendorRecord } from "@/lib/data/schema";
import { toast } from "sonner";

/* ─── constants ─────────────────────────────────────────────── */

type VendorType = VendorRecord["vendorType"];
type BaaStatus = VendorRecord["baaStatus"];
type VendorStatus = VendorRecord["status"];

const VENDOR_TYPES: VendorType[] = [
  "business_associate",
  "contractor",
  "supplier",
  "service_provider",
  "consultant",
  "other",
];

const TYPE_LABEL: Record<VendorType, string> = {
  business_associate: "Business Associate",
  contractor: "Contractor",
  supplier: "Supplier",
  service_provider: "Service Provider",
  consultant: "Consultant",
  other: "Other",
};

const BAA_STATUSES: BaaStatus[] = ["not_required", "pending", "signed", "expired", "under_review"];

const BAA_LABEL: Record<BaaStatus, string> = {
  not_required: "Not required",
  pending: "Pending",
  signed: "Signed",
  expired: "Expired",
  under_review: "Under review",
};

const BAA_VARIANT: Record<BaaStatus, "success" | "warning" | "destructive" | "secondary"> = {
  not_required: "secondary",
  pending: "warning",
  signed: "success",
  expired: "destructive",
  under_review: "warning",
};

const VENDOR_STATUSES: VendorStatus[] = ["active", "pending", "suspended", "terminated", "under_review"];

const STATUS_LABEL: Record<VendorStatus, string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
  terminated: "Terminated",
  under_review: "Under review",
};

const STATUS_VARIANT: Record<VendorStatus, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  pending: "warning",
  suspended: "warning",
  terminated: "destructive",
  under_review: "secondary",
};

/* ─── helpers ───────────────────────────────────────────────── */

/** A required BAA that isn't signed is a HIPAA compliance gap. */
function isBaaGap(v: { baaRequired: boolean; baaStatus: BaaStatus }): boolean {
  return v.baaRequired && v.baaStatus !== "signed";
}

/** TZ-safe insurance status from a date-only string. */
function insuranceState(date: string | null | undefined): "none" | "expired" | "soon" | "ok" {
  if (!date) return "none";
  const t = new Date(date + "T00:00:00Z").getTime();
  if (Number.isNaN(t)) return "none";
  const now = Date.now();
  if (t < now) return "expired";
  const days = (t - now) / 86_400_000;
  return days <= 60 ? "soon" : "ok";
}

/* ─── form ──────────────────────────────────────────────────── */

interface VendorForm {
  vendorName: string;
  vendorType: VendorType;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  hasAccessToPHI: boolean;
  baaRequired: boolean;
  baaStatus: BaaStatus;
  baaSignedDate: string;
  insuranceExpirationDate: string;
  nextReviewDate: string;
  status: VendorStatus;
  notes: string;
}

function emptyForm(): VendorForm {
  return {
    vendorName: "",
    vendorType: "service_provider",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    hasAccessToPHI: false,
    baaRequired: false,
    baaStatus: "not_required",
    baaSignedDate: "",
    insuranceExpirationDate: "",
    nextReviewDate: "",
    status: "active",
    notes: "",
  };
}

function formFromRecord(v: VendorRecord): VendorForm {
  return {
    vendorName: v.vendorName,
    vendorType: v.vendorType,
    contactName: v.contactName ?? "",
    contactEmail: v.contactEmail ?? "",
    contactPhone: v.contactPhone ?? "",
    hasAccessToPHI: v.hasAccessToPHI,
    baaRequired: v.baaRequired,
    baaStatus: v.baaStatus,
    baaSignedDate: v.baaSignedDate ?? "",
    insuranceExpirationDate: v.insuranceExpirationDate ?? "",
    nextReviewDate: v.nextReviewDate ?? "",
    status: v.status,
    notes: v.notes ?? "",
  };
}

/**
 * Apply the BAA-required sync rule in both directions:
 *  - If the vendor is a business associate OR has PHI access, a BAA is mandatory.
 *  - When mandatory and the status is still "not_required", nudge it to "pending".
 */
function syncBaa(form: VendorForm): VendorForm {
  const required = form.vendorType === "business_associate" || form.hasAccessToPHI || form.baaRequired;
  let baaStatus = form.baaStatus;
  if (required && baaStatus === "not_required") baaStatus = "pending";
  return { ...form, baaRequired: required, baaStatus };
}

/* ─── modal ─────────────────────────────────────────────────── */

function VendorDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: VendorRecord;
  onClose: () => void;
  onSave: (form: VendorForm, files: { baa: File | null; coi: File | null }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<VendorForm>(() =>
    syncBaa(initial ? formFromRecord(initial) : emptyForm()),
  );
  const [baaFile, setBaaFile] = useState<File | null>(null);
  const [coiFile, setCoiFile] = useState<File | null>(null);

  /** Whether baaRequired is forced on (and thus the checkbox is locked). */
  const baaForced = form.vendorType === "business_associate" || form.hasAccessToPHI;

  function update(patch: Partial<VendorForm>) {
    setForm((p) => syncBaa({ ...p, ...patch }));
  }

  const gap = isBaaGap(form);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit vendor" : "Add vendor"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Vendor name *</label>
            <input className="input w-full" value={form.vendorName} onChange={(e) => update({ vendorName: e.target.value })} placeholder="Vendor name" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <select className="input w-full" value={form.vendorType} onChange={(e) => update({ vendorType: e.target.value as VendorType })}>
              {VENDOR_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.status} onChange={(e) => update({ status: e.target.value as VendorStatus })}>
              {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact name</label>
            <input className="input w-full" value={form.contactName} onChange={(e) => update({ contactName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact email</label>
            <input type="email" className="input w-full" value={form.contactEmail} onChange={(e) => update({ contactEmail: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact phone</label>
            <input className="input w-full" value={form.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Next review date</label>
            <input type="date" className="input w-full" value={form.nextReviewDate} onChange={(e) => update({ nextReviewDate: e.target.value })} />
          </div>

          {/* HIPAA / BAA block */}
          <div className="sm:col-span-2 grid gap-3 rounded-lg border border-border bg-secondary/20 p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.hasAccessToPHI}
                  onChange={(e) => update({ hasAccessToPHI: e.target.checked })}
                />
                Has access to PHI
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 disabled:opacity-60"
                  checked={form.baaRequired}
                  disabled={baaForced}
                  onChange={(e) => update({ baaRequired: e.target.checked })}
                />
                BAA required
              </label>
            </div>
            {baaForced && (
              <p className="text-xs text-muted-foreground">
                A BAA is mandatory for business associates and any vendor with PHI access — this cannot be unchecked.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">BAA status</label>
                <select className="input w-full" value={form.baaStatus} onChange={(e) => update({ baaStatus: e.target.value as BaaStatus })}>
                  {BAA_STATUSES.map((s) => <option key={s} value={s}>{BAA_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">BAA signed date</label>
                <input type="date" className="input w-full" value={form.baaSignedDate} onChange={(e) => update({ baaSignedDate: e.target.value })} />
              </div>
            </div>

            {gap && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                A BAA is required but not signed — this is a HIPAA compliance gap.
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Signed BAA document</label>
              <div className="flex items-center gap-3">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
                  <Plus className="size-4" />
                  {baaFile ? baaFile.name : "Upload the signed BAA (PDF)"}
                  <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setBaaFile(e.target.files?.[0] ?? null)} />
                </label>
                {initial?.baaDocumentUrl && !baaFile && <FileLink path={initial.baaDocumentUrl} label="Current" className="shrink-0 text-sm text-primary hover:underline" />}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Insurance expiration date</label>
            <input type="date" className="input w-full" value={form.insuranceExpirationDate} onChange={(e) => update({ insuranceExpirationDate: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Certificate of insurance (COI)</label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
                <Plus className="size-4" />
                {coiFile ? coiFile.name : "Upload the certificate of insurance (PDF)"}
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setCoiFile(e.target.files?.[0] ?? null)} />
              </label>
              {initial?.insuranceDocumentUrl && !coiFile && <FileLink path={initial.insuranceDocumentUrl} label="Current" className="shrink-0 text-sm text-primary hover:underline" />}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea className="input w-full min-h-[60px] resize-y" value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form, { baa: baaFile, coi: coiFile })} disabled={!form.vendorName.trim() || saving}>
            {saving ? "Saving…" : <><Check className="size-3" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────── */

export default function VendorManagementPage() {
  const { data, isLoading, isError, refetch } = useCollection("vendors");
  const createMut = useCreate("vendors");
  const updateMut = useUpdate("vendors");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<VendorStatus | "all">("all");
  const [filterType, setFilterType] = useState<VendorType | "all">("all");
  const [editing, setEditing] = useState<VendorRecord | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  const vendors = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendors.filter((v) => {
      if (filterStatus !== "all" && v.status !== filterStatus) return false;
      if (filterType !== "all" && v.vendorType !== filterType) return false;
      if (q && !v.vendorName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vendors, search, filterStatus, filterType]);

  const { sorted, sort, toggle } = useSort(filtered, {
    vendor: (v) => v.vendorName,
    type: (v) => TYPE_LABEL[v.vendorType],
    baa: (v) => BAA_LABEL[v.baaStatus],
    phi: (v) => (v.hasAccessToPHI ? "Yes" : "No"),
    insurance: (v) => v.insuranceExpirationDate,
    status: (v) => STATUS_LABEL[v.status],
  });

  const stats = useMemo(() => ({
    total: vendors.length,
    active: vendors.filter((v) => v.status === "active").length,
    baaGaps: vendors.filter(isBaaGap).length,
    phiAccess: vendors.filter((v) => v.hasAccessToPHI).length,
  }), [vendors]);

  async function handleSave(form: VendorForm, files: { baa: File | null; coi: File | null }) {
    const synced = syncBaa(form);
    setSaving(true);
    try {
      let baaDocumentUrl: string | undefined;
      let insuranceDocumentUrl: string | undefined;
      if (files.baa) {
        try { baaDocumentUrl = await uploadFile(files.baa, "vendor-baas"); }
        catch { toast.error("Couldn't upload the BAA — saving other changes."); }
      }
      if (files.coi) {
        try { insuranceDocumentUrl = await uploadFile(files.coi, "vendor-coi"); }
        catch { toast.error("Couldn't upload the COI — saving other changes."); }
      }
      const payload = {
        vendorName: synced.vendorName.trim(),
        vendorType: synced.vendorType,
        contactName: synced.contactName.trim() || undefined,
        contactEmail: synced.contactEmail.trim() || undefined,
        contactPhone: synced.contactPhone.trim() || undefined,
        hasAccessToPHI: synced.hasAccessToPHI,
        baaRequired: synced.baaRequired,
        baaStatus: synced.baaStatus,
        baaSignedDate: synced.baaSignedDate || null,
        insuranceExpirationDate: synced.insuranceExpirationDate || null,
        nextReviewDate: synced.nextReviewDate || null,
        status: synced.status,
        notes: synced.notes.trim() || undefined,
        ...(baaDocumentUrl && { baaDocumentUrl }),
        ...(insuranceDocumentUrl && { insuranceDocumentUrl }),
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Vendor updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Vendor added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save vendor");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vendor Management" />
        <ErrorState message="We couldn't load vendors." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <VendorDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Vendor Management"
        description="Track business associates, BAA status, PHI access, and insurance certificates."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={vendors}
              collection="vendors"
              keyOf={(v) => dupNorm(v.vendorName) || null}
              describe={(v) => ({ title: v.vendorName, subtitle: [v.vendorType, v.contactEmail].filter(Boolean).join(" · ") })}
              score={(v) => (v.baaStatus === "signed" ? 2 : 0) + (v.contactEmail ? 1 : 0)}
            />
            <Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add vendor</Button>
          </div>
        }
      />

      {!isLoading && stats.baaGaps > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>
            {stats.baaGaps} vendor{stats.baaGaps > 1 ? "s require" : " requires"} a Business Associate Agreement that is not signed — a HIPAA compliance gap.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total vendors" value={stats.total} icon={Building2} loading={isLoading} />
        <StatCard label="Active" value={stats.active} icon={Building2} tone="success" loading={isLoading} />
        <StatCard label="BAA gaps" value={stats.baaGaps} icon={AlertTriangle} tone={stats.baaGaps ? "destructive" : "default"} loading={isLoading} />
        <StatCard label="PHI-access vendors" value={stats.phiAccess} icon={ShieldCheck} tone={stats.phiAccess ? "warning" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search vendors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search vendors"
              />
            </div>
            <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value as VendorType | "all")} aria-label="Filter by type">
              <option value="all">All types</option>
              {VENDOR_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as VendorStatus | "all")} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {VENDOR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No vendors found"
              description={search || filterStatus !== "all" || filterType !== "all" ? "Try adjusting your search or filters." : "Add your first vendor to start tracking BAAs."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add vendor</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Vendor" sortKey="vendor" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="BAA" sortKey="baa" sort={sort} onToggle={toggle} />
                    <SortHeader label="PHI" sortKey="phi" sort={sort} onToggle={toggle} />
                    <SortHeader label="Insurance exp." sortKey="insurance" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((v) => {
                    const gap = isBaaGap(v);
                    const ins = insuranceState(v.insuranceExpirationDate);
                    return (
                      <tr key={v.id} className={`border-b border-border/50 hover:bg-secondary/20 ${gap ? "bg-destructive/5" : ""}`}>
                        <td data-label="Vendor" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{v.vendorName}</span>
                            {gap && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                                <AlertTriangle className="size-3" /> BAA gap
                              </span>
                            )}
                          </div>
                          {v.contactName && <p className="text-xs text-muted-foreground">{v.contactName}</p>}
                        </td>
                        <td data-label="Type" className="py-3 pr-4 text-muted-foreground">{TYPE_LABEL[v.vendorType]}</td>
                        <td data-label="BAA" className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setEditing(v)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                              <Badge variant={BAA_VARIANT[v.baaStatus]}>{BAA_LABEL[v.baaStatus]}</Badge>
                            </button>
                            {v.baaDocumentUrl && <FileLink path={v.baaDocumentUrl} label="doc" className="text-xs text-primary hover:underline" />}
                          </div>
                        </td>
                        <td data-label="PHI" className="py-3 pr-4">
                          {v.hasAccessToPHI ? (
                            <span className="inline-flex items-center gap-1 text-warning">
                              <ShieldCheck className="size-3.5" /> Yes
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </td>
                        <td data-label="Insurance exp." className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {ins === "none" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className={ins === "expired" ? "text-destructive font-medium" : ins === "soon" ? "text-warning font-medium" : ""}>
                                {formatDate(v.insuranceExpirationDate)}
                                {ins === "expired" && " (expired)"}
                                {ins === "soon" && " (soon)"}
                              </span>
                            )}
                            {v.insuranceDocumentUrl && <FileLink path={v.insuranceDocumentUrl} label="COI" className="text-xs text-primary hover:underline" />}
                          </div>
                        </td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditing(v)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex gap-1 md:justify-end">
                            <VersionHistoryButton entityType="vendors" entityId={v.id} title={v.vendorName} />
                            <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>Edit</Button>
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

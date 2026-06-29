"use client";

import { useState, useMemo } from "react";
import { Building2, Plus, Search, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";
import { formatDate, isExpired, daysUntil } from "@/lib/dates";
import { toast } from "sonner";

interface Vendor {
  id: string;
  name: string;
  category: "ehr" | "billing" | "cleaning" | "it" | "pharmacy" | "medical_equipment" | "lab" | "other";
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  baaRequired: boolean;
  baaStatus: "signed" | "pending" | "not_required" | "expired";
  baaExpirationDate?: string;
  insuranceCertExpDate?: string;
  contractExpDate?: string;
  notes?: string;
  status: "active" | "inactive";
}

const SEED: Vendor[] = [
  { id: "v1", name: "Epic Systems", category: "ehr", contactName: "Support Team", website: "https://www.epic.com", baaRequired: true, baaStatus: "signed", baaExpirationDate: "2027-01-01", insuranceCertExpDate: "2026-12-31", contractExpDate: "2027-01-01", status: "active" },
  { id: "v2", name: "ABC Medical Billing", category: "billing", contactName: "Jane Smith", contactEmail: "jane@abcbilling.com", contactPhone: "555-0100", baaRequired: true, baaStatus: "signed", baaExpirationDate: "2026-09-30", contractExpDate: "2026-09-30", status: "active" },
  { id: "v3", name: "CleanCare Services", category: "cleaning", contactName: "Bob Johnson", contactPhone: "555-0200", baaRequired: false, baaStatus: "not_required", insuranceCertExpDate: "2026-11-30", contractExpDate: "2026-12-31", status: "active" },
  { id: "v4", name: "MedLab Reference", category: "lab", baaRequired: true, baaStatus: "pending", contractExpDate: "2026-08-31", status: "active" },
  { id: "v5", name: "OldIT Consulting", category: "it", baaRequired: true, baaStatus: "expired", baaExpirationDate: "2025-12-31", status: "inactive" },
];

const CATEGORY_LABEL: Record<Vendor["category"], string> = {
  ehr: "EHR",
  billing: "Billing",
  cleaning: "Cleaning",
  it: "IT",
  pharmacy: "Pharmacy",
  medical_equipment: "Medical Equipment",
  lab: "Laboratory",
  other: "Other",
};

const BAA_VARIANT: Record<Vendor["baaStatus"], "success" | "warning" | "destructive" | "secondary"> = {
  signed: "success",
  pending: "warning",
  not_required: "secondary",
  expired: "destructive",
};

const BAA_LABEL: Record<Vendor["baaStatus"], string> = {
  signed: "BAA Signed",
  pending: "BAA Pending",
  not_required: "BAA N/A",
  expired: "BAA Expired",
};

interface VendorForm {
  name: string;
  category: Vendor["category"];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  baaRequired: boolean;
  baaStatus: Vendor["baaStatus"];
  baaExpirationDate: string;
  insuranceCertExpDate: string;
  contractExpDate: string;
  notes: string;
}

function defaultForm(): VendorForm {
  return { name: "", category: "other", contactName: "", contactEmail: "", contactPhone: "", website: "", baaRequired: false, baaStatus: "not_required", baaExpirationDate: "", insuranceCertExpDate: "", contractExpDate: "", notes: "" };
}

export default function VendorManagementPage() {
  const [vendors, setVendors] = useState<Vendor[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<Vendor["category"] | "all">("all");
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VendorForm>(defaultForm());

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vendors.filter((v) => {
      if (filterCategory !== "all" && v.category !== filterCategory) return false;
      if (q && !v.name.toLowerCase().includes(q) && !(v.contactName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vendors, search, filterCategory]);

  const stats = useMemo(() => ({
    active: vendors.filter((v) => v.status === "active").length,
    baaNeeded: vendors.filter((v) => v.status === "active" && v.baaRequired && v.baaStatus !== "signed").length,
    expiringSoon: vendors.filter((v) => {
      const d = daysUntil(v.contractExpDate);
      return d !== null && d >= 0 && d <= 60;
    }).length,
  }), [vendors]);

  function openNew() {
    setForm(defaultForm());
    setEditing("new");
  }

  function openEdit(v: Vendor) {
    setForm({
      name: v.name,
      category: v.category,
      contactName: v.contactName ?? "",
      contactEmail: v.contactEmail ?? "",
      contactPhone: v.contactPhone ?? "",
      website: v.website ?? "",
      baaRequired: v.baaRequired,
      baaStatus: v.baaStatus,
      baaExpirationDate: v.baaExpirationDate ?? "",
      insuranceCertExpDate: v.insuranceCertExpDate ?? "",
      contractExpDate: v.contractExpDate ?? "",
      notes: v.notes ?? "",
    });
    setEditing(v);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Vendor name is required"); return; }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 200));
    if (editing === "new") {
      setVendors((prev) => [{
        id: `v-${Date.now()}`,
        name: form.name.trim(),
        category: form.category,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        website: form.website.trim() || undefined,
        baaRequired: form.baaRequired,
        baaStatus: form.baaRequired ? form.baaStatus : "not_required",
        baaExpirationDate: form.baaExpirationDate || undefined,
        insuranceCertExpDate: form.insuranceCertExpDate || undefined,
        contractExpDate: form.contractExpDate || undefined,
        notes: form.notes.trim() || undefined,
        status: "active",
      }, ...prev]);
      toast.success("Vendor added");
    } else if (editing) {
      setVendors((prev) => prev.map((v) => v.id === (editing as Vendor).id ? {
        ...v,
        name: form.name.trim(),
        category: form.category,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        website: form.website.trim() || undefined,
        baaRequired: form.baaRequired,
        baaStatus: form.baaRequired ? form.baaStatus : "not_required",
        baaExpirationDate: form.baaExpirationDate || undefined,
        insuranceCertExpDate: form.insuranceCertExpDate || undefined,
        contractExpDate: form.contractExpDate || undefined,
        notes: form.notes.trim() || undefined,
      } : v));
      toast.success("Vendor updated");
    }
    setSaving(false);
    setEditing(null);
  }

  const set = (k: keyof VendorForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && !saving && setEditing(null)}
        >
          <div className="w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">{editing === "new" ? "Add vendor" : "Edit vendor"}</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Vendor name *</label>
                <input className="input w-full" value={form.name} onChange={set("name")} placeholder="Vendor name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <select className="input w-full" value={form.category} onChange={set("category")}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Website</label>
                <input type="url" className="input w-full" value={form.website} onChange={set("website")} placeholder="https://…" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact name</label>
                <input className="input w-full" value={form.contactName} onChange={set("contactName")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact email</label>
                <input type="email" className="input w-full" value={form.contactEmail} onChange={set("contactEmail")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact phone</label>
                <input className="input w-full" value={form.contactPhone} onChange={set("contactPhone")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contract expiration</label>
                <input type="date" className="input w-full" value={form.contractExpDate} onChange={set("contractExpDate")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Insurance cert expires</label>
                <input type="date" className="input w-full" value={form.insuranceCertExpDate} onChange={set("insuranceCertExpDate")} />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="baaReq"
                  type="checkbox"
                  checked={form.baaRequired}
                  onChange={(e) => setForm((p) => ({ ...p, baaRequired: e.target.checked, baaStatus: e.target.checked ? "pending" : "not_required" }))}
                  className="size-4"
                />
                <label htmlFor="baaReq" className="text-sm">BAA required (HIPAA)</label>
              </div>
              {form.baaRequired && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">BAA status</label>
                  <select className="input w-full" value={form.baaStatus} onChange={set("baaStatus")}>
                    <option value="signed">Signed</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
              )}
              {form.baaRequired && form.baaStatus === "signed" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">BAA expiration</label>
                  <input type="date" className="input w-full" value={form.baaExpirationDate} onChange={set("baaExpirationDate")} />
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea className="input w-full min-h-[60px] resize-y" value={form.notes} onChange={set("notes")} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title="Vendor Management"
        description="Track business associates, contracts, BAA status, and insurance certificates."
        actions={<Button onClick={openNew}><Plus className="size-4" /> Add vendor</Button>}
      />

      {stats.baaNeeded > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {stats.baaNeeded} active vendor{stats.baaNeeded > 1 ? "s require" : " requires"} a Business Associate Agreement (BAA) but it is not yet signed.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active vendors" value={stats.active} icon={Building2} tone="success" />
        <StatCard label="BAA needed" value={stats.baaNeeded} icon={Building2} tone={stats.baaNeeded ? "warning" : "default"} />
        <StatCard label="Contracts expiring ≤60d" value={stats.expiringSoon} icon={Building2} tone={stats.expiringSoon ? "warning" : "default"} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className="input w-full pl-9" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)}>
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No vendors found" description={search || filterCategory !== "all" ? "Try adjusting your filters." : "Add your first vendor."} action={<Button onClick={openNew}><Plus className="size-4" /> Add vendor</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground bg-secondary/30">
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">BAA</th>
                <th className="px-4 py-3 font-medium">Contract exp.</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const contractExpiring = v.contractExpDate && !isExpired(v.contractExpDate) && (daysUntil(v.contractExpDate) ?? 999) <= 60;
                return (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{v.name}</p>
                        {v.website && (
                          <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <Badge variant={v.status === "active" ? "success" : "secondary"} className="mt-0.5 text-xs">{v.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{CATEGORY_LABEL[v.category]}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.contactName && <p>{v.contactName}</p>}
                      {v.contactEmail && <p className="text-xs">{v.contactEmail}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={BAA_VARIANT[v.baaStatus]}>{BAA_LABEL[v.baaStatus]}</Badge>
                      {v.baaExpirationDate && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Exp: {formatDate(v.baaExpirationDate)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {v.contractExpDate ? (
                        <span className={contractExpiring ? "text-warning" : isExpired(v.contractExpDate) ? "text-destructive" : ""}>
                          {formatDate(v.contractExpDate)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { Fragment, useState, useMemo, useRef } from "react";
import {
  Building2, Plus, Search, Sparkles, Upload, X, FileText, Shield, ShieldCheck,
  Handshake, ClipboardCheck, ScrollText, Receipt, Landmark, Package, FileSignature,
  type LucideIcon,
} from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { getSignedUrl, uploadFile } from "@/lib/storage";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { FileLink } from "@/components/shared/file-link";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import { EntityRecordsPanel } from "@/components/shared/entity-records-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, daysUntil, isExpired, isExpiringSoon, parseDate, dateInputToISO } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import { businessRecordCategories } from "@/lib/data/schema";
import type { BusinessRecord, BusinessRecordCategory } from "@/lib/data/schema";
import { toast } from "sonner";

/* ------------------------------ categories ------------------------------ */

const CATEGORY_ORDER: BusinessRecordCategory[] = [...businessRecordCategories];
const CATEGORY_LABEL: Record<BusinessRecordCategory, string> = {
  license: "Business Licenses & Permits",
  contract: "Contracts & Agreements",
  insurance: "Entity Insurance",
  baa: "Business Associate Agreements",
  lease: "Leases & Rentals",
  payer_contract: "Group Payer Contracts",
  audit: "Audits & Accreditation",
  vendor: "Vendor Agreements",
  formation: "Formation & Governance",
  tax: "Tax & Financial",
  other: "Other Records",
};
const CATEGORY_ICON: Record<BusinessRecordCategory, LucideIcon> = {
  license: ScrollText,
  contract: FileSignature,
  insurance: Shield,
  baa: ShieldCheck,
  lease: Building2,
  payer_contract: Handshake,
  audit: ClipboardCheck,
  vendor: Package,
  formation: Landmark,
  tax: Receipt,
  other: FileText,
};
const catLabel = (c: string) => CATEGORY_LABEL[c as BusinessRecordCategory] ?? humanizeLabel(c);

/* ------------------------------ status ------------------------------ */

type DerivedStatus = "active" | "expiring_soon" | "expired" | "terminated" | "pending" | "no_expiry";
const STATUS_LABEL: Record<DerivedStatus, string> = {
  active: "Active", expiring_soon: "Renewing soon", expired: "Expired",
  terminated: "Terminated", pending: "Pending", no_expiry: "No end date",
};
const STATUS_VARIANT: Record<DerivedStatus, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success", expiring_soon: "warning", expired: "destructive",
  terminated: "secondary", pending: "warning", no_expiry: "secondary",
};

/** Derived status: an expiration date always wins; otherwise fall back to the
 *  manual status (a perpetual BAA is "active", a cancelled contract "terminated"). */
function recordStatus(r: Pick<BusinessRecord, "expirationDate" | "status">): DerivedStatus {
  if (r.status === "terminated") return "terminated";
  if (r.expirationDate) {
    if (isExpired(r.expirationDate)) return "expired";
    if (isExpiringSoon(r.expirationDate, 60)) return "expiring_soon";
    return "active";
  }
  if (r.status === "pending") return "pending";
  if (r.status === "expired") return "expired";
  return r.status === "active" ? "active" : "no_expiry";
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** Best-effort media type from a stored file path/extension. */
function mediaFromName(name: string): string {
  const ext = name.toLowerCase().split("?")[0].split(".").pop() ?? "";
  const map: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  return map[ext] ?? "application/octet-stream";
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = reader.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function analyzableMedia(file: File): string | null {
  const t = file.type;
  if (t === "application/pdf" || t.startsWith("image/")) return t;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return null;
}

/* ------------------------------ duplicate key ------------------------------ */

function dupKey(r: BusinessRecord): string | null {
  const identity = dupNorm(r.identifier) || (dupNorm(r.title) + dupNorm(r.counterparty));
  if (!identity) return null;
  return `${r.category}::${identity}`;
}
function completeness(r: BusinessRecord): number {
  let s = 0;
  if (r.documentUrl) s += 3;
  if (r.identifier) s += 1;
  if (r.expirationDate) s += 1;
  if (r.counterparty) s += 1;
  return s;
}

/* ------------------------------ form ------------------------------ */

interface FormState {
  title: string;
  category: BusinessRecordCategory;
  counterparty: string;
  identifier: string;
  issuingAuthority: string;
  status: "" | "active" | "pending" | "expired" | "terminated";
  effectiveDate: string;
  expirationDate: string;
  amount: string; // dollars
  locationId: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  title: "", category: "contract", counterparty: "", identifier: "", issuingAuthority: "",
  status: "", effectiveDate: "", expirationDate: "", amount: "", locationId: "", notes: "",
};

function RecordDialog({ initial, locations, onClose, onSave, saving }: {
  initial?: BusinessRecord;
  locations: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: FormState, file: File | null) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          title: initial.title,
          category: initial.category,
          counterparty: initial.counterparty ?? "",
          identifier: initial.identifier ?? "",
          issuingAuthority: initial.issuingAuthority ?? "",
          status: (initial.status ?? "") as FormState["status"],
          effectiveDate: (initial.effectiveDate ?? "").slice(0, 10),
          expirationDate: (initial.expirationDate ?? "").slice(0, 10),
          amount: initial.amountCents != null ? String(initial.amountCents / 100) : "",
          locationId: initial.locationId ?? "",
          notes: initial.notes ?? "",
        }
      : EMPTY_FORM,
  );
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function analyze(f: File) {
    const media = analyzableMedia(f);
    if (!media) return;
    setAnalyzing(true);
    try {
      const fileBase64 = await fileToBase64(f);
      const res = await fetch("/api/ai/business-record-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mediaType: media }),
      });
      if (res.status === 429) { toast.error("Daily AI limit reached — enter the details manually."); return; }
      const d = await res.json() as {
        category?: string; title?: string; counterparty?: string | null; identifier?: string | null;
        issuingAuthority?: string | null; status?: string | null; effectiveDate?: string | null;
        expirationDate?: string | null; amount?: number | null;
      };
      if (res.ok) {
        const validCat = d.category && (CATEGORY_ORDER as readonly string[]).includes(d.category) ? (d.category as BusinessRecordCategory) : null;
        const validStatus = d.status && ["active", "pending", "expired", "terminated"].includes(d.status) ? (d.status as FormState["status"]) : null;
        setForm((p) => ({
          ...p,
          title: p.title || d.title || "",
          category: validCat ?? p.category,
          counterparty: p.counterparty || (d.counterparty ?? ""),
          identifier: p.identifier || (d.identifier ?? ""),
          issuingAuthority: p.issuingAuthority || (d.issuingAuthority ?? ""),
          status: p.status || (validStatus ?? ""),
          effectiveDate: p.effectiveDate || (d.effectiveDate ?? ""),
          expirationDate: p.expirationDate || (d.expirationDate ?? ""),
          amount: p.amount || (d.amount != null ? String(d.amount) : ""),
        }));
        toast.success("Filled in from the document — review and save.");
      } else {
        toast.error("Couldn't read that document — enter the details manually.");
      }
    } catch { toast.error("Couldn't read that document — enter the details manually."); }
    finally { setAnalyzing(false); }
  }

  const amountNum = parseFloat(form.amount);
  const amountValid = form.amount === "" || (!isNaN(amountNum) && amountNum >= 0);
  const valid = form.title.trim() !== "" && amountValid &&
    (form.expirationDate === "" || form.effectiveDate === "" || parseDate(form.expirationDate)! >= parseDate(form.effectiveDate)!);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit business record" : "Add business record"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) void analyze(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={analyzing || saving}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-3 text-sm text-muted-foreground hover:bg-secondary/20 disabled:opacity-60">
              {analyzing ? <><Sparkles className="size-4 animate-pulse text-primary" /> Reading the document…</> : <><Upload className="size-4" /> {file ? file.name : "Upload contract/license/policy — AI fills the fields"}</>}
            </button>
            {file && !analyzing && <p className="flex items-center gap-1 text-xs text-primary"><Sparkles className="size-3" /> Fields prefilled from the document — verify before saving. The file will be attached.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Title *</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="e.g. Murray Clinic Office Lease" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Category</label>
            <select className="input w-full" value={form.category} onChange={set("category")}>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Counterparty</label>
            <input className="input w-full" value={form.counterparty} onChange={set("counterparty")} placeholder="Vendor, landlord, payer, carrier…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Identifier</label>
            <input className="input w-full" value={form.identifier} onChange={set("identifier")} placeholder="Contract / license / policy #" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Issuing authority</label>
            <input className="input w-full" value={form.issuingAuthority} onChange={set("issuingAuthority")} placeholder="City, state agency, accreditor…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Effective date</label>
            <input type="date" className="input w-full" value={form.effectiveDate} onChange={set("effectiveDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiration / renewal date</label>
            <input type="date" className="input w-full" value={form.expirationDate} onChange={set("expirationDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.status} onChange={set("status")}>
              <option value="">— From dates —</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="terminated">Terminated</option>
            </select>
            <p className="text-xs text-muted-foreground">Used when there&apos;s no expiration date; otherwise the date decides.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount / value ($)</label>
            <input type="number" min="0" className="input w-full" value={form.amount} onChange={set("amount")} placeholder="Contract value, rent, coverage…" />
            {!amountValid && <p className="text-xs text-destructive">Must be a positive number</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Location</label>
            <select className="input w-full" value={form.locationId} onChange={set("locationId")}>
              <option value="">— Organization-wide —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={set("notes")} placeholder="Anything worth remembering about this record." />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form, file)} disabled={!valid || saving || analyzing}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- entity-file (grouped) view -------------------- */

interface Leaf { key: string; items: BusinessRecord[]; }
interface CategoryFile { category: BusinessRecordCategory; leaves: Leaf[]; count: number; }

/** Recency for active→oldest ordering: expiration, else effective, else created. */
function recency(r: BusinessRecord): number {
  const d = parseDate(r.expirationDate) ?? parseDate(r.effectiveDate) ?? parseDate(r.createdDate);
  return d ? d.getTime() : 0;
}

function buildCategoryFiles(records: BusinessRecord[]): CategoryFile[] {
  const byCat = new Map<BusinessRecordCategory, BusinessRecord[]>();
  for (const r of records) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(r);
    byCat.set(r.category, arr);
  }
  const files: CategoryFile[] = [];
  for (const [category, items] of byCat) {
    // A "leaf" is one renewable record line: same identifier (or same title +
    // counterparty) = renewals of one thing → newest active, priors superseded.
    // Distinct records stay side by side.
    const leafMap = new Map<string, Leaf>();
    for (const r of items) {
      const key = dupNorm(r.identifier) || (dupNorm(r.title) + dupNorm(r.counterparty)) || r.id;
      const leaf = leafMap.get(key) ?? { key, items: [] };
      leaf.items.push(r);
      leafMap.set(key, leaf);
    }
    const leaves = [...leafMap.values()]
      .map((l) => ({ ...l, items: [...l.items].sort((a, b) => recency(b) - recency(a)) }))
      .sort((a, b) => recency(b.items[0]) - recency(a.items[0]) || a.items[0].title.localeCompare(b.items[0].title));
    files.push({ category, leaves, count: items.length });
  }
  return files.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
}

function EntityFileView({ files, locName, onEdit, onDeleted }: {
  files: CategoryFile[];
  locName: (id: string | null | undefined) => string | null;
  onEdit: (r: BusinessRecord) => void;
  onDeleted: () => void;
}) {
  if (files.length === 0) {
    return <EmptyState icon={Building2} title="No business records found" description="Add a record or clear the search." />;
  }
  return (
    <div className="space-y-5">
      {files.map((f) => {
        const Icon = CATEGORY_ICON[f.category];
        return (
          <div key={f.category} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2.5">
              <Icon className="size-4 text-muted-foreground" />
              <span className="font-medium">{CATEGORY_LABEL[f.category]}</span>
              <span className="ml-auto text-xs text-muted-foreground">{f.count} on file</span>
            </div>
            <div className="divide-y divide-border/60">
              {f.leaves.map((leaf) => {
                const [current, ...history] = leaf.items;
                const st = recordStatus(current);
                const days = daysUntil(current.expirationDate);
                const loc = locName(current.locationId);
                return (
                  <div key={leaf.key} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Current</span>
                      <span className="font-medium">{current.title}</span>
                      {current.counterparty && <span className="text-xs text-muted-foreground">{current.counterparty}</span>}
                      {current.identifier && <span className="text-xs text-muted-foreground">#{current.identifier}</span>}
                      {current.amountCents != null && <span className="text-xs text-muted-foreground">{formatCents(current.amountCents)}</span>}
                      {loc && <span className="text-xs text-muted-foreground">· {loc}</span>}
                      <button type="button" onClick={() => onEdit(current)} className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                        <Badge variant={STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge>
                      </button>
                      <span className="text-sm text-muted-foreground">
                        {current.expirationDate ? <>exp {formatDate(current.expirationDate)}{days !== null && st !== "no_expiry" && st !== "terminated" && <> · {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `${days}d left`}</>}</> : (current.effectiveDate ? `since ${formatDate(current.effectiveDate)}` : "no end date")}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEdit(current)}>Edit</Button>
                        {current.documentUrl && <FileLink path={current.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />}
                        <VersionHistoryButton entityType="business_records" entityId={current.id} title={current.title} />
                        <AdminDeleteButton collection="businessRecords" id={current.id} label={current.title} noun="record" onDeleted={onDeleted} />
                      </div>
                    </div>
                    {history.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-border/60 pl-3">
                        {history.map((h) => (
                          <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                            <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">Superseded</span>
                            <span>{h.title}</span>
                            {h.identifier && <span className="text-xs">#{h.identifier}</span>}
                            <span className="text-xs">{h.expirationDate ? `exp ${formatDate(h.expirationDate)}` : h.effectiveDate ? `from ${formatDate(h.effectiveDate)}` : ""}</span>
                            <div className="ml-auto flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => onEdit(h)}>Edit</Button>
                              {h.documentUrl && <FileLink path={h.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-primary hover:underline" />}
                              <AdminDeleteButton collection="businessRecords" id={h.id} label={h.title} noun="record" onDeleted={onDeleted} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

type ViewMode = "overview" | "file" | "list";

export default function BusinessRecordsPage() {
  const { data, isLoading, isError, refetch } = useCollection("businessRecords");
  const locationsQ = useCollection("locations");
  const createMut = useCreate("businessRecords");
  const updateMut = useUpdate("businessRecords");

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<BusinessRecordCategory | "all">("all");
  const [view, setView] = useState<ViewMode>("overview");
  const [editing, setEditing] = useState<BusinessRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const records = useMemo(() => data ?? [], [data]);
  const locations = useMemo(() => (locationsQ.data ?? []).map((l) => ({ id: l.id, name: l.name })), [locationsQ.data]);
  const locName = useMemo(() => {
    const m = new Map(locations.map((l) => [l.id, l.name] as const));
    return (id: string | null | undefined) => (id ? m.get(id) ?? null : null);
  }, [locations]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (filterCat !== "all" && r.category !== filterCat) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q) ||
        (r.counterparty ?? "").toLowerCase().includes(q) ||
        (r.identifier ?? "").toLowerCase().includes(q);
    });
  }, [records, search, filterCat]);

  const files = useMemo(() => buildCategoryFiles(filtered), [filtered]);

  const { sorted, sort, toggle } = useSort(filtered, {
    title: (r) => r.title,
    category: (r) => catLabel(r.category),
    counterparty: (r) => r.counterparty,
    identifier: (r) => r.identifier,
    expiration: (r) => r.expirationDate,
    amount: (r) => r.amountCents,
    status: (r) => recordStatus(r),
  });

  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0;
    for (const r of records) {
      const s = recordStatus(r);
      if (s === "active") active++;
      else if (s === "expiring_soon") expiring++;
      else if (s === "expired") expired++;
    }
    return { total: records.length, active, expiring, expired };
  }, [records]);

  async function handleSave(form: FormState, file: File | null) {
    setSaving(true);
    try {
      const toCents = (s: string) => { const n = parseFloat(s.replace(/[,$]/g, "")); return s === "" || isNaN(n) ? null : Math.round(n * 100); };
      let documentUrl: string | undefined;
      if (file) {
        try { documentUrl = await uploadFile(file, "business"); }
        catch { toast.error("Couldn't upload the document — saving the details without it."); }
      }
      const payload = {
        title: form.title.trim(),
        category: form.category,
        counterparty: form.counterparty.trim() || null,
        identifier: form.identifier.trim() || null,
        issuingAuthority: form.issuingAuthority.trim() || null,
        status: form.status || null,
        effectiveDate: form.effectiveDate ? dateInputToISO(form.effectiveDate) : null,
        expirationDate: form.expirationDate ? dateInputToISO(form.expirationDate) : null,
        amountCents: toCents(form.amount),
        locationId: form.locationId || null,
        notes: form.notes.trim() || null,
        ...(documentUrl && { documentUrl }),
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Business record updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Business record added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save the record");
    } finally {
      setSaving(false);
    }
  }

  // Re-read every record with an attached document and fill missing fields from
  // the ACTUAL contents. Never overwrites a field that already has a value.
  async function reanalyze() {
    const withDocs = records.filter((r) => r.documentUrl);
    if (withDocs.length === 0) { toast.info("No business documents are attached to analyze. Attach a file first."); return; }
    if (!window.confirm(`Analyze ${withDocs.length} attached document${withDocs.length === 1 ? "" : "s"} with AI? This fills in missing details (counterparty, identifier, dates, amount) and can set the category. Existing values are never overwritten.`)) return;
    setReanalyzing(true);
    const tId = toast.loading(`Analyzing 0/${withDocs.length} documents…`);
    let done = 0, updated = 0;
    try {
      for (const r of withDocs) {
        let fileBase64: string | undefined; let mediaType: string | undefined;
        try {
          const url = await getSignedUrl(r.documentUrl as string);
          if (url) {
            const resp = await fetch(url);
            const blob = await resp.blob();
            const mt = blob.type && blob.type !== "application/octet-stream" ? blob.type : mediaFromName(r.documentUrl as string);
            if (blob.size <= 8 * 1024 * 1024 && (mt === "application/pdf" || mt.startsWith("image/"))) {
              fileBase64 = await blobToBase64(blob); mediaType = mt;
            }
          }
        } catch { /* text-only fallback */ }
        try {
          const res = await fetch("/api/ai/business-record-analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: r.title, category: r.category, counterparty: r.counterparty, identifier: r.identifier, fileBase64, mediaType }),
          });
          if (res.status === 429) { toast.error("Daily AI limit reached — stopping.", { id: tId }); break; }
          const d = await res.json() as { category?: string; counterparty?: string | null; identifier?: string | null; issuingAuthority?: string | null; status?: string | null; effectiveDate?: string | null; expirationDate?: string | null; amount?: number | null };
          if (res.ok) {
            const patch: Partial<BusinessRecord> = {};
            if (d.category && (CATEGORY_ORDER as readonly string[]).includes(d.category) && d.category !== r.category && r.category === "other") patch.category = d.category as BusinessRecordCategory;
            if (!r.counterparty && d.counterparty) patch.counterparty = d.counterparty;
            if (!r.identifier && d.identifier) patch.identifier = d.identifier;
            if (!r.issuingAuthority && d.issuingAuthority) patch.issuingAuthority = d.issuingAuthority;
            if (!r.status && d.status && ["active", "pending", "expired", "terminated"].includes(d.status)) patch.status = d.status as BusinessRecord["status"];
            if (!r.effectiveDate && d.effectiveDate) patch.effectiveDate = dateInputToISO(d.effectiveDate);
            if (!r.expirationDate && d.expirationDate) patch.expirationDate = dateInputToISO(d.expirationDate);
            if (r.amountCents == null && d.amount != null) patch.amountCents = Math.round(d.amount * 100);
            if (Object.keys(patch).length > 0) { await updateMut.mutateAsync({ id: r.id, patch }); updated++; }
          }
        } catch { /* skip */ }
        done++;
        toast.loading(`Analyzing ${done}/${withDocs.length} documents…`, { id: tId });
      }
      toast.success(`Reanalyzed ${done} document${done === 1 ? "" : "s"} — updated ${updated}.`, { id: tId });
    } finally {
      setReanalyzing(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Business Records" />
        <ErrorState message="We couldn't load business records." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <RecordDialog
          initial={editing === "new" ? undefined : editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Business Records"
        description="One place to see every document the practice owns as an entity — its licenses, contracts, insurance, BAAs, leases, group payer contracts, audits, and formation/tax records, pulled together from across the app. Renewal status is derived from expiration dates, never stale stored values."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={records}
              collection="businessRecords"
              keyOf={dupKey}
              describe={(r) => ({
                title: r.title,
                subtitle: [catLabel(r.category), r.counterparty ?? "", r.identifier ? `#${r.identifier}` : "", r.expirationDate ? `exp ${formatDate(r.expirationDate)}` : ""].filter(Boolean).join(" · "),
                badges: [catLabel(r.category)],
                hasFile: !!r.documentUrl,
              })}
              score={completeness}
            />
            <Button variant="outline" onClick={reanalyze} disabled={reanalyzing}>
              <Sparkles className="size-4" /> {reanalyzing ? "Analyzing…" : "Auto-fill from files"}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add record
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total records" value={stats.total} icon={Building2} loading={isLoading} />
        <StatCard label="Active" value={stats.active} icon={ShieldCheck} tone="success" loading={isLoading} />
        <StatCard label="Renewing ≤60d" value={stats.expiring} icon={ClipboardCheck} tone={stats.expiring ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Expired" value={stats.expired} icon={Shield} tone={stats.expired ? "destructive" : "default"} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pl-9" placeholder="Search by title, counterparty, or identifier…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input w-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value as BusinessRecordCategory | "all")}>
              <option value="all">All categories</option>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">View</span>
              {([["overview", "One-stop view"], ["file", "Category file"], ["list", "Flat list"]] as const).map(([g, label]) => (
                <button key={g} onClick={() => setView(g)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${view === g ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : view === "overview" ? (
            <EntityRecordsPanel records={filtered} onEditRecord={setEditing} />
          ) : view === "file" ? (
            <EntityFileView files={files} locName={locName} onEdit={setEditing} onDeleted={() => void refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Building2} title="No business records found"
              description={search || filterCat !== "all" ? "Try adjusting your search or filter." : "Add your first business record to start tracking."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add record</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Category" sortKey="category" sort={sort} onToggle={toggle} />
                    <SortHeader label="Counterparty" sortKey="counterparty" sort={sort} onToggle={toggle} />
                    <SortHeader label="Identifier" sortKey="identifier" sort={sort} onToggle={toggle} />
                    <SortHeader label="Expiration" sortKey="expiration" sort={sort} onToggle={toggle} />
                    <SortHeader label="Amount" sortKey="amount" sort={sort} onToggle={toggle} align="right" />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const st = recordStatus(r);
                    const days = daysUntil(r.expirationDate);
                    return (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Title" className="py-3 pr-4 font-medium">
                          {r.documentUrl ? <FileLink path={r.documentUrl} label={r.title} className="text-primary hover:underline" /> : r.title}
                        </td>
                        <td data-label="Category" className="py-3 pr-4">{catLabel(r.category)}</td>
                        <td data-label="Counterparty" className="py-3 pr-4 text-muted-foreground">{r.counterparty ?? "—"}</td>
                        <td data-label="Identifier" className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.identifier ?? "—"}</td>
                        <td data-label="Expiration" className="py-3 pr-4">
                          {r.expirationDate ? (
                            <div>
                              <div>{formatDate(r.expirationDate)}</div>
                              {days !== null && st !== "no_expiry" && st !== "terminated" && (
                                <div className="text-xs text-muted-foreground">{days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days}d remaining`}</div>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td data-label="Amount" className="py-3 pr-4 text-right">{formatCents(r.amountCents)}</td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditing(r)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex gap-2 md:justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                            {r.documentUrl && <FileLink path={r.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />}
                            <VersionHistoryButton entityType="business_records" entityId={r.id} title={r.title} />
                            <AdminDeleteButton collection="businessRecords" id={r.id} label={r.title} noun="record" onDeleted={() => void refetch()} />
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

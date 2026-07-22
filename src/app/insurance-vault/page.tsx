"use client";

import { Fragment, useState, useMemo, useRef, useEffect } from "react";
import { Shield, Plus, Search, Upload, FileText, Sparkles, X, ChevronRight } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { formatDate, daysUntil, isExpired, isExpiringSoon, parseDate, dateInputToISO } from "@/lib/dates";
import { buildHolderIndex, holderStatus } from "@/lib/compliance";
import { humanizeLabel, formatName } from "@/lib/format";
import { PersonSelect } from "@/components/shared/person-select";
import { PersonLink } from "@/components/shared/person-link";
import { FileLink } from "@/components/shared/file-link";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import type { InsurancePolicyRecord } from "@/lib/data/schema";
import { toast } from "sonner";

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/* --------------------------- policy status --------------------------- */

type PolicyStatus = "active" | "expiring_soon" | "expired" | "no_expiry";
const POLICY_STATUS_LABEL: Record<PolicyStatus, string> = {
  active: "Active", expiring_soon: "Renewing soon", expired: "Expired", no_expiry: "No renewal date",
};
const POLICY_STATUS_VARIANT: Record<PolicyStatus, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success", expiring_soon: "warning", expired: "destructive", no_expiry: "secondary",
};
/** Insurance uses a 60-day renewal window (matches the stat cards). */
function policyStatus(p: Pick<InsurancePolicyRecord, "renewalDate">): PolicyStatus {
  if (!p.renewalDate) return "no_expiry";
  if (isExpired(p.renewalDate)) return "expired";
  if (isExpiringSoon(p.renewalDate, 60)) return "expiring_soon";
  return "active";
}

/* -------------------- provider policy-file (grouped) view --------------------
 * Same organization as the Credentials page: policies grouped by holder, then by
 * coverage line (malpractice, cyber, general…). Within a line the newest renewal
 * is the ACTIVE policy and prior terms nest as superseded history — a policy of
 * one type never supersedes a policy of another type. Collapsed by default;
 * former holders sit in their own section at the end. */

interface PolicyLeaf { key: string; label: string; rank: number; items: InsurancePolicyRecord[]; }
interface PolicyFile { key: string; userId: string | null; name: string; org: boolean; former: boolean; leaves: PolicyLeaf[]; }

/** Recency for active→oldest ordering: renewal date, else created. */
function policyRecency(p: InsurancePolicyRecord): number {
  const d = parseDate(p.renewalDate) ?? parseDate(p.createdDate);
  return d ? d.getTime() : 0;
}

function buildPolicyFiles(
  policies: InsurancePolicyRecord[],
  isFormer: (p: InsurancePolicyRecord) => boolean,
): PolicyFile[] {
  const byHolder = new Map<string, InsurancePolicyRecord[]>();
  for (const p of policies) {
    const key = p.holderUserId || p.holderName?.trim() || "__org__";
    const arr = byHolder.get(key) ?? [];
    arr.push(p);
    byHolder.set(key, arr);
  }
  const files: PolicyFile[] = [];
  for (const [key, items] of byHolder) {
    const org = key === "__org__";
    const leafMap = new Map<string, PolicyLeaf>();
    for (const p of items) {
      const type = (p.policyType || "other").toLowerCase().trim();
      const leaf = leafMap.get(type) ?? { key: type, label: humanizeLabel(type), rank: type === "malpractice" ? 0 : 1, items: [] };
      leaf.items.push(p);
      leafMap.set(type, leaf);
    }
    // Active (newest renewal) at the top, then superseded most-recent → oldest.
    const leaves = [...leafMap.values()]
      .map((l) => ({ ...l, items: [...l.items].sort((a, b) => policyRecency(b) - policyRecency(a)) }))
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
    const first = items[0];
    files.push({
      key,
      userId: first.holderUserId ?? null,
      name: org ? "Organization-wide policies" : (first.holderName?.trim() || "Unassigned"),
      org,
      former: !org && isFormer(first),
      leaves,
    });
  }
  // Org-wide first, then active individual holders, then former — each alphabetical.
  const rank = (f: PolicyFile) => (f.org ? 0 : f.former ? 2 : 1);
  return files.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
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
const blobToBase64 = fileToBase64;

/** Best-effort media type from a stored file path/extension. */
function mediaFromName(name: string): string {
  const ext = name.toLowerCase().split("?")[0].split(".").pop() ?? "";
  const map: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  return map[ext] ?? "application/octet-stream";
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
  prefill,
  onClose,
  onSave,
  saving,
}: {
  initial?: InsurancePolicyRecord;
  prefill?: Partial<PolicyForm>;
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
      : { ...EMPTY, ...prefill },
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

/* ----------------------- provider policy-file view ----------------------- */

function PolicyFileView({ files, onEdit, onDeleted }: {
  files: PolicyFile[];
  onEdit: (p: InsurancePolicyRecord) => void;
  onDeleted: () => void;
}) {
  // Collapsed by default: the view opens as a list of holders; a row expands to
  // reveal that holder's policy file.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  if (files.length === 0) {
    return <EmptyState icon={Shield} title="No policies found" description="Add a policy or clear the search." />;
  }
  // buildPolicyFiles already orders org-wide → active → former, each alphabetical.
  const current = files.filter((f) => !f.former);
  const former = files.filter((f) => f.former);

  const renderFile = (f: PolicyFile) => {
    const isOpen = open.has(f.key);
    const count = f.leaves.reduce((n, l) => n + l.items.length, 0);
    return (
      <div key={f.key} className="rounded-lg border border-border">
        <button type="button" onClick={() => toggle(f.key)} className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left hover:bg-secondary/20">
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
          {f.org
            ? <span className="inline-flex items-center gap-1.5 font-medium"><Shield className="size-4 text-muted-foreground" />{f.name}</span>
            : <span className="font-medium">{formatName(f.name)}</span>}
          <span className="ml-auto text-xs text-muted-foreground">{count} on file</span>
        </button>
        {isOpen && (
          <div className="divide-y divide-border/60 border-t border-border">
            {f.leaves.map((leaf) => {
              const [currentPolicy, ...history] = leaf.items;
              const st = policyStatus(currentPolicy);
              const days = daysUntil(currentPolicy.renewalDate);
              return (
                <div key={leaf.key} className="px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{leaf.label}</div>
                  {/* Active / current term */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Current</span>
                    <span className="font-medium">{currentPolicy.policyName}</span>
                    {currentPolicy.carrierName && <span className="text-xs text-muted-foreground">{currentPolicy.carrierName}</span>}
                    {currentPolicy.policyNumber && <span className="text-xs text-muted-foreground">#{currentPolicy.policyNumber}</span>}
                    {currentPolicy.coverageAmountCents != null && <span className="text-xs text-muted-foreground">{formatCents(currentPolicy.coverageAmountCents)} coverage</span>}
                    <button type="button" onClick={() => onEdit(currentPolicy)} className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                      <Badge variant={f.former ? "secondary" : POLICY_STATUS_VARIANT[st]}>{POLICY_STATUS_LABEL[st]}</Badge>
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {currentPolicy.renewalDate ? <>renews {formatDate(currentPolicy.renewalDate)}{days !== null && st !== "no_expiry" && <> · {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `${days}d left`}</>}</> : "no renewal date"}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(currentPolicy)}>Edit</Button>
                      {currentPolicy.documentUrl && <FileLink path={currentPolicy.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />}
                      <VersionHistoryButton entityType="insurancePolicies" entityId={currentPolicy.id} title={`${currentPolicy.policyName}${currentPolicy.holderName ? ` — ${currentPolicy.holderName}` : ""}`} />
                      <AdminDeleteButton collection="insurancePolicies" id={currentPolicy.id} label={currentPolicy.policyName} noun="policy" onDeleted={onDeleted} />
                    </div>
                  </div>
                  {/* Superseded prior terms, most recent → oldest */}
                  {history.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-border/60 pl-3">
                      {history.map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                          <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">Superseded</span>
                          <span>{h.policyName}</span>
                          {h.carrierName && <span className="text-xs">{h.carrierName}</span>}
                          {h.policyNumber && <span className="text-xs">#{h.policyNumber}</span>}
                          <span className="text-xs">{h.renewalDate ? `renewed ${formatDate(h.renewalDate)}` : ""}</span>
                          <div className="ml-auto flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => onEdit(h)}>Edit</Button>
                            {h.documentUrl && <FileLink path={h.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-primary hover:underline" />}
                            <AdminDeleteButton collection="insurancePolicies" id={h.id} label={h.policyName} noun="policy" onDeleted={onDeleted} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">{current.map(renderFile)}</div>
      {former.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-2 text-sm font-semibold text-muted-foreground">
            Former / past employees <Badge variant="secondary">{former.length}</Badge>
          </div>
          {former.map(renderFile)}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

type PolicyGroupBy = "provider_file" | "none" | "type" | "holder";
type StatusFilter = PolicyStatus | "all";
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "expiring_soon", "expired", "no_expiry"];

export default function InsuranceVaultPage() {
  const { data, isLoading, isError, refetch } = useCollection("insurancePolicies");
  const employeesQ = useCollection("employees");
  const createMut = useCreate("insurancePolicies");
  const updateMut = useUpdate("insurancePolicies");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<PolicyGroupBy>("provider_file");
  const [editing, setEditing] = useState<InsurancePolicyRecord | null | "new">(null);
  const [prefill, setPrefill] = useState<Partial<PolicyForm> | null>(null);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const policies = useMemo(() => data ?? [], [data]);

  // Deep-link from an insurance-renewal alert: /insurance-vault?add=policy&holder=…&type=…&name=…
  // opens the pre-scoped Add dialog so the user can upload the renewal in one click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("add") !== "policy") return;
    setPrefill({
      holderName: p.get("holder") ?? "",
      holderUserId: p.get("holderId") || null,
      policyType: p.get("type") || "malpractice",
      policyName: p.get("name") ?? "",
    });
    setEditing("new");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // A policy whose individual holder has left the practice is history, not an
  // alarm — mark those files "Former" (mirrors the Credentials page).
  const holderIdx = useMemo(() => buildHolderIndex(employeesQ.data ?? []), [employeesQ.data]);
  const isFormerHolder = useMemo(
    () => (p: InsurancePolicyRecord) => holderStatus({ employeeUserId: p.holderUserId, employeeName: p.holderName }, holderIdx) === "former",
    [holderIdx],
  );

  const matchesSearch = useMemo(() => {
    const q = search.toLowerCase();
    return (p: InsurancePolicyRecord) =>
      !q ||
      p.policyName.toLowerCase().includes(q) ||
      (p.carrierName ?? "").toLowerCase().includes(q) ||
      (p.holderName ?? "").toLowerCase().includes(q) ||
      (p.policyNumber ?? "").toLowerCase().includes(q);
  }, [search]);

  // Provider file: search only (a status filter would hide the superseded
  // history the file view is meant to show).
  const searchFiltered = useMemo(() => policies.filter(matchesSearch), [policies, matchesSearch]);
  const policyFiles = useMemo(() => buildPolicyFiles(searchFiltered, isFormerHolder), [searchFiltered, isFormerHolder]);

  // Flat / grouped views: search + status filter.
  const filtered = useMemo(
    () => searchFiltered.filter((p) => filterStatus === "all" || policyStatus(p) === filterStatus),
    [searchFiltered, filterStatus],
  );

  const { sorted, sort, toggle } = useSort(filtered, {
    policyName: (p) => p.policyName,
    type: (p) => p.policyType,
    carrier: (p) => p.carrierName,
    policyNumber: (p) => p.policyNumber,
    coverage: (p) => p.coverageAmountCents,
    premium: (p) => p.annualPremiumCents,
    renewal: (p) => p.renewalDate,
    holder: (p) => p.holderName,
    status: (p) => policyStatus(p),
  });

  const groups = useMemo(() => {
    if (groupBy !== "type" && groupBy !== "holder") return [] as { key: string; label: string; items: InsurancePolicyRecord[] }[];
    const map = new Map<string, InsurancePolicyRecord[]>();
    for (const p of sorted) {
      const key = groupBy === "type" ? (p.policyType || "other") : (p.holderName?.trim() || "Organization-wide");
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: groupBy === "type" ? humanizeLabel(key) : key, items }));
  }, [sorted, groupBy]);

  const stats = useMemo(() => {
    const expired = policies.filter((p) => isExpired(p.renewalDate));
    const expiringSoon = policies.filter((p) => {
      const d = daysUntil(p.renewalDate);
      return d !== null && d >= 0 && d <= 60 && !isExpired(p.renewalDate);
    });
    return { total: policies.length, expired: expired.length, expiringSoon: expiringSoon.length };
  }, [policies]);

  // Re-read every policy with an attached document and fill missing fields from
  // the ACTUAL contents (carrier, number, coverage, premium, renewal). Never
  // overwrites a field that already has a value — mirrors the Credentials page.
  async function reanalyze() {
    const withDocs = policies.filter((p) => p.documentUrl);
    if (withDocs.length === 0) { toast.info("No policy documents are attached to analyze. Attach a policy file first."); return; }
    if (!window.confirm(`Analyze ${withDocs.length} attached document${withDocs.length === 1 ? "" : "s"} with AI? This fills in missing details (carrier, number, coverage, premium, renewal date). Existing values are never overwritten.`)) return;
    setReanalyzing(true);
    const tId = toast.loading(`Analyzing 0/${withDocs.length} policy documents…`);
    let done = 0, updated = 0;
    try {
      for (const p of withDocs) {
        let fileBase64: string | undefined;
        let mediaType: string | undefined;
        try {
          const url = await getSignedUrl(p.documentUrl as string);
          if (url) {
            const resp = await fetch(url);
            const blob = await resp.blob();
            const mt = blob.type && blob.type !== "application/octet-stream" ? blob.type : mediaFromName(p.documentUrl as string);
            if (blob.size <= 8 * 1024 * 1024 && (mt === "application/pdf" || mt.startsWith("image/"))) {
              fileBase64 = await blobToBase64(blob);
              mediaType = mt;
            }
          }
        } catch { /* skip files we can't read */ }
        if (!fileBase64) { done++; toast.loading(`Analyzing ${done}/${withDocs.length} policy documents…`, { id: tId }); continue; }

        try {
          const res = await fetch("/api/ai/insurance-analyze", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileBase64, mediaType }),
          });
          if (res.status === 429) { toast.error("Daily AI limit reached — stopping reanalysis.", { id: tId }); break; }
          const d = await res.json() as { policyType?: string; carrierName?: string | null; policyNumber?: string | null; coverageAmount?: number | null; annualPremium?: number | null; renewalDate?: string | null };
          if (res.ok) {
            const patch: Partial<InsurancePolicyRecord> = {};
            if (!p.carrierName && d.carrierName) patch.carrierName = d.carrierName;
            if (!p.policyNumber && d.policyNumber) patch.policyNumber = d.policyNumber;
            if (p.coverageAmountCents == null && d.coverageAmount != null) patch.coverageAmountCents = Math.round(d.coverageAmount * 100);
            if (p.annualPremiumCents == null && d.annualPremium != null) patch.annualPremiumCents = Math.round(d.annualPremium * 100);
            if (!p.renewalDate && d.renewalDate) patch.renewalDate = dateInputToISO(d.renewalDate);
            if (Object.keys(patch).length > 0) { await updateMut.mutateAsync({ id: p.id, patch }); updated++; }
          }
        } catch { /* skip this one */ }
        done++;
        toast.loading(`Analyzing ${done}/${withDocs.length} policy documents…`, { id: tId });
      }
      toast.success(`Reanalyzed ${done} document${done === 1 ? "" : "s"} — updated ${updated}.`, { id: tId });
    } finally {
      setReanalyzing(false);
    }
  }

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

  const renderRow = (p: InsurancePolicyRecord) => {
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
            <VersionHistoryButton entityType="insurancePolicies" entityId={p.id} title={`${p.policyName}${p.holderName ? ` — ${p.holderName}` : ""}`} />
            <AdminDeleteButton collection="insurancePolicies" id={p.id} label={p.policyName} noun="policy" onDeleted={() => void refetch()} />
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {editing && (
        <PolicyDialog
          initial={editing === "new" ? undefined : editing}
          prefill={editing === "new" ? (prefill ?? undefined) : undefined}
          onClose={() => { setEditing(null); setPrefill(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="Insurance Vault"
        description="Track all insurance policies, renewal dates, and coverage amounts. Renewal status is always derived from the renewal date — never stale stored values."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={policies}
              collection="insurancePolicies"
              keyOf={(p) => dupNorm(p.policyNumber) || (dupNorm(p.policyName) + dupNorm(p.carrierName)) || null}
              describe={(p) => ({ title: p.policyName, subtitle: [p.carrierName, p.policyNumber ? `#${p.policyNumber}` : ""].filter(Boolean).join(" · "), hasFile: !!p.documentUrl })}
              score={(p) => (p.documentUrl ? 2 : 0) + (p.policyNumber ? 1 : 0)}
            />
            <Button variant="outline" onClick={reanalyze} disabled={reanalyzing}>
              <Sparkles className="size-4" /> {reanalyzing ? "Analyzing…" : "Auto-fill from files"}
            </Button>
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search by name, carrier, holder, or #…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {groupBy !== "provider_file" && STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "all" ? "All" : POLICY_STATUS_LABEL[s]}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">View</span>
              {([["provider_file", "Provider file"], ["none", "Flat list"], ["type", "By type"], ["holder", "By holder"]] as const).map(([g, label]) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    groupBy === g ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : groupBy === "provider_file" ? (
            <PolicyFileView files={policyFiles} onEdit={setEditing} onDeleted={() => void refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No policies found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "Add your first insurance policy."}
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
                  {(groupBy === "none" ? [{ key: "__all__", label: "", items: sorted }] : groups).map((g) => (
                    <Fragment key={g.key}>
                      {groupBy !== "none" && (
                        <tr className="bg-secondary/40">
                          <td colSpan={9} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{g.label}</span> · {g.items.length}
                          </td>
                        </tr>
                      )}
                      {g.items.map(renderRow)}
                    </Fragment>
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

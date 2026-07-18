"use client";

import { Fragment, useState, useMemo, useRef } from "react";
import { BadgeCheck, Plus, Search, Sparkles, X, Upload } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { getSignedUrl, uploadFile } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { DuplicateFinder } from "@/components/shared/duplicate-finder";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { PersonLink } from "@/components/shared/person-link";
import { FileLink } from "@/components/shared/file-link";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { credentialStatus, bySoonest, buildHolderIndex, holderStatus } from "@/lib/compliance";
import { formatDate, daysUntil, parseDate, dateInputToISO } from "@/lib/dates";
import { PersonSelect } from "@/components/shared/person-select";
import type { CredentialRecord, Employee } from "@/lib/data/schema";
import { toast } from "sonner";

type Unresolved = { id: string; credentialName: string; holderName: string };
type ResItem = { mode: "existing" | "new" | "skip"; employeeId: string; newName: string; email: string; workerType: Employee["workerType"]; former: boolean };

type Status = ReturnType<typeof credentialStatus>;

const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_expiry: "No expiry",
};

const STATUS_VARIANT: Record<
  Status,
  "success" | "warning" | "destructive" | "secondary"
> = {
  active: "success",
  expiring_soon: "warning",
  expired: "destructive",
  no_expiry: "secondary",
};

const CRED_TYPES = [
  "license",
  "certification",
  "dea",
  "cpr_bls_acls",
  "immunization",
  "background_check",
  "other",
] as const;
const CRED_TYPE_SET = new Set<string>(CRED_TYPES);
const CRED_TYPE_LABEL: Record<string, string> = {
  license: "License",
  certification: "Certification",
  dea: "DEA Registration",
  cpr_bls_acls: "CPR / BLS / ACLS",
  immunization: "Immunization",
  background_check: "Background Check",
  other: "Other",
};
const credTypeLabel = (t: string) => CRED_TYPE_LABEL[t] ?? t;

/* ------------- clinical credential classification (provider file view) -------------
 * The stored credential_type is unreliable (APRN licenses saved as "dea", payer
 * docs saved as "license"), so the provider-file view classifies each credential
 * from its NAME into the clinical taxonomy the practice actually tracks:
 *   RN · APRN · APRN-controlled-substance · PA license · DEA (one per location)
 *   · Board certification (one per board type: FNP / PMHNP / PA).
 * Anything that isn't a license/cert (CVs, diplomas, payer agreements, forms)
 * falls to "Other / supporting documents". */

type CredClass = "rn" | "aprn" | "aprn_cs" | "pa" | "dea" | "board_cert" | "other";
const CLASS_ORDER: CredClass[] = ["rn", "aprn", "aprn_cs", "pa", "dea", "board_cert", "other"];
const CLASS_LABEL: Record<CredClass, string> = {
  rn: "RN License",
  aprn: "APRN License",
  aprn_cs: "APRN — Controlled Substance License",
  pa: "PA License",
  dea: "DEA Registration",
  board_cert: "Board Certification",
  other: "Other / supporting documents",
};

function classifyCredential(c: CredentialRecord): { klass: CredClass; boardType: string | null } {
  const n = (c.credentialName || "").toLowerCase();
  const isLicense = /licen[sc]e|licensure/.test(n);
  const isAprn = /aprn|a\.p\.r\.n\.|advanced practice registered nurse/.test(n);
  const isPa = /physician assistant|\bpa-c\b/.test(n);
  const isRn = /registered nurse|\brn\b/.test(n);
  const hasCs = /controlled substance|schedule\s*2|schedule\s*ii|\bcsr\b/.test(n);
  const isDea = /\bdea\b/.test(n);
  const isBoard = /board[ -]?cert|pmhnp-bc|\bancc\b|\bnccpa\b|certification verification|board certification/.test(n);

  if (isDea) return { klass: "dea", boardType: null };
  if (isBoard) {
    let bt: string | null = null;
    if (/pmhnp|psychiatric[- ]mental health/.test(n)) bt = "PMHNP";
    else if (/\bfnp\b|family nurse/.test(n)) bt = "FNP";
    else if (/nccpa|physician assistant|\bpa-c\b|\bpa\b/.test(n)) bt = "PA";
    return { klass: "board_cert", boardType: bt };
  }
  if (isLicense && isAprn && hasCs) return { klass: "aprn_cs", boardType: null };
  if (isLicense && isAprn) return { klass: "aprn", boardType: null };
  if (isLicense && isPa) return { klass: "pa", boardType: null };
  if (isLicense && isRn) return { klass: "rn", boardType: null };
  return { klass: "other", boardType: null };
}

/** Class for the file view: prefer the AI's DOCUMENT-derived class, and only
 *  fall back to the name heuristic for records not yet analyzed. */
function resolveCredClass(c: CredentialRecord): { klass: CredClass; boardType: string | null } {
  if (c.credentialClass) return { klass: c.credentialClass, boardType: c.boardType ?? null };
  return classifyCredential(c);
}

/** Recency for current→oldest ordering: expiration, else issue, else created. */
function credRecency(c: CredentialRecord): number {
  const d = parseDate(c.expirationDate) ?? parseDate(c.issueDate) ?? parseDate(c.createdDate);
  return d ? d.getTime() : 0;
}

/* --------------------------- duplicate detection --------------------------- */

const norm = (s?: string | null): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Two credentials are "the same" if they share a holder + type + identity, where
 *  identity is the credential number when present, else the normalized name. */
function dupKey(c: CredentialRecord): string | null {
  const identity = norm(c.credentialNumber) || norm(c.credentialName);
  if (!identity) return null;
  const holder = c.employeeUserId || norm(c.employeeName);
  return `${holder}::${c.credentialType}::${identity}`;
}

/** How complete a record is — used to pick which duplicate to keep. */
function completeness(c: CredentialRecord): number {
  let s = 0;
  if (c.documentUrl) s += 3;
  if (c.employeeUserId) s += 2;
  else if (c.employeeName && c.employeeName !== "Unassigned — set employee") s += 1;
  if (c.credentialNumber) s += 1;
  if (c.expirationDate) s += 1;
  if (c.issuingBody) s += 1;
  return s;
}

type GroupBy = "provider_file" | "none" | "type" | "employee";

/** Best-effort media type from a stored file path/extension. */
function mediaFromName(name: string): string {
  const ext = name.toLowerCase().split("?")[0].split(".").pop() ?? "";
  const map: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
  return map[ext] ?? "application/octet-stream";
}

/** Base64-encode a Blob (without the data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = reader.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* ------------------------------ form -------------------------------- */

interface FormState {
  employeeUserId: string | null;
  employeeName: string;
  credentialName: string;
  credentialType: string;
  issuingBody: string;
  credentialNumber: string;
  issueDate: string;
  expirationDate: string;
  credentialClass: CredClass | null;
  boardType: string;
}

const EMPTY_FORM: FormState = {
  employeeUserId: null,
  employeeName: "",
  credentialName: "",
  credentialType: "license",
  issuingBody: "",
  credentialNumber: "",
  issueDate: "",
  expirationDate: "",
  credentialClass: null,
  boardType: "",
};

/* ----------------------------- dialog ------------------------------- */

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// AI extraction supports images + PDF; returns the media type or null.
function analyzableMedia(file: File): string | null {
  const t = file.type;
  if (t === "application/pdf" || t.startsWith("image/")) return t;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return null;
}

function CredentialDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: CredentialRecord;
  onClose: () => void;
  onSave: (data: FormState, file: File | null) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          employeeUserId: initial.employeeUserId ?? null,
          employeeName: initial.employeeName,
          credentialName: initial.credentialName,
          credentialType: initial.credentialType,
          issuingBody: initial.issuingBody ?? "",
          credentialNumber: initial.credentialNumber ?? "",
          issueDate: initial.issueDate ?? "",
          expirationDate: initial.expirationDate ?? "",
          credentialClass: initial.credentialClass ?? null,
          boardType: initial.boardType ?? "",
        }
      : EMPTY_FORM,
  );
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  async function analyze(f: File) {
    const media = analyzableMedia(f);
    if (!media) return;
    setAnalyzing(true);
    try {
      const fileBase64 = await fileToBase64(f);
      const res = await fetch("/api/ai/credential-analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mediaType: media }),
      });
      if (res.status === 429) { toast.error("Daily AI limit reached — enter the details manually."); return; }
      const d = await res.json() as { credentialType?: string; credentialClass?: string; boardType?: string | null; credentialName?: string; issuingBody?: string | null; credentialNumber?: string | null; issueDate?: string | null; expirationDate?: string | null };
      if (res.ok) {
        const validClass = d.credentialClass && (CLASS_ORDER as readonly string[]).includes(d.credentialClass) ? (d.credentialClass as CredClass) : null;
        setForm((p) => ({
          ...p,
          credentialName: p.credentialName || d.credentialName || "",
          credentialType: d.credentialType && (CRED_TYPES as readonly string[]).includes(d.credentialType) ? d.credentialType : p.credentialType,
          credentialClass: validClass ?? p.credentialClass,
          boardType: d.boardType ?? p.boardType,
          issuingBody: p.issuingBody || d.issuingBody || "",
          credentialNumber: p.credentialNumber || d.credentialNumber || "",
          issueDate: p.issueDate || (d.issueDate ?? ""),
          expirationDate: p.expirationDate || (d.expirationDate ?? ""),
        }));
        toast.success("Filled in from the document — review and save.");
      } else {
        toast.error("Couldn't read that document — enter the details manually.");
      }
    } catch { toast.error("Couldn't read that document — enter the details manually."); }
    finally { setAnalyzing(false); }
  }

  const valid =
    form.employeeName.trim() !== "" &&
    form.credentialName.trim() !== "" &&
    (form.expirationDate === "" ||
      form.issueDate === "" ||
      parseDate(form.expirationDate)! >= parseDate(form.issueDate)!);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">
            {initial ? "Edit credential" : "Add credential"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) void analyze(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={analyzing || saving}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-3 text-sm text-muted-foreground hover:bg-secondary/20 disabled:opacity-60"
            >
              {analyzing ? <><Sparkles className="size-4 animate-pulse text-primary" /> Reading the document…</> : <><Upload className="size-4" /> {file ? file.name : "Upload license/certificate — AI fills the fields"}</>}
            </button>
            {file && !analyzing && <p className="flex items-center gap-1 text-xs text-primary"><Sparkles className="size-3" /> Fields prefilled from the document — verify before saving. The file will be attached.</p>}
          </div>
          <div className="sm:col-span-2">
            <PersonSelect
              label="Employee"
              required
              value={{ userId: form.employeeUserId, name: form.employeeName }}
              onChange={(v) => setForm((p) => ({ ...p, employeeUserId: v.userId, employeeName: v.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Credential name *</label>
            <input
              className="input w-full"
              value={form.credentialName}
              onChange={set("credentialName")}
              placeholder="e.g. RN License"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <select className="input w-full" value={form.credentialType} onChange={set("credentialType")}>
              {CRED_TYPES.map((t) => (
                <option key={t} value={t}>
                  {credTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Credential class</label>
            <select
              className="input w-full"
              value={form.credentialClass ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, credentialClass: (e.target.value || null) as CredClass | null }))}
            >
              <option value="">— Unclassified —</option>
              {CLASS_ORDER.map((k) => <option key={k} value={k}>{CLASS_LABEL[k]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Set automatically from the uploaded document; override if needed.</p>
          </div>
          {form.credentialClass === "board_cert" && (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Board type</label>
              <input className="input w-full" value={form.boardType} onChange={set("boardType")} placeholder="FNP / PMHNP / PA" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Issuing body</label>
            <input className="input w-full" value={form.issuingBody} onChange={set("issuingBody")} placeholder="e.g. State Board of Nursing" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Credential #</label>
            <input className="input w-full" value={form.credentialNumber} onChange={set("credentialNumber")} placeholder="License or cert number" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Issue date</label>
            <input type="date" className="input w-full" value={form.issueDate} onChange={set("issueDate")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiration date</label>
            <input type="date" className="input w-full" value={form.expirationDate} onChange={set("expirationDate")} />
          </div>
          {form.issueDate && form.expirationDate && parseDate(form.expirationDate)! < parseDate(form.issueDate)! && (
            <p className="text-sm text-destructive sm:col-span-2">
              Expiration date must be after issue date.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form, file)}
            disabled={!valid || saving || analyzing}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

/* ------------------- holder resolver (unmatched credentials) ------------------- */

function HolderResolver({ items, employees, onClose, onApply }: {
  items: Unresolved[];
  employees: Employee[];
  onClose: () => void;
  onApply: (state: ResItem[]) => Promise<void>;
}) {
  const [state, setState] = useState<ResItem[]>(() =>
    items.map((it) => ({ mode: "existing", employeeId: "", newName: it.holderName, email: "", workerType: "employee", former: false })),
  );
  const [saving, setSaving] = useState(false);
  const sortedEmp = useMemo(
    () => [...employees].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [employees],
  );
  const upd = (i: number, patch: Partial<ResItem>) => setState((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  async function save() { setSaving(true); try { await onApply(state); } finally { setSaving(false); } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">Assign credential holders</h2>
            <p className="text-xs text-muted-foreground">These documents named a person we couldn&apos;t match to your directory. For each, assign an existing employee or create a new / former one.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.map((it, i) => {
            const r = state[i];
            return (
              <div key={it.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{it.credentialName}</p>
                <p className="text-xs text-muted-foreground">Detected holder: <span className="text-foreground">{it.holderName}</span></p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["existing", "new", "skip"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => upd(i, { mode: m })}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
                        r.mode === m ? "bg-primary text-primary-foreground ring-primary" : "bg-transparent text-muted-foreground ring-border hover:bg-secondary",
                      )}
                    >
                      {m === "existing" ? "Assign existing" : m === "new" ? "Create new / former" : "Skip"}
                    </button>
                  ))}
                </div>
                {r.mode === "existing" && (
                  <select className="input mt-2 w-full text-sm" value={r.employeeId} onChange={(e) => upd(i, { employeeId: e.target.value })}>
                    <option value="">Select an employee…</option>
                    {sortedEmp.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}{e.workerType === "contractor" ? " (contractor)" : ""}</option>)}
                  </select>
                )}
                {r.mode === "new" && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input className="input text-sm" placeholder="Full name" value={r.newName} onChange={(e) => upd(i, { newName: e.target.value })} />
                    <input className="input text-sm" placeholder="Email (required)" value={r.email} onChange={(e) => upd(i, { email: e.target.value })} />
                    <select className="input text-sm" value={r.workerType} onChange={(e) => upd(i, { workerType: e.target.value as Employee["workerType"] })}>
                      <option value="employee">Employee (W‑2)</option>
                      <option value="contractor">Contractor (1099)</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4" checked={r.former} onChange={(e) => upd(i, { former: e.target.checked })} /> Former / past
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Apply"}</Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- provider credential-file (grouped) view -------------------- */

interface Leaf { key: string; klass: CredClass; boardType: string | null; locationId: string | null; items: CredentialRecord[]; }
interface ProviderFile { key: string; userId: string | null; name: string; former: boolean; leaves: Leaf[]; }

function buildProviderFiles(
  creds: CredentialRecord[],
  isFormer: (c: CredentialRecord) => boolean,
): ProviderFile[] {
  const byProvider = new Map<string, CredentialRecord[]>();
  for (const c of creds) {
    const key = c.employeeUserId || c.employeeName?.trim() || "Unassigned";
    const arr = byProvider.get(key) ?? [];
    arr.push(c);
    byProvider.set(key, arr);
  }
  const files: ProviderFile[] = [];
  for (const [key, items] of byProvider) {
    const leafMap = new Map<string, Leaf>();
    for (const c of items) {
      const { klass, boardType } = resolveCredClass(c);
      const leafKey =
        klass === "dea" ? `dea|${c.locationId ?? ""}` :
        klass === "board_cert" ? `board|${boardType ?? ""}` :
        klass;
      const leaf = leafMap.get(leafKey) ?? { key: leafKey, klass, boardType, locationId: klass === "dea" ? (c.locationId ?? null) : null, items: [] };
      leaf.items.push(c);
      leafMap.set(leafKey, leaf);
    }
    // Current at the top, then superseded/expired most-recent → oldest.
    const leaves = [...leafMap.values()]
      .map((l) => ({ ...l, items: [...l.items].sort((a, b) => credRecency(b) - credRecency(a)) }))
      .sort((a, b) => CLASS_ORDER.indexOf(a.klass) - CLASS_ORDER.indexOf(b.klass) || a.key.localeCompare(b.key));
    const first = items[0];
    files.push({ key, userId: first.employeeUserId ?? null, name: first.employeeName?.trim() || "Unassigned", former: isFormer(first), leaves });
  }
  // Active providers first, then alphabetical.
  return files.sort((a, b) => Number(a.former) - Number(b.former) || a.name.localeCompare(b.name));
}

function CredentialFileView({ files, locName, onEdit, onDeleted }: {
  files: ProviderFile[];
  locName: (id: string | null) => string;
  onEdit: (c: CredentialRecord) => void;
  onDeleted: () => void;
}) {
  if (files.length === 0) {
    return <EmptyState icon={BadgeCheck} title="No credentials found" description="Add a credential or clear the search." />;
  }
  return (
    <div className="space-y-5">
      {files.map((f) => (
        <div key={f.key} className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2.5">
            <PersonLink userId={f.userId} name={f.name} />
            {f.former && <Badge variant="secondary">Former</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">{f.leaves.reduce((n, l) => n + l.items.length, 0)} on file</span>
          </div>
          <div className="divide-y divide-border/60">
            {f.leaves.map((leaf) => {
              const suffix =
                leaf.klass === "dea" ? ` — ${locName(leaf.locationId)}` :
                leaf.klass === "board_cert" ? (leaf.boardType ? ` — ${leaf.boardType}` : "") : "";
              const [current, ...history] = leaf.items;
              const st = credentialStatus(current);
              const days = daysUntil(current.expirationDate);
              return (
                <div key={leaf.key} className="px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {CLASS_LABEL[leaf.klass]}{suffix}
                  </div>
                  {/* Current */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Current</span>
                    <span className="font-medium">{current.credentialName}</span>
                    {current.credentialNumber && <span className="text-xs text-muted-foreground">#{current.credentialNumber}</span>}
                    <button type="button" onClick={() => onEdit(current)} className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                      <Badge variant={f.former ? "secondary" : STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge>
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {current.expirationDate ? <>exp {formatDate(current.expirationDate)}{days !== null && st !== "no_expiry" && <> · {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `${days}d left`}</>}</> : "no expiry"}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(current)}>Edit</Button>
                      {current.documentUrl && <FileLink path={current.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />}
                      <VersionHistoryButton entityType="credentials" entityId={current.id} title={`${current.credentialName} — ${current.employeeName}`} />
                      <AdminDeleteButton collection="credentials" id={current.id} label={current.credentialName} noun="credential" onDeleted={onDeleted} />
                    </div>
                  </div>
                  {/* Superseded / expired history, most recent → oldest */}
                  {history.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-border/60 pl-3">
                      {history.map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                          <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">Superseded</span>
                          <span>{h.credentialName}</span>
                          {h.credentialNumber && <span className="text-xs">#{h.credentialNumber}</span>}
                          <span className="text-xs">{h.expirationDate ? `exp ${formatDate(h.expirationDate)}` : h.issueDate ? `issued ${formatDate(h.issueDate)}` : ""}</span>
                          <div className="ml-auto flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => onEdit(h)}>Edit</Button>
                            {h.documentUrl && <FileLink path={h.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-primary hover:underline" />}
                            <AdminDeleteButton collection="credentials" id={h.id} label={h.credentialName} noun="credential" onDeleted={onDeleted} />
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
      ))}
    </div>
  );
}

export default function CredentialsPage() {
  const { data, isLoading, isError, refetch } = useCollection("credentials");
  const profilesQ = useCollection("profiles");
  const employeesQ = useCollection("employees");
  const locationsQ = useCollection("locations");
  const createMut = useCreate("credentials");
  const updateMut = useUpdate("credentials");
  const createEmployee = useCreate("employees");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("provider_file");
  const [editing, setEditing] = useState<CredentialRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [resolveQueue, setResolveQueue] = useState<Unresolved[] | null>(null);

  const credentials = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...credentials]
      .filter((c) => {
        if (filterStatus !== "all" && credentialStatus(c) !== filterStatus) return false;
        if (q && !c.credentialName.toLowerCase().includes(q) && !c.employeeName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(bySoonest((c) => c.expirationDate));
  }, [credentials, search, filterStatus]);

  // Group the filtered rows by credential type or by the person who holds them.
  const { sorted, sort, toggle } = useSort(filtered, {
    employee: (c) => c.employeeName,
    credential: (c) => c.credentialName,
    type: (c) => credTypeLabel(c.credentialType),
    issuer: (c) => c.issuingBody,
    expiration: (c) => c.expirationDate,
    status: (c) => credentialStatus(c),
  });

  const groups = useMemo(() => {
    if (groupBy === "none") return [] as { key: string; label: string; items: CredentialRecord[] }[];
    const map = new Map<string, CredentialRecord[]>();
    for (const c of sorted) {
      const key = groupBy === "type" ? (c.credentialType || "other") : (c.employeeName.trim() || "Unassigned");
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: groupBy === "type" ? credTypeLabel(key) : key, items }));
  }, [sorted, groupBy]);

  // Re-read every credential that has an attached document and update its type /
  // fill missing fields from the ACTUAL document contents. Never overwrites a
  // field that already has a value (except the type, which is a safe enum).
  async function reanalyze() {
    const withDocs = credentials.filter((c) => c.documentUrl);
    if (withDocs.length === 0) {
      toast.info("No credential documents are attached to analyze. Attach a license/certificate file first.");
      return;
    }
    if (!window.confirm(`Analyze ${withDocs.length} attached document${withDocs.length === 1 ? "" : "s"} with AI? This can update each credential's type and fill in missing details (issuer, number, dates, holder). Existing values are never overwritten.`)) return;
    const roster = (profilesQ.data ?? []).map((p) => ({ userId: p.userId, name: p.fullName }));
    const profileName = new Map(roster.map((p) => [p.userId, p.name]));
    const isUnassigned = (c: CredentialRecord) => !c.employeeUserId && (!c.employeeName?.trim() || c.employeeName === "Unassigned — set employee");
    setReanalyzing(true);
    const tId = toast.loading(`Analyzing 0/${withDocs.length} credential documents…`);
    let done = 0, updated = 0;
    const unresolved: Unresolved[] = [];
    try {
      for (const c of withDocs) {
        let fileBase64: string | undefined;
        let mediaType: string | undefined;
        try {
          const url = await getSignedUrl(c.documentUrl as string);
          if (url) {
            const resp = await fetch(url);
            const blob = await resp.blob();
            const mt = blob.type && blob.type !== "application/octet-stream" ? blob.type : mediaFromName(c.documentUrl as string);
            if (blob.size <= 8 * 1024 * 1024 && (mt === "application/pdf" || mt.startsWith("image/"))) {
              fileBase64 = await blobToBase64(blob);
              mediaType = mt;
            }
          }
        } catch { /* fall back to text-only analysis */ }

        try {
          const res = await fetch("/api/ai/credential-analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              credentialName: c.credentialName, credentialType: c.credentialType,
              issuingBody: c.issuingBody, credentialNumber: c.credentialNumber,
              employeeName: c.employeeName, fileBase64, mediaType, people: roster,
            }),
          });
          if (res.status === 429) { toast.error("Daily AI limit reached — stopping reanalysis.", { id: tId }); break; }
          const d = await res.json() as { credentialType?: string; credentialClass?: string; boardType?: string | null; issuingBody?: string | null; credentialNumber?: string | null; issueDate?: string | null; expirationDate?: string | null; matchedUserId?: string | null; holderName?: string | null };
          if (res.ok) {
            const patch: Partial<CredentialRecord> = {};
            if (d.credentialType && CRED_TYPE_SET.has(d.credentialType) && d.credentialType !== c.credentialType) patch.credentialType = d.credentialType as CredentialRecord["credentialType"];
            // The document is authoritative for the clinical class — (re)set it from what the AI read.
            if (d.credentialClass && (CLASS_ORDER as readonly string[]).includes(d.credentialClass) && d.credentialClass !== c.credentialClass) patch.credentialClass = d.credentialClass as CredClass;
            if (d.boardType !== undefined && (d.boardType ?? null) !== (c.boardType ?? null)) patch.boardType = d.boardType ?? null;
            if (!c.issuingBody && d.issuingBody) patch.issuingBody = d.issuingBody;
            if (!c.credentialNumber && d.credentialNumber) patch.credentialNumber = d.credentialNumber;
            if (!c.issueDate && d.issueDate) patch.issueDate = dateInputToISO(d.issueDate);
            if (!c.expirationDate && d.expirationDate) patch.expirationDate = dateInputToISO(d.expirationDate);
            // Assign the holder when the record is still unassigned.
            if (isUnassigned(c)) {
              if (d.matchedUserId && profileName.has(d.matchedUserId)) {
                patch.employeeUserId = d.matchedUserId;
                patch.employeeName = profileName.get(d.matchedUserId) as string;
              } else if (d.holderName && d.holderName.trim()) {
                // No directory match — queue it so the user can confirm.
                unresolved.push({ id: c.id, credentialName: c.credentialName, holderName: d.holderName.trim() });
              }
            }
            if (Object.keys(patch).length > 0) { await updateMut.mutateAsync({ id: c.id, patch }); updated++; }
          }
        } catch { /* skip this one */ }

        done++;
        toast.loading(`Analyzing ${done}/${withDocs.length} credential documents…`, { id: tId });
      }
      const tail = unresolved.length ? ` · ${unresolved.length} need a holder` : "";
      toast.success(`Reanalyzed ${done} document${done === 1 ? "" : "s"} — updated ${updated}${tail}.`, { id: tId });
      if (unresolved.length) setResolveQueue(unresolved);
    } finally {
      setReanalyzing(false);
    }
  }

  // Apply the holder decisions from the resolver modal.
  async function applyResolutions(state: ResItem[]) {
    let n = 0;
    for (let i = 0; i < (resolveQueue?.length ?? 0); i++) {
      const item = resolveQueue![i];
      const r = state[i];
      if (!r || r.mode === "skip") continue;
      try {
        if (r.mode === "existing" && r.employeeId) {
          const emp = (employeesQ.data ?? []).find((e) => e.id === r.employeeId);
          if (emp) {
            await updateMut.mutateAsync({ id: item.id, patch: { employeeName: `${emp.firstName} ${emp.lastName}`.trim(), employeeUserId: emp.userId ?? null } });
            n++;
          }
        } else if (r.mode === "new" && r.newName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) {
          const parts = r.newName.trim().split(/\s+/);
          const created = await createEmployee.mutateAsync({
            firstName: parts[0], lastName: parts.slice(1).join(" "),
            email: r.email.trim().toLowerCase(),
            employmentStatus: r.former ? "resigned" : "active",
            workerType: r.workerType,
          });
          await updateMut.mutateAsync({ id: item.id, patch: { employeeName: `${created.firstName} ${created.lastName}`.trim(), employeeUserId: created.userId ?? null } });
          n++;
        }
      } catch { /* skip this one */ }
    }
    setResolveQueue(null);
    toast.success(`Assigned ${n} credential${n === 1 ? "" : "s"}.`);
  }

  // Context: a former employee's expired license is history, not an alarm —
  // exclude former staff from the warning counts and mark their rows instead.
  const holderIdx = useMemo(() => buildHolderIndex(employeesQ.data ?? []), [employeesQ.data]);
  const isFormerHolder = useMemo(() => (c: CredentialRecord) => holderStatus(c, holderIdx) === "former", [holderIdx]);

  // Provider-file view: search only (status filter would hide the expired history
  // the file view is meant to show). Location names for the DEA sub-grouping.
  const locName = useMemo(() => {
    const m = new Map((locationsQ.data ?? []).map((l) => [l.id, l.name] as const));
    return (id: string | null) => (id && m.get(id)) || "No location set";
  }, [locationsQ.data]);
  const searchFiltered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return credentials;
    return credentials.filter((c) => c.credentialName.toLowerCase().includes(q) || c.employeeName.toLowerCase().includes(q));
  }, [credentials, search]);
  const providerFiles = useMemo(() => buildProviderFiles(searchFiltered, isFormerHolder), [searchFiltered, isFormerHolder]);

  const counts = useMemo(() => {
    const out = { active: 0, expiring_soon: 0, expired: 0, no_expiry: 0 };
    for (const c of credentials) {
      if (isFormerHolder(c)) continue;
      out[credentialStatus(c)]++;
    }
    return out;
  }, [credentials, isFormerHolder]);

  async function handleSave(form: FormState, file: File | null) {
    setSaving(true);
    try {
      let documentUrl: string | undefined;
      if (file) {
        try { documentUrl = await uploadFile(file, "credential"); }
        catch { toast.error("Couldn't upload the document — saving the details without it."); }
      }
      const payload = {
        employeeUserId: form.employeeUserId,
        employeeName: form.employeeName.trim(),
        credentialName: form.credentialName.trim(),
        credentialType: form.credentialType as CredentialRecord["credentialType"],
        issuingBody: form.issuingBody.trim() || undefined,
        credentialNumber: form.credentialNumber.trim() || undefined,
        issueDate: form.issueDate ? dateInputToISO(form.issueDate) : undefined,
        expirationDate: form.expirationDate ? dateInputToISO(form.expirationDate) : undefined,
        credentialClass: form.credentialClass,
        boardType: form.boardType.trim() || null,
        ...(documentUrl && { documentUrl }),
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Credential updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Credential added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save credential");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Credentials" />
        <ErrorState message="We couldn't load credentials." onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editing && (
        <CredentialDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {resolveQueue && (
        <HolderResolver
          items={resolveQueue}
          employees={employeesQ.data ?? []}
          onClose={() => setResolveQueue(null)}
          onApply={applyResolutions}
        />
      )}


      <PageHeader
        title="Credentials"
        description="Track licenses, certifications, and clearances. Expiration status is always derived from expiration dates — never stale stored values."
        actions={
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={credentials}
              collection="credentials"
              keyOf={dupKey}
              describe={(c) => ({
                title: c.credentialName,
                subtitle: [c.employeeName || "Unassigned", c.credentialNumber ? `#${c.credentialNumber}` : "", c.expirationDate ? `exp ${formatDate(c.expirationDate)}` : ""].filter(Boolean).join(" · "),
                badges: [credTypeLabel(c.credentialType)],
                hasFile: !!c.documentUrl,
              })}
              score={completeness}
            />
            <Button variant="outline" onClick={reanalyze} disabled={reanalyzing}>
              <Sparkles className="size-4" /> {reanalyzing ? "Analyzing…" : "Auto-fill from files"}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add credential
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Active" value={counts.active} icon={BadgeCheck} tone="success" loading={isLoading} />
        <StatCard label="Expiring ≤30d" value={counts.expiring_soon} icon={BadgeCheck} tone="warning" loading={isLoading} />
        <StatCard label="Expired" value={counts.expired} icon={BadgeCheck} tone="destructive" loading={isLoading} />
        <StatCard label="No expiry" value={counts.no_expiry} icon={BadgeCheck} loading={isLoading} />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search by name or employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "active", "expiring_soon", "expired", "no_expiry"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s]}
                </button>
              ),
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">View</span>
              {([["provider_file", "Provider file"], ["none", "Flat list"], ["type", "By type"], ["employee", "By employee"]] as const).map(([g, label]) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    groupBy === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
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
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : groupBy === "provider_file" ? (
            <CredentialFileView files={providerFiles} locName={locName} onEdit={setEditing} onDeleted={() => void refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No credentials found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "Add your first credential to start tracking."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add credential</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Employee" sortKey="employee" sort={sort} onToggle={toggle} />
                    <SortHeader label="Credential" sortKey="credential" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Issuing body" sortKey="issuer" sort={sort} onToggle={toggle} />
                    <SortHeader label="Expiration" sortKey="expiration" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(groupBy === "none" ? [{ key: "__all__", label: "", items: sorted }] : groups).map((g) => (
                    <Fragment key={g.key}>
                      {groupBy !== "none" && (
                        <tr className="bg-secondary/40">
                          <td colSpan={7} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{g.label}</span> · {g.items.length}
                          </td>
                        </tr>
                      )}
                      {g.items.map((c) => {
                    const st = credentialStatus(c);
                    const days = daysUntil(c.expirationDate);
                    return (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Employee" className="py-3 pr-4 font-medium">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <PersonLink userId={c.employeeUserId ?? null} name={c.employeeName} />
                            {isFormerHolder(c) && <Badge variant="secondary">Former</Badge>}
                          </span>
                        </td>
                        <td data-label="Credential" className="py-3 pr-4">
                          <div>{c.credentialName}</div>
                          {c.credentialNumber && (
                            <div className="text-xs text-muted-foreground">#{c.credentialNumber}</div>
                          )}
                        </td>
                        <td data-label="Type" className="py-3 pr-4">{credTypeLabel(c.credentialType)}</td>
                        <td data-label="Issuing body" className="py-3 pr-4 text-muted-foreground">{c.issuingBody ?? "—"}</td>
                        <td data-label="Expiration" className="py-3 pr-4">
                          {c.expirationDate ? (
                            <div>
                              <div>{formatDate(c.expirationDate)}</div>
                              {days !== null && st !== "no_expiry" && (
                                <div className="text-xs text-muted-foreground">
                                  {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days}d remaining`}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No expiry</span>
                          )}
                        </td>
                        <td data-label="Status" className="py-3 pr-4">
                          <button type="button" onClick={() => setEditing(c)} title="Open to manage" className="cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-primary/40">
                            <Badge variant={isFormerHolder(c) ? "secondary" : STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge>
                          </button>
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex gap-2 md:justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                              Edit
                            </Button>
                            {c.documentUrl && (
                              <FileLink path={c.documentUrl} label="Document" className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary hover:underline" />
                            )}
                            <VersionHistoryButton entityType="credentials" entityId={c.id} title={`${c.credentialName} — ${c.employeeName}`} />
                            <AdminDeleteButton collection="credentials" id={c.id} label={c.credentialName} noun="credential" onDeleted={() => void refetch()} />
                          </div>
                        </td>
                      </tr>
                    );
                      })}
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

"use client";

import { Fragment, useState, useMemo } from "react";
import { BadgeCheck, Plus, Search, Sparkles, X } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { getSignedUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { DuplicateFinder } from "@/components/shared/duplicate-finder";
import { FileLink } from "@/components/shared/file-link";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { credentialStatus, bySoonest } from "@/lib/compliance";
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

type GroupBy = "none" | "type" | "employee";

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
};

/* ----------------------------- dialog ------------------------------- */

function CredentialDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: CredentialRecord;
  onClose: () => void;
  onSave: (data: FormState) => void;
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
        }
      : EMPTY_FORM,
  );

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const valid =
    form.employeeName.trim() !== "" &&
    form.credentialName.trim() !== "" &&
    (form.expirationDate === "" ||
      form.issueDate === "" ||
      parseDate(form.expirationDate)! >= parseDate(form.issueDate)!);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
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
            onClick={() => onSave(form)}
            disabled={!valid || saving}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
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

export default function CredentialsPage() {
  const { data, isLoading, isError, refetch } = useCollection("credentials");
  const profilesQ = useCollection("profiles");
  const employeesQ = useCollection("employees");
  const createMut = useCreate("credentials");
  const updateMut = useUpdate("credentials");
  const createEmployee = useCreate("employees");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
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
  const groups = useMemo(() => {
    if (groupBy === "none") return [] as { key: string; label: string; items: CredentialRecord[] }[];
    const map = new Map<string, CredentialRecord[]>();
    for (const c of filtered) {
      const key = groupBy === "type" ? (c.credentialType || "other") : (c.employeeName.trim() || "Unassigned");
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: groupBy === "type" ? credTypeLabel(key) : key, items }));
  }, [filtered, groupBy]);

  // Re-read every credential that has an attached document and update its type /
  // fill missing fields from the ACTUAL document contents. Never overwrites a
  // field that already has a value (except the type, which is a safe enum).
  async function reanalyze() {
    const withDocs = credentials.filter((c) => c.documentUrl);
    if (withDocs.length === 0) {
      toast.info("No credential documents are attached to analyze. Attach a license/certificate file first.");
      return;
    }
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
          const d = await res.json() as { credentialType?: string; issuingBody?: string | null; credentialNumber?: string | null; issueDate?: string | null; expirationDate?: string | null; matchedUserId?: string | null; holderName?: string | null };
          if (res.ok) {
            const patch: Partial<CredentialRecord> = {};
            if (d.credentialType && CRED_TYPE_SET.has(d.credentialType) && d.credentialType !== c.credentialType) patch.credentialType = d.credentialType as CredentialRecord["credentialType"];
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

  const counts = useMemo(() => {
    const out = { active: 0, expiring_soon: 0, expired: 0, no_expiry: 0 };
    for (const c of credentials) out[credentialStatus(c)]++;
    return out;
  }, [credentials]);

  async function handleSave(form: FormState) {
    setSaving(true);
    try {
      const payload = {
        employeeUserId: form.employeeUserId,
        employeeName: form.employeeName.trim(),
        credentialName: form.credentialName.trim(),
        credentialType: form.credentialType as CredentialRecord["credentialType"],
        issuingBody: form.issuingBody.trim() || undefined,
        credentialNumber: form.credentialNumber.trim() || undefined,
        issueDate: form.issueDate ? dateInputToISO(form.issueDate) : undefined,
        expirationDate: form.expirationDate ? dateInputToISO(form.expirationDate) : undefined,
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
              <Sparkles className="size-4" /> {reanalyzing ? "Analyzing…" : "Reanalyze documents"}
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
              <span className="text-sm text-muted-foreground">Group by</span>
              {(["none", "type", "employee"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                    groupBy === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {g}
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
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Credential</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Issuing body</th>
                    <th className="pb-2 pr-4 font-medium">Expiration</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(groupBy === "none" ? [{ key: "__all__", label: "", items: filtered }] : groups).map((g) => (
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
                        <td data-label="Employee" className="py-3 pr-4 font-medium">{c.employeeName}</td>
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
                          <button type="button" onClick={() => setEditing(c)} title="Open to manage" className="cursor-pointer">
                            <Badge variant={STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge>
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

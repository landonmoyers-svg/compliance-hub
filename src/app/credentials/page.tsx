"use client";

import { useState, useMemo } from "react";
import { BadgeCheck, Plus, Search } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { FileLink } from "@/components/shared/file-link";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { credentialStatus, bySoonest } from "@/lib/compliance";
import { formatDate, daysUntil, parseDate, dateInputToISO } from "@/lib/dates";
import { PersonSelect } from "@/components/shared/person-select";
import type { CredentialRecord } from "@/lib/data/schema";
import { toast } from "sonner";

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
  "clearance",
  "insurance",
  "training",
  "other",
] as const;

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
                  {t.charAt(0).toUpperCase() + t.slice(1)}
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

export default function CredentialsPage() {
  const { data, isLoading, isError, refetch } = useCollection("credentials");
  const createMut = useCreate("credentials");
  const updateMut = useUpdate("credentials");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [editing, setEditing] = useState<CredentialRecord | null | "new">(null);
  const [saving, setSaving] = useState(false);

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

      <PageHeader
        title="Credentials"
        description="Track licenses, certifications, and clearances. Expiration status is always derived from expiration dates — never stale stored values."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add credential
          </Button>
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
                  {filtered.map((c) => {
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
                        <td data-label="Type" className="py-3 pr-4 capitalize">{c.credentialType}</td>
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
                          <Badge variant={STATUS_VARIANT[st]}>{STATUS_LABEL[st]}</Badge>
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
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

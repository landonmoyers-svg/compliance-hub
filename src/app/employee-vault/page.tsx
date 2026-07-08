"use client";

import { useState, useMemo, useRef } from "react";
import {
  FolderLock,
  Plus,
  Search,
  X,
  Check,
  Upload,
  FileText,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate, useRemove } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { uploadFile } from "@/lib/storage";
import { FileLink } from "@/components/shared/file-link";
import { VersionHistoryButton } from "@/components/shared/version-history";
import type { EmployeeDocument, EmployeeDocType, Employee } from "@/lib/data/schema";
import { employeeDocTypes } from "@/lib/data/schema";
import { toast } from "sonner";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const DOC_TYPE_LABEL: Record<EmployeeDocType, string> = {
  offer_letter: "Offer letter",
  employment_contract: "Employment contract",
  i9: "I-9",
  w4: "W-4",
  performance_review: "Performance review",
  disciplinary: "Disciplinary",
  termination: "Termination",
  benefit_enrollment: "Benefit enrollment",
  training_certificate: "Training certificate",
  other: "Other",
};

function employeeFullName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* ─── form types ────────────────────────────────────────────── */

interface DocForm {
  employeeId: string; // "" means none selected
  documentType: EmployeeDocType;
  title: string;
  sensitive: boolean;
  notes: string;
}

function emptyForm(): DocForm {
  return { employeeId: "", documentType: "other", title: "", sensitive: false, notes: "" };
}

/* ─── document dialog ───────────────────────────────────────── */

function DocumentDialog({
  initial,
  employees,
  uploadedByName,
  onClose,
  onSaved,
  createMut,
  updateMut,
}: {
  initial?: EmployeeDocument;
  employees: Employee[];
  uploadedByName: string;
  onClose: () => void;
  onSaved: () => void;
  createMut: ReturnType<typeof useCreate<"employeeDocuments">>;
  updateMut: ReturnType<typeof useUpdate<"employeeDocuments">>;
}) {
  const [form, setForm] = useState<DocForm>(
    initial
      ? {
          employeeId: initial.employeeId ?? "",
          documentType: initial.documentType,
          title: initial.title,
          sensitive: initial.sensitive,
          notes: initial.notes ?? "",
        }
      : emptyForm(),
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = saving || uploading;
  const existingFileUrl = initial?.fileUrl ?? null;

  function pickFile(f: File) {
    if (f.size > MAX_FILE_BYTES) {
      toast.error("File is too large. Maximum size is 25MB.");
      return;
    }
    setFile(f);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("A document title is required.");
      return;
    }

    setSaving(true);
    try {
      let fileUrl: string | null = existingFileUrl;
      if (file) {
        setUploading(true);
        try {
          fileUrl = await uploadFile(file, "employee-vault");
        } catch {
          toast.error("File upload failed. The document was not saved.");
          return; // do not persist the record on upload failure
        } finally {
          setUploading(false);
        }
      }

      const selectedEmployee = employees.find((e) => e.id === form.employeeId);
      const employeeName = selectedEmployee
        ? employeeFullName(selectedEmployee)
        : initial?.employeeName ?? "";

      if (!employeeName) {
        toast.error("Select an employee for this document.");
        return;
      }

      if (initial) {
        await updateMut.mutateAsync({
          id: initial.id,
          patch: {
            employeeId: form.employeeId || null,
            employeeName,
            documentType: form.documentType,
            title: form.title.trim(),
            fileUrl,
            sensitive: form.sensitive,
            notes: form.notes.trim() || undefined,
          },
        });
        toast.success("Document updated");
      } else {
        await createMut.mutateAsync({
          employeeId: form.employeeId || null,
          employeeName,
          documentType: form.documentType,
          title: form.title.trim(),
          fileUrl,
          sensitive: form.sensitive,
          uploadedByName: uploadedByName || undefined,
          notes: form.notes.trim() || undefined,
        });
        toast.success("Document added");
      }
      onSaved();
    } catch {
      toast.error("Failed to save document.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit document" : "Add document"}</h2>
          <button onClick={onClose} disabled={busy} className="text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Employee *</label>
            <select
              className="input w-full"
              value={form.employeeId}
              onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
            >
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeFullName(e)}
                  {e.title ? ` — ${e.title}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Document type</label>
            <select
              className="input w-full"
              value={form.documentType}
              onChange={(e) => setForm((p) => ({ ...p, documentType: e.target.value as EmployeeDocType }))}
            >
              {employeeDocTypes.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title *</label>
            <input
              className="input w-full"
              placeholder="e.g. 2026 Offer Letter"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ""; }}
            />
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                </span>
                <button
                  onClick={() => setFile(null)}
                  disabled={busy}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label="Remove file"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy} className="w-full">
                <Upload className="size-4" /> {existingFileUrl ? "Replace file" : "Choose file"}
              </Button>
            )}
            {existingFileUrl && !file && <FileLink path={existingFileUrl} label="Current file" />}
            <p className="text-xs text-muted-foreground">PDF, DOC, DOCX, PNG, or JPG · max 25MB</p>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.sensitive}
              onChange={(e) => setForm((p) => ({ ...p, sensitive: e.target.checked }))}
              className="mt-0.5 size-4 accent-destructive"
            />
            <span className="text-sm">
              <span className="font-medium">Mark as sensitive / restricted</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Offer letters, disciplinary, termination, and medical records.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              className="input w-full"
              rows={2}
              placeholder="Any context for this document…"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || !form.title.trim() || !form.employeeId}>
            {uploading ? "Uploading…" : saving ? "Saving…" : <><Check className="size-3" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────── */

export default function EmployeeVaultPage() {
  const { profile, user } = useAuth();
  const uploadedByName = profile?.fullName ?? user?.fullName ?? "Unknown";

  const docsQ = useCollection("employeeDocuments");
  const empQ = useCollection("employees");
  const createMut = useCreate("employeeDocuments");
  const updateMut = useUpdate("employeeDocuments");
  const removeMut = useRemove("employeeDocuments");

  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterType, setFilterType] = useState<EmployeeDocType | "all">("all");
  const [editing, setEditing] = useState<EmployeeDocument | null | "new">(null);

  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (filterEmployee !== "all" && (d.employeeId ?? "") !== filterEmployee) return false;
      if (filterType !== "all" && d.documentType !== filterType) return false;
      if (q && !d.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, search, filterEmployee, filterType]);

  const stats = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const employeesWithDocs = new Set(
      documents.map((d) => d.employeeId ?? d.employeeName).filter(Boolean),
    );
    const thisMonth = documents.filter((d) => {
      const c = new Date(d.createdDate);
      return !Number.isNaN(c.getTime()) && c.getMonth() === month && c.getFullYear() === year;
    }).length;
    return {
      total: documents.length,
      sensitive: documents.filter((d) => d.sensitive).length,
      employees: employeesWithDocs.size,
      thisMonth,
    };
  }, [documents]);

  async function handleDelete(doc: EmployeeDocument) {
    if (!confirm(`Remove "${doc.title}" from the active list? A retained copy is kept in version history for legal recordkeeping.`)) return;
    try {
      await removeMut.mutateAsync(doc.id);
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete document.");
    }
  }

  if (docsQ.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employee Vault" />
        <ErrorState message="We couldn't load employee documents." onRetry={() => void docsQ.refetch()} />
      </div>
    );
  }

  const loading = docsQ.isLoading || empQ.isLoading;

  return (
    <div className="space-y-6">
      {editing && (
        <DocumentDialog
          initial={editing === "new" ? undefined : editing}
          employees={employees}
          uploadedByName={uploadedByName}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
          createMut={createMut}
          updateMut={updateMut}
        />
      )}

      <PageHeader
        title="Employee Vault"
        description="Secure storage of HR documents per employee. Flag restricted records (offer letters, disciplinary, termination, medical) as sensitive."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add document
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Documents marked sensitive are flagged as restricted and intended for HR/admin access only.
          Row-level access enforcement is a future server-side concern and is not yet enforced in this view.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total documents" value={stats.total} icon={FolderLock} loading={loading} />
        <StatCard label="Sensitive" value={stats.sensitive} icon={ShieldAlert} tone={stats.sensitive ? "warning" : "default"} loading={loading} />
        <StatCard label="Employees with docs" value={stats.employees} icon={FileText} loading={loading} />
        <StatCard label="This month" value={stats.thisMonth} icon={Upload} tone="success" loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search documents"
              />
            </div>
            <select
              className="input w-auto"
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              aria-label="Filter by employee"
            >
              <option value="all">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{employeeFullName(e)}</option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as EmployeeDocType | "all")}
              aria-label="Filter by document type"
            >
              <option value="all">All types</option>
              {employeeDocTypes.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FolderLock}
              title="No documents found"
              description={
                search || filterEmployee !== "all" || filterType !== "all"
                  ? "Try adjusting your search or filters."
                  : "Add your first employee document to get started."
              }
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add document</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Employee</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Flag</th>
                    <th className="pb-2 pr-4 font-medium">Uploaded</th>
                    <th className="pb-2 pr-4 font-medium">By</th>
                    <th className="pb-2 pr-4 font-medium">File</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-3 pr-4 font-medium">{d.title}</td>
                      <td className="py-3 pr-4">{d.employeeName}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{DOC_TYPE_LABEL[d.documentType]}</td>
                      <td className="py-3 pr-4">
                        {d.sensitive ? (
                          <Badge variant="destructive">Restricted</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDate(d.createdDate)}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{d.uploadedByName ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {d.fileUrl ? (
                          <FileLink path={d.fileUrl} label="View" className="inline-flex items-center gap-1 text-primary hover:underline" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <VersionHistoryButton entityType="employee_documents" entityId={d.id} title={`${d.title} — ${d.employeeName}`} />
                          <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(d)} aria-label="Delete document">
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
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

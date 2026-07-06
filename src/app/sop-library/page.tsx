"use client";

import { useState, useMemo, useRef } from "react";
import { FileText, Plus, Search, Upload, X } from "lucide-react";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { FileLink } from "@/components/shared/file-link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { documentNeedsReview } from "@/lib/compliance";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { ComplianceDocument } from "@/lib/data/schema";
import { toast } from "sonner";

const MAX_FILE_MB = 25;

const STATUS_VARIANT = {
  active: "success",
  draft: "secondary",
  under_review: "warning",
  archived: "outline",
} as const;

const ACCESS_LABEL = {
  all_staff: "All staff",
  clinical: "Clinical",
  hr: "HR",
  admin: "Admin",
} as const;

/* ----------------------------- dialog ------------------------------- */

interface DocForm {
  title: string;
  documentType: string;
  complianceArea: string;
  summary: string;
  status: ComplianceDocument["status"];
  accessLevel: ComplianceDocument["accessLevel"];
  version: string;
  reviewDate: string;
  requiresAcknowledgment: boolean;
  fileUrl: string;
}

const EMPTY: DocForm = {
  title: "",
  documentType: "policy",
  complianceArea: "",
  summary: "",
  status: "active",
  accessLevel: "all_staff",
  version: "1.0",
  reviewDate: "",
  requiresAcknowledgment: false,
  fileUrl: "",
};

function DocDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: ComplianceDocument;
  onClose: () => void;
  onSave: (data: DocForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<DocForm>(
    initial
      ? {
          title: initial.title,
          documentType: initial.documentType,
          complianceArea: initial.complianceArea ?? "",
          summary: initial.summary ?? "",
          status: initial.status,
          accessLevel: initial.accessLevel,
          version: initial.version,
          reviewDate: initial.reviewDate ?? "",
          requiresAcknowledgment: initial.requiresAcknowledgment,
          fileUrl: initial.fileUrl ?? "",
        }
      : EMPTY,
  );
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set =
    (k: keyof DocForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_FILE_MB}MB).`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "sop");
      setForm((p) => ({ ...p, fileUrl: url }));
      setFileName(file.name);
      toast.success("File uploaded");
    } catch {
      toast.error("Upload failed. Save without a file or try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{initial ? "Edit document" : "Add document"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Title *</label>
            <input className="input w-full" value={form.title} onChange={set("title")} placeholder="Document title" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <input className="input w-full" value={form.documentType} onChange={set("documentType")} placeholder="policy, procedure, form…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Compliance area</label>
            <input className="input w-full" value={form.complianceArea} onChange={set("complianceArea")} placeholder="HIPAA, OSHA, HR…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Version</label>
            <input className="input w-full" value={form.version} onChange={set("version")} placeholder="1.0" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <select className="input w-full" value={form.status} onChange={set("status")}>
              {(["active", "draft", "under_review", "archived"] as const).map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Access level</label>
            <select className="input w-full" value={form.accessLevel} onChange={set("accessLevel")}>
              {(["all_staff", "clinical", "hr", "admin"] as const).map((a) => (
                <option key={a} value={a}>{ACCESS_LABEL[a]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Review date</label>
            <input type="date" className="input w-full" value={form.reviewDate} onChange={set("reviewDate")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Summary</label>
            <textarea
              className="input w-full resize-none"
              rows={2}
              value={form.summary}
              onChange={set("summary")}
              placeholder="Brief description"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">Document file (PDF/DOC)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            {form.fileUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{fileName || "Attached file"}</span>
                </span>
                <button onClick={() => { setForm((p) => ({ ...p, fileUrl: "" })); setFileName(""); }} className="text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading…" : <><Upload className="size-4" /> Upload file</>}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="ack"
              type="checkbox"
              checked={form.requiresAcknowledgment}
              onChange={(e) => setForm((p) => ({ ...p, requiresAcknowledgment: e.target.checked }))}
              className="size-4"
            />
            <label htmlFor="ack" className="text-sm">Requires staff acknowledgment</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.title.trim() || saving || uploading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- page --------------------------------- */

export default function SOPLibraryPage() {
  const { data, isLoading, isError, refetch } = useCollection("documents");
  const createMut = useCreate("documents");
  const updateMut = useUpdate("documents");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ComplianceDocument["status"] | "all">("all");
  const [editing, setEditing] = useState<ComplianceDocument | null | "new">(null);
  const [saving, setSaving] = useState(false);

  const docs = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return docs.filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (q &&
        !d.title.toLowerCase().includes(q) &&
        !(d.complianceArea ?? "").toLowerCase().includes(q) &&
        !(d.summary ?? "").toLowerCase().includes(q) &&
        !(d.content ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, search, filterStatus]);

  const needsReview = useMemo(() => docs.filter(documentNeedsReview).length, [docs]);

  async function handleSave(form: DocForm) {
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        documentType: form.documentType.trim() || "policy",
        complianceArea: form.complianceArea.trim() || undefined,
        summary: form.summary.trim() || undefined,
        status: form.status,
        accessLevel: form.accessLevel,
        version: form.version.trim() || "1.0",
        reviewDate: form.reviewDate ? dateInputToISO(form.reviewDate) : undefined,
        requiresAcknowledgment: form.requiresAcknowledgment,
        fileUrl: form.fileUrl || null,
      };
      if (editing && editing !== "new") {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Document updated");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Document added");
      }
      setEditing(null);
    } catch {
      toast.error("Failed to save document");
    } finally {
      setSaving(false);
    }
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="SOP Library" />
        <ErrorState message="We couldn't load documents." onRetry={() => void refetch()} />
      </div>
    );
  }

  const active = docs.filter((d) => d.status === "active").length;
  const drafts = docs.filter((d) => d.status === "draft").length;

  return (
    <div className="space-y-6">
      {editing && (
        <DocDialog
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      <PageHeader
        title="SOP Library"
        description="Policies, procedures, and compliance documents. Review dates are tracked and flagged automatically."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add document
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Active" value={active} icon={FileText} tone="success" loading={isLoading} />
        <StatCard label="Drafts" value={drafts} icon={FileText} loading={isLoading} />
        <StatCard label="Past review date" value={needsReview} icon={FileText} tone={needsReview ? "warning" : "default"} loading={isLoading} />
        <StatCard label="Total" value={docs.length} icon={FileText} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search title or area…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {(["all", "active", "draft", "under_review", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents found"
              description={search || filterStatus !== "all" ? "Try adjusting your search or filter." : "Add your first document to get started."}
              action={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Add document</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Type / Area</th>
                    <th className="pb-2 pr-4 font-medium">Version</th>
                    <th className="pb-2 pr-4 font-medium">Access</th>
                    <th className="pb-2 pr-4 font-medium">Review date</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const pastReview = documentNeedsReview(d);
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{d.title}</div>
                          {d.requiresAcknowledgment && (
                            <div className="text-xs text-muted-foreground">Acknowledgment required</div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="capitalize">{d.documentType}</div>
                          {d.complianceArea && (
                            <div className="text-xs text-muted-foreground">{d.complianceArea}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4">v{d.version}</td>
                        <td className="py-3 pr-4">{ACCESS_LABEL[d.accessLevel]}</td>
                        <td className="py-3 pr-4">
                          {d.reviewDate ? (
                            <div>
                              <div className={pastReview ? "text-warning" : ""}>{formatDate(d.reviewDate)}</div>
                              {pastReview && <div className="text-xs text-warning">Past due</div>}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={STATUS_VARIANT[d.status]}>
                            {d.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            {d.fileUrl && (
                              <FileLink path={d.fileUrl} label="View" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-secondary/40" />
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
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

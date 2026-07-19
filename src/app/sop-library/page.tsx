"use client";

import { useState, useMemo, useRef } from "react";
import { FileText, Plus, Search, Upload, X, Sparkles } from "lucide-react";
import JSZip from "jszip";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { useSort, SortHeader } from "@/components/shared/sortable";
import { FileLink } from "@/components/shared/file-link";
import { VersionHistoryButton } from "@/components/shared/version-history";
import { DuplicateFinder, dupNorm } from "@/components/shared/duplicate-finder";
import { AdminDeleteButton } from "@/components/shared/admin-delete-button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { documentNeedsReview } from "@/lib/compliance";
import { formatDate, dateInputToISO } from "@/lib/dates";
import { humanizeLabel } from "@/lib/format";
import type { ComplianceDocument } from "@/lib/data/schema";
import { toast } from "sonner";

const MAX_FILE_MB = 25;
const EXTRACT_MAX_MB = 12; // only send file bytes to the AI extractor below this

/** Extract readable text from a .docx (a zip of XML) with the JSZip we bundle. */
async function docxToText(file: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  const xml = await doc.async("string");
  return xml
    .replace(/<\/w:p>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = reader.result as string; resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function mediaFromName(name: string, fallback?: string): string {
  const ext = name.toLowerCase().split("?")[0].split(".").pop() ?? "";
  const map: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", txt: "text/plain", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  return map[ext] ?? fallback ?? "application/octet-stream";
}

/**
 * Pull plain text out of a policy file so the Policy Q&A assistant can actually
 * read it. txt/docx are extracted in the browser; PDFs and images go through the
 * AI transcriber (handles scans too). Returns "" if nothing could be read.
 */
async function extractDocumentText(file: Blob, name: string): Promise<string> {
  const media = mediaFromName(name, file.type);
  try {
    if (media === "text/plain" || /\.txt$/i.test(name)) return (await file.text()).trim();
    if (media.includes("word") || /\.docx$/i.test(name)) return await docxToText(file);
    if ((media === "application/pdf" || media.startsWith("image/")) && file.size <= EXTRACT_MAX_MB * 1024 * 1024) {
      const fileBase64 = await blobToBase64(file);
      const res = await fetch("/api/ai/extract-text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mediaType: media }),
      });
      if (res.status === 429) { toast.error("Daily AI limit reached — paste the policy text manually."); return ""; }
      if (!res.ok) return "";
      const d = await res.json() as { text?: string };
      return (d.text ?? "").trim();
    }
  } catch { /* fall through */ }
  return "";
}

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
  content: string;
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
  content: "",
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
          content: initial.content ?? "",
        }
      : EMPTY,
  );
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
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
      // Pull the text out so the Policy Q&A assistant can actually read it.
      setExtracting(true);
      const text = await extractDocumentText(file, file.name);
      if (text) {
        setForm((p) => ({ ...p, content: text }));
        toast.success("Text extracted — the assistant can now use this policy.");
      } else {
        toast.info("Couldn't auto-read this file — paste the policy text below so the assistant can use it.");
      }
    } catch {
      toast.error("Upload failed. Save without a file or try again.");
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  }

  // Backfill text for a policy that was uploaded before (fetches the stored file).
  async function extractFromStored() {
    if (!form.fileUrl) return;
    setExtracting(true);
    try {
      const url = await getSignedUrl(form.fileUrl);
      if (!url) { toast.error("Couldn't open the stored file."); return; }
      const blob = await (await fetch(url)).blob();
      const text = await extractDocumentText(blob, form.fileUrl);
      if (text) { setForm((p) => ({ ...p, content: text })); toast.success("Text extracted from the attached file."); }
      else toast.info("Couldn't read that file — paste the text manually.");
    } catch {
      toast.error("Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
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
                <option key={s} value={s}>{humanizeLabel(s)}</option>
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
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Full text <span className="font-normal text-muted-foreground">— what Policy Q&amp;A reads &amp; quotes</span></label>
              {form.fileUrl && (
                <Button type="button" size="sm" variant="ghost" onClick={extractFromStored} disabled={extracting || uploading}>
                  <Sparkles className="size-3.5" /> {extracting ? "Reading…" : "Extract from file"}
                </Button>
              )}
            </div>
            <textarea
              className="input w-full resize-y font-mono text-xs"
              rows={6}
              value={form.content}
              onChange={set("content")}
              placeholder="The policy's full text. Auto-filled from the uploaded file — edit or paste here so Policy Q&A can ground answers in this document."
            />
            {extracting && <p className="flex items-center gap-1 text-xs text-primary"><Sparkles className="size-3 animate-pulse" /> Reading the document…</p>}
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
          <Button onClick={() => onSave(form)} disabled={!form.title.trim() || saving || uploading || extracting}>
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
  const [backfilling, setBackfilling] = useState(false);

  const docs = useMemo(() => data ?? [], [data]);

  // Documents with a file but no usable text — invisible to Policy Q&A until read.
  const needText = useMemo(
    () => docs.filter((d) => d.fileUrl && (!d.content || d.content.trim().length <= 40)),
    [docs],
  );

  // One-click backfill: read every file-only policy into `content` so the
  // assistant can ground answers in them.
  async function backfillText() {
    if (needText.length === 0) return;
    if (!window.confirm(`Extract text from ${needText.length} policy file${needText.length === 1 ? "" : "s"} so Policy Q&A can read them? Uses AI for PDFs/images.`)) return;
    setBackfilling(true);
    const tId = toast.loading(`Reading 0/${needText.length} documents…`);
    let done = 0, updated = 0;
    try {
      for (const d of needText) {
        try {
          const url = await getSignedUrl(d.fileUrl as string);
          if (url) {
            const blob = await (await fetch(url)).blob();
            const text = await extractDocumentText(blob, d.fileUrl as string);
            if (text) { await updateMut.mutateAsync({ id: d.id, patch: { content: text } }); updated++; }
          }
        } catch { /* skip this one */ }
        done++;
        toast.loading(`Reading ${done}/${needText.length} documents…`, { id: tId });
      }
      toast.success(`Read ${done} document${done === 1 ? "" : "s"} — filled text for ${updated}.`, { id: tId });
      void refetch();
    } finally {
      setBackfilling(false);
    }
  }

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

  const { sorted, sort, toggle } = useSort(filtered, {
    title: (d) => d.title,
    type: (d) => d.documentType,
    version: (d) => d.version,
    access: (d) => ACCESS_LABEL[d.accessLevel],
    review: (d) => d.reviewDate,
    status: (d) => d.status,
  });

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
        content: form.content.trim() || null,
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
          <div className="flex flex-wrap gap-2">
            <DuplicateFinder
              items={docs}
              collection="documents"
              keyOf={(d) => { const k = dupNorm(d.title); return k ? `${k}::${dupNorm(d.documentType)}` : null; }}
              describe={(d) => ({ title: d.title, subtitle: [d.documentType, d.version ? `v${d.version}` : ""].filter(Boolean).join(" · "), hasFile: !!d.fileUrl })}
              score={(d) => (d.fileUrl ? 3 : 0) + (d.content ? 1 : 0) + (d.reviewDate ? 1 : 0)}
            />
            {needText.length > 0 && (
              <Button variant="outline" onClick={backfillText} disabled={backfilling}>
                <Sparkles className="size-4" /> {backfilling ? "Reading…" : `Extract text (${needText.length})`}
              </Button>
            )}
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add document
            </Button>
          </div>
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
                {s === "all" ? "All" : humanizeLabel(s)}
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
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortHeader label="Title" sortKey="title" sort={sort} onToggle={toggle} />
                    <SortHeader label="Type / Area" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortHeader label="Version" sortKey="version" sort={sort} onToggle={toggle} />
                    <SortHeader label="Access" sortKey="access" sort={sort} onToggle={toggle} />
                    <SortHeader label="Review date" sortKey="review" sort={sort} onToggle={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => {
                    const pastReview = documentNeedsReview(d);
                    return (
                      <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td data-label="Title" className="py-3 pr-4">
                          <div className="font-medium">{d.title}</div>
                          {d.requiresAcknowledgment && (
                            <div className="text-xs text-muted-foreground">Acknowledgment required</div>
                          )}
                        </td>
                        <td data-label="Type / Area" className="py-3 pr-4">
                          <div className="capitalize">{humanizeLabel(d.documentType)}</div>
                          {d.complianceArea && (
                            <div className="text-xs text-muted-foreground">{d.complianceArea}</div>
                          )}
                        </td>
                        <td data-label="Version" className="py-3 pr-4">v{d.version}</td>
                        <td data-label="Access" className="py-3 pr-4">{ACCESS_LABEL[d.accessLevel]}</td>
                        <td data-label="Review date" className="py-3 pr-4">
                          {d.reviewDate ? (
                            <div>
                              <div className={pastReview ? "text-warning" : ""}>{formatDate(d.reviewDate)}</div>
                              {pastReview && <div className="text-xs text-warning">Past due</div>}
                            </div>
                          ) : "—"}
                        </td>
                        <td data-label="Status" className="py-3 pr-4">
                          <Badge variant={STATUS_VARIANT[d.status]}>
                            {humanizeLabel(d.status)}
                          </Badge>
                        </td>
                        <td data-label="" className="py-3">
                          <div className="flex items-center gap-1 md:justify-end">
                            {d.fileUrl && (
                              <FileLink path={d.fileUrl} label="Document" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-secondary/40" />
                            )}
                            <VersionHistoryButton entityType="documents" entityId={d.id} title={d.title} />
                            <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>
                            <AdminDeleteButton collection="documents" id={d.id} label={d.title} noun="document" onDeleted={() => void refetch()} />
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

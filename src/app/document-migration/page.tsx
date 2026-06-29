"use client";

import { useState, useRef } from "react";
import { FolderSync, Upload, X, Sparkles, Check, Trash2, FileText, ArrowRight } from "lucide-react";
import { useCreate } from "@/lib/data/hooks";
import { uploadFile } from "@/lib/storage";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { toast } from "sonner";

const MAX_FILE_MB = 25;

interface Classification {
  suggestedType?: string;
  complianceArea?: string;
  summary?: string;
  requiresAcknowledgment?: boolean;
  confidence?: string;
}

interface QueueItem {
  id: string;
  title: string;
  fileUrl: string | null;
  fileName: string;
  pastedText: string;
  stage: "staged" | "classifying" | "classified" | "importing" | "imported";
  classification: Classification | null;
}

let counter = 0;
function makeId() {
  counter += 1;
  return `q-${counter}`;
}

const STEPS = ["Add to queue", "AI classifies", "HR reviews", "Approve & import"] as const;

export default function DocumentMigrationPage() {
  const createDoc = useCreate("documents");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [title, setTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`File too large (max ${MAX_FILE_MB}MB).`); return; }
    setUploading(true);
    try {
      const url = await uploadFile(file, "migration");
      setFileUrl(url);
      setFileName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success("File uploaded");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function addToQueue() {
    if (!title.trim()) { toast.error("Give the document a title."); return; }
    setQueue((q) => [
      { id: makeId(), title: title.trim(), fileUrl, fileName, pastedText: pastedText.trim(), stage: "staged", classification: null },
      ...q,
    ]);
    setTitle(""); setPastedText(""); setFileUrl(null); setFileName("");
    toast.success("Added to migration queue");
  }

  async function classify(item: QueueItem) {
    setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, stage: "classifying" } : i)));
    try {
      const res = await fetch("/api/ai/classify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: item.title, textContent: item.pastedText.slice(0, 2000) }),
      });
      if (!res.ok) throw new Error("classify failed");
      const data = await res.json() as Classification;
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, stage: "classified", classification: data } : i)));
    } catch {
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, stage: "staged" } : i)));
      toast.error("Classification failed — you can still import manually.");
    }
  }

  async function classifyAll() {
    const staged = queue.filter((i) => i.stage === "staged");
    for (const item of staged) await classify(item);
  }

  async function importItem(item: QueueItem) {
    setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, stage: "importing" } : i)));
    try {
      await createDoc.mutateAsync({
        title: item.title,
        documentType: item.classification?.suggestedType || "policy",
        complianceArea: item.classification?.complianceArea || undefined,
        summary: item.classification?.summary || undefined,
        status: "active",
        accessLevel: "all_staff",
        version: "1.0",
        reviewDate: null,
        requiresAcknowledgment: item.classification?.requiresAcknowledgment ?? false,
        fileUrl: item.fileUrl,
      });
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, stage: "imported" } : i)));
      toast.success(`"${item.title}" imported to SOP Library`);
    } catch {
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, stage: "classified" } : i)));
      toast.error("Import failed.");
    }
  }

  function removeItem(id: string) {
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  const pending = queue.filter((i) => i.stage !== "imported");
  const imported = queue.filter((i) => i.stage === "imported").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Migration"
        description="Bulk-migrate existing documents into the SOP Library: stage files, let AI classify them, review, then approve to import."
      />

      {/* Workflow steps */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-full bg-secondary/40 px-3 py-1 text-sm">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">{i + 1}</span>
                  {s}
                </span>
                {i < STEPS.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add to queue */}
      <Card>
        <CardHeader><CardTitle className="text-base">Stage a document</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title *</label>
              <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">File (optional)</label>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
              {fileUrl ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate"><FileText className="size-4 shrink-0 text-primary" /><span className="truncate">{fileName}</span></span>
                  <button onClick={() => { setFileUrl(null); setFileName(""); }} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : <><Upload className="size-4" /> Upload file</>}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Paste text (optional — improves AI classification)</label>
            <textarea className="input min-h-[70px] w-full resize-y" value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste the first paragraph or summary of the document…" />
          </div>
          <div className="flex justify-end">
            <Button onClick={addToQueue} disabled={!title.trim() || uploading}><Sparkles className="size-4" /> Add to queue</Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Migration queue
              {pending.length > 0 && <Badge variant="secondary" className="ml-2">{pending.length} pending</Badge>}
              {imported > 0 && <Badge variant="success" className="ml-1">{imported} imported</Badge>}
            </CardTitle>
            {queue.some((i) => i.stage === "staged") && (
              <Button size="sm" variant="outline" onClick={classifyAll}><Sparkles className="size-4" /> Classify all</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <EmptyState icon={FolderSync} title="Queue is empty" description="Stage a document above to begin migrating it into the SOP Library." />
          ) : (
            <div className="space-y-3">
              {queue.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        {item.fileUrl && <Badge variant="outline" className="gap-1"><FileText className="size-3" /> file</Badge>}
                        {item.stage === "imported" && <Badge variant="success">Imported</Badge>}
                        {item.stage === "classifying" && <Badge variant="warning">Classifying…</Badge>}
                        {item.stage === "importing" && <Badge variant="warning">Importing…</Badge>}
                      </div>
                      {item.classification && (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            <span className="text-foreground">Type:</span> {item.classification.suggestedType ?? "—"} ·{" "}
                            <span className="text-foreground">Area:</span> {item.classification.complianceArea ?? "—"}
                            {item.classification.confidence && <> · <span className="text-foreground">Confidence:</span> {item.classification.confidence}</>}
                          </p>
                          {item.classification.summary && <p className="line-clamp-2">{item.classification.summary}</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {item.stage === "staged" && (
                        <Button size="sm" variant="outline" onClick={() => classify(item)}><Sparkles className="size-4" /> Classify</Button>
                      )}
                      {(item.stage === "classified" || item.stage === "staged") && (
                        <Button size="sm" onClick={() => importItem(item)}><Check className="size-4" /> Import</Button>
                      )}
                      {item.stage !== "imported" && item.stage !== "importing" && (
                        <button onClick={() => removeItem(item.id)} className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

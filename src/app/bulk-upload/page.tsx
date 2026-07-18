"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileText, Copy } from "lucide-react";
import { uploadFile } from "@/lib/storage";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Bulk document uploader. Drops many files straight into the private `documents`
 * bucket via the signed-in session — NO AI analysis runs (that's done separately,
 * so it doesn't burn the AI budget). Files land under the `bulk/` prefix; a
 * reviewer then files each one into the right record (credential / insurance /
 * payer) by matching the original filename.
 */

type Status = "pending" | "uploading" | "done" | "error";
interface Row { name: string; size: number; status: Status; path?: string; error?: string }

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function BulkUploadPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    const start = rows.length;
    setRows((r) => [...r, ...list.map((f) => ({ name: f.name, size: f.size, status: "pending" as Status }))]);
    let ok = 0, fail = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const idx = start + i;
      setRows((r) => r.map((row, j) => (j === idx ? { ...row, status: "uploading" } : row)));
      try {
        const path = await uploadFile(f, "bulk"); // stores the file only — no AI
        setRows((r) => r.map((row, j) => (j === idx ? { ...row, status: "done", path } : row)));
        ok++;
      } catch (e) {
        setRows((r) => r.map((row, j) => (j === idx ? { ...row, status: "error", error: e instanceof Error ? e.message : "Upload failed" } : row)));
        fail++;
      }
    }
    setBusy(false);
    if (fail === 0) toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"}.`);
    else toast.error(`Uploaded ${ok}, ${fail} failed.`);
  }, [rows.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const done = rows.filter((r) => r.status === "done");
  const errored = rows.filter((r) => r.status === "error").length;

  function copyPaths() {
    const text = done.map((r) => r.path).join("\n");
    void navigator.clipboard.writeText(text);
    toast.success(`Copied ${done.length} storage path${done.length === 1 ? "" : "s"}.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Document Upload"
        description="Drag in as many files as you like — licenses, DEA certificates, board certs, COIs, payer letters. They're stored securely in the app with NO AI analysis, so nothing counts against the AI budget. Filing each into the right record is done separately."
      />

      <Card>
        <CardContent className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border bg-secondary/10"}`}
          >
            <Upload className="size-8 text-muted-foreground" />
            <div className="text-sm font-medium">Drag &amp; drop files here</div>
            <div className="text-xs text-muted-foreground">or</div>
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : <>Choose files</>}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ""; }}
            />
            <p className="text-xs text-muted-foreground">Stored privately in the documents bucket. No AI runs on these files.</p>
          </div>

          {rows.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {done.length} uploaded{errored ? ` · ${errored} failed` : ""} · {rows.length} total
                </p>
                {done.length > 0 && (
                  <Button size="sm" variant="outline" onClick={copyPaths}><Copy className="size-3" /> Copy storage paths</Button>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">File</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Stored path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><FileText className="size-3.5 text-muted-foreground" />{r.name}</span></td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtSize(r.size)}</td>
                        <td className="px-3 py-2">
                          {r.status === "done" && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> Stored</span>}
                          {r.status === "uploading" && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Uploading</span>}
                          {r.status === "pending" && <span className="text-muted-foreground">Queued</span>}
                          {r.status === "error" && <span className="inline-flex items-center gap-1 text-destructive" title={r.error}><AlertTriangle className="size-3.5" /> Failed</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.path ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

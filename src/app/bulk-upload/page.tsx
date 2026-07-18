"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FolderUp, CheckCircle2, AlertTriangle, Loader2, FileText, Copy } from "lucide-react";
import { uploadFile } from "@/lib/storage";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Bulk document uploader. Drops many files — or whole folders — straight into
 * the private `documents` bucket via the signed-in session. NO AI analysis runs
 * (that's done separately, so it doesn't burn the AI budget). Files land under
 * `bulk/<relative folder path>/…`, preserving the source subfolder so a reviewer
 * can tell e.g. "Malpractice COI" from "Applications & Agreements".
 */

type Status = "pending" | "uploading" | "done" | "error";
interface Item { file: File; relPath: string }
interface Row { name: string; relPath: string; size: number; status: Status; path?: string; error?: string }

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Sanitize a relative folder path into a safe storage prefix under `bulk/`. */
function folderFor(relPath: string): string {
  const dir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
  const safe = dir.split("/").map((s) => s.replace(/[^a-zA-Z0-9._-]/g, "_")).filter(Boolean).join("/");
  return safe ? `bulk/${safe}` : "bulk";
}

/** Recurse a dropped folder tree (webkitGetAsEntry) into a flat {file, relPath} list. */
function walkEntry(entry: FileSystemEntry, prefix: string, out: Item[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        (f) => { out.push({ file: f, relPath: prefix + entry.name }); resolve(); },
        () => resolve(),
      );
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readAll = () => reader.readEntries((batch) => {
        if (batch.length === 0) { resolve(); return; }
        Promise.all(batch.map((e) => walkEntry(e, prefix + entry.name + "/", out))).then(readAll, () => resolve());
      }, () => resolve());
      readAll();
    } else {
      resolve();
    }
  });
}

async function gatherFromDrop(dt: DataTransfer): Promise<Item[]> {
  const entries = Array.from(dt.items)
    .map((it) => (typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return Array.from(dt.files).map((f) => ({ file: f, relPath: f.name }));
  const out: Item[] = [];
  await Promise.all(entries.map((e) => walkEntry(e, "", out)));
  return out;
}

export default function BulkUploadPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (items: Item[]) => {
    if (items.length === 0) return;
    setBusy(true);
    const start = rows.length;
    setRows((r) => [...r, ...items.map((it) => ({ name: it.file.name, relPath: it.relPath, size: it.file.size, status: "pending" as Status }))]);
    let ok = 0, fail = 0;
    for (let i = 0; i < items.length; i++) {
      const { file, relPath } = items[i];
      const idx = start + i;
      setRows((r) => r.map((row, j) => (j === idx ? { ...row, status: "uploading" } : row)));
      try {
        const path = await uploadFile(file, folderFor(relPath)); // stores the file only — no AI
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

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer) return;
    const items = await gatherFromDrop(e.dataTransfer);
    void upload(items);
  };

  const fromInput = (list: FileList | null) => {
    if (!list) return;
    const items: Item[] = Array.from(list).map((f) => ({
      file: f,
      relPath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    }));
    void upload(items);
  };

  const done = rows.filter((r) => r.status === "done");
  const errored = rows.filter((r) => r.status === "error").length;

  function copyManifest() {
    const text = done.map((r) => `${r.relPath}\t${r.path}`).join("\n");
    void navigator.clipboard.writeText(text);
    toast.success(`Copied ${done.length} path${done.length === 1 ? "" : "s"}.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Document Upload"
        description="Drag in whole folders or many files at once — licenses, DEA certificates, board certs, COIs, payer letters. They're stored securely in the app with NO AI analysis, so nothing counts against the AI budget. The source subfolder is kept so each doc can be filed to the right place."
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
            <div className="text-sm font-medium">Drag &amp; drop files or folders here</div>
            <div className="text-xs text-muted-foreground">or</div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => filesRef.current?.click()} disabled={busy}>
                <FileText className="size-4" /> Choose files
              </Button>
              <Button onClick={() => dirRef.current?.click()} disabled={busy}>
                {busy ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : <><FolderUp className="size-4" /> Choose folder</>}
              </Button>
            </div>
            <input ref={filesRef} type="file" multiple className="hidden"
              onChange={(e) => { fromInput(e.target.files); e.target.value = ""; }} />
            {/* webkitdirectory makes this input pick an entire folder (all files, recursively). */}
            <input ref={dirRef} type="file" multiple className="hidden"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              onChange={(e) => { fromInput(e.target.files); e.target.value = ""; }} />
            <p className="text-xs text-muted-foreground">Stored privately in the documents bucket. No AI runs on these files.</p>
          </div>

          {rows.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {done.length} uploaded{errored ? ` · ${errored} failed` : ""} · {rows.length} total
                </p>
                {done.length > 0 && (
                  <Button size="sm" variant="outline" onClick={copyManifest}><Copy className="size-3" /> Copy manifest</Button>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">File</th>
                      <th className="px-3 py-2 font-medium">Source path</th>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><FileText className="size-3.5 text-muted-foreground" />{r.name}</span></td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.relPath.includes("/") ? r.relPath.slice(0, r.relPath.lastIndexOf("/")) : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtSize(r.size)}</td>
                        <td className="px-3 py-2">
                          {r.status === "done" && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> Stored</span>}
                          {r.status === "uploading" && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Uploading</span>}
                          {r.status === "pending" && <span className="text-muted-foreground">Queued</span>}
                          {r.status === "error" && <span className="inline-flex items-center gap-1 text-destructive" title={r.error}><AlertTriangle className="size-3.5" /> Failed</span>}
                        </td>
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

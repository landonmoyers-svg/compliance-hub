"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import { Download, DatabaseBackup, ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { db } from "@/lib/data";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, daysUntil } from "@/lib/dates";
import { toast } from "sonner";

const BACKUP_DUE_DAYS = 7; // best practice: at least weekly

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export default function BackupPage() {
  const { profile } = useAuth();
  const backupsQ = useCollection("backups");
  const createBackup = useCreate("backups");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const lastBackup = useMemo(() => {
    const b = (backupsQ.data ?? []).slice().sort((a, z) => z.createdDate.localeCompare(a.createdDate))[0];
    return b ?? null;
  }, [backupsQ.data]);
  const daysSince = lastBackup ? -(daysUntil(lastBackup.createdDate) ?? 0) : null;
  const due = daysSince === null || daysSince >= BACKUP_DUE_DAYS;

  async function runBackup() {
    setRunning(true);
    setProgress("Gathering data…");
    try {
      const client = db() as unknown as Record<string, { list: () => Promise<Record<string, unknown>[]> }>;
      const names = Object.keys(client).filter((k) => typeof client[k]?.list === "function");
      const zip = new JSZip();
      const all: Record<string, unknown[]> = {};
      let total = 0;
      const counts: Record<string, number> = {};
      for (const name of names) {
        setProgress(`Exporting ${name}…`);
        try {
          const rows = await client[name].list();
          all[name] = rows;
          counts[name] = rows.length;
          total += rows.length;
          if (rows.length) zip.file(`data/${name}.csv`, toCsv(rows));
        } catch { counts[name] = -1; }
      }
      const stamp = new Date().toISOString().slice(0, 10);
      zip.file("backup.json", JSON.stringify(all, null, 2));
      zip.file("README.txt", readme(stamp, total, counts, profile?.fullName ?? "an administrator"));
      zip.file("index.html", indexHtml(stamp, total, counts));

      setProgress("Packaging…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-hub-backup-${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      await createBackup.mutateAsync({ performedBy: profile?.fullName ?? undefined, itemCount: total, format: "zip (csv + json)", notes: `${names.length} datasets` }).catch(() => {});
      toast.success(`Backup downloaded — ${total} records across ${names.length} datasets.`);
    } catch {
      toast.error("Backup failed. Try again.");
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Data Backup" description="Export a complete, offsite copy of your compliance data — readable without the app — and stay on a compliant backup schedule." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Last backup" value={lastBackup ? (daysSince === 0 ? "Today" : `${daysSince}d ago`) : "Never"} icon={Clock} tone={due ? "warning" : "success"} loading={backupsQ.isLoading} />
        <StatCard label="Backup status" value={due ? "Due" : "Current"} icon={due ? Clock : CheckCircle2} tone={due ? "warning" : "success"} loading={backupsQ.isLoading} />
        <StatCard label="Backups on record" value={(backupsQ.data ?? []).length} icon={DatabaseBackup} loading={backupsQ.isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><DatabaseBackup className="size-4 text-primary" /> Download a full backup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generates a ZIP with every dataset as a <span className="font-medium text-foreground">CSV</span> (opens in Excel/Numbers), a complete <span className="font-medium text-foreground">backup.json</span>, and a readable <span className="font-medium text-foreground">index.html</span> summary — including your retained <span className="font-medium text-foreground">version history</span>. Store it in your offsite location (encrypted drive or backup service). No app needed to read it.
          </p>
          <Button onClick={runBackup} disabled={running}><Download className="size-4" /> {running ? (progress || "Working…") : "Download full backup (ZIP)"}</Button>
          <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground"><ShieldCheck className="size-3.5" /> Backup best practice & law</p>
            HIPAA requires a data backup and contingency plan (45 CFR 164.308(a)(7)). Follow the <span className="font-medium">3-2-1 rule</span> — 3 copies, 2 media types, 1 offsite — back up at least <span className="font-medium">weekly</span>, keep records <span className="font-medium">6 years</span>, and <span className="font-medium">test a restore</span> periodically. Your database is also backed up automatically by Supabase; this export is your portable, offsite copy. Uploaded file attachments live in Supabase Storage and are referenced by path in the export.
          </div>
        </CardContent>
      </Card>

      {(backupsQ.data ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Backup history</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {(backupsQ.data ?? []).slice().sort((a, z) => z.createdDate.localeCompare(a.createdDate)).slice(0, 20).map((b) => (
                <div key={b.id} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
                  <span>{formatDate(b.createdDate, "MMM d, yyyy · h:mm a")}</span>
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <span>{b.itemCount} records</span>
                    <Badge variant="outline">{b.format ?? "zip"}</Badge>
                    <span>{b.performedBy ?? "—"}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function readme(stamp: string, total: number, counts: Record<string, number>, by: string): string {
  const lines = Object.entries(counts).map(([k, v]) => `  - ${k}: ${v < 0 ? "not accessible" : v}`).join("\n");
  return `LONE PEAK PSYCHIATRY — COMPLIANCE HUB DATA BACKUP
Generated: ${stamp} by ${by}
Total records: ${total}

WHAT'S INSIDE
  - data/*.csv    One CSV per dataset. Open in Excel, Numbers, or any spreadsheet.
  - backup.json   Full machine-readable copy of every dataset.
  - index.html    Human-readable summary (open in any web browser).

This is a portable, offsite copy of the compliance program's data, including the
retained version history of governed records. No application is required to read it.

DATASETS
${lines}

RETENTION & HANDLING
  - HIPAA requires retention of compliance records for at least 6 years.
  - Store this backup securely (encrypted) in an offsite location per the 3-2-1 rule.
  - Uploaded file attachments (PDFs, images) are stored in Supabase Storage and are
    referenced here by their object path; back those up from Supabase as needed.
`;
}

function indexHtml(stamp: string, total: number, counts: Record<string, number>): string {
  const rows = Object.entries(counts).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v < 0 ? "—" : v}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Compliance Hub Backup ${stamp}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border-bottom:1px solid #eee;padding:6px 8px;font-size:14px}th{text-align:left}.muted{color:#666;font-size:13px}</style></head>
<body><h1>Compliance Hub — Data Backup</h1>
<p class="muted">Generated ${stamp} · ${total} total records. Open the CSV files in the <code>data/</code> folder, or <code>backup.json</code>, to view the data.</p>
<table><thead><tr><th>Dataset</th><th style="text-align:right">Records</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">Retain for at least 6 years (HIPAA). Store securely offsite.</p></body></html>`;
}

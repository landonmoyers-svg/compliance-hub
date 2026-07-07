"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Sparkles, ArrowUpRight } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { daysUntil } from "@/lib/dates";

type Status = "strong" | "partial" | "gap";
const STATUS_VARIANT: Record<Status, "success" | "warning" | "destructive"> = { strong: "success", partial: "warning", gap: "destructive" };
const STATUS_SCORE: Record<Status, number> = { strong: 100, partial: 60, gap: 20 };

export default function ProgramEffectivenessPage() {
  const documents = useCollection("documents");
  const training = useCollection("trainingAssignments");
  const incidents = useCollection("incidents");
  const capas = useCollection("correctiveActions");
  const audits = useCollection("audits");
  const sra = useCollection("sraAssessments");
  const screenings = useCollection("exclusionScreenings");
  const disciplinary = useCollection("disciplinaryActions");
  const employees = useCollection("employees");
  const [report, setReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const elements = useMemo(() => {
    const docs = (documents.data ?? []).filter((d) => d.status === "active").length;
    const tr = training.data ?? [];
    const trainingRate = tr.length ? Math.round((tr.filter((t) => t.status === "completed").length / tr.length) * 100) : 0;
    const incCount = (incidents.data ?? []).length;
    const openInc = (incidents.data ?? []).filter((i) => i.status !== "closed").length;
    const capaList = capas.data ?? [];
    const capaClosed = capaList.filter((c) => c.status === "complete").length;
    const auditCount = (audits.data ?? []).length;
    const hasSra = (sra.data ?? []).length > 0;
    const recentScreen = (screenings.data ?? []).filter((s) => { const d = daysUntil(s.screenedDate); return d !== null && -d <= 30; }).length;
    const disc = (disciplinary.data ?? []).length;
    const hasCO = (employees.data ?? []).some((e) => (e.jobRole ?? "").toLowerCase().includes("compliance") || (e.jobRole ?? "").toLowerCase().includes("integrator"));

    const el = (name: string, status: Status, metric: string, href: string) => ({ name, status, metric, href });
    return [
      el("1. Written policies, procedures & standards of conduct", docs >= 15 ? "strong" : docs >= 5 ? "partial" : "gap", `${docs} active policies`, "/sop-library"),
      el("2. Compliance officer & oversight", hasCO ? "strong" : "partial", hasCO ? "Compliance leadership designated" : "Designate a compliance officer", "/org-chart"),
      el("3. Effective training & education", trainingRate >= 90 ? "strong" : trainingRate >= 60 ? "partial" : "gap", `${trainingRate}% training completion`, "/training"),
      el("4. Effective lines of communication", incCount > 0 ? "strong" : "partial", incCount > 0 ? `${incCount} reports (incl. anonymous)` : "Reporting channel open, no reports yet", "/incidents"),
      el("5. Internal monitoring & auditing", (auditCount > 0 && hasSra) ? "strong" : (auditCount > 0 || hasSra) ? "partial" : "gap", `${auditCount} audits · SRA ${hasSra ? "done" : "not started"} · ${recentScreen} screenings/30d`, "/audits"),
      el("6. Enforcement of standards", disc > 0 ? "strong" : "partial", disc > 0 ? `${disc} disciplinary records` : "Sanction policy defined; no actions logged", "/hr/disciplinary"),
      el("7. Prompt response & corrective action", capaList.length > 0 ? (capaClosed === capaList.length ? "strong" : "partial") : (openInc === 0 ? "partial" : "gap"), `${capaClosed}/${capaList.length} corrective actions closed`, "/incidents"),
    ];
  }, [documents.data, training.data, incidents.data, capas.data, audits.data, sra.data, screenings.data, disciplinary.data, employees.data]);

  const overall = Math.round(elements.reduce((s, e) => s + STATUS_SCORE[e.status], 0) / elements.length);

  async function generateReport() {
    setLoadingReport(true);
    try {
      const res = await fetch("/api/ai/board-report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements: elements.map((e) => ({ name: e.name, status: e.status, metric: e.metric })), overall, period: "this quarter" }),
      });
      const data = await res.json() as { text?: string; error?: string };
      setReport(data.text ?? data.error ?? "Couldn't generate the report.");
    } catch { setReport("Network error generating the report."); }
    finally { setLoadingReport(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Program Effectiveness" description="Your compliance program mapped to the OIG's seven elements of an effective compliance program — with a board-ready summary."
        actions={<Button onClick={generateReport} disabled={loadingReport}><Sparkles className="size-4" /> {loadingReport ? "Writing…" : "Generate board report"}</Button>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Overall program score" value={`${overall}%`} icon={ShieldCheck} tone={overall >= 85 ? "success" : overall >= 60 ? "warning" : "destructive"} />
        <StatCard label="Elements strong" value={elements.filter((e) => e.status === "strong").length} icon={ShieldCheck} tone="success" />
        <StatCard label="Elements with gaps" value={elements.filter((e) => e.status === "gap").length} icon={ShieldCheck} tone={elements.some((e) => e.status === "gap") ? "destructive" : "default"} />
      </div>

      {report && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" /> Quarterly board report (draft)</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{report}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">The seven elements</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {elements.map((e) => (
            <div key={e.name} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Badge variant={STATUS_VARIANT[e.status]} className="shrink-0 capitalize">{e.status}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">{e.metric}</p>
              </div>
              <Button asChild size="sm" variant="ghost"><Link href={e.href}><ArrowUpRight className="size-4" /></Link></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

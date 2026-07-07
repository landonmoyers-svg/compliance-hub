"use client";

import { useState, useMemo } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { TrendingUp, Download, FileText } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { credentialStatus, computeComplianceScore, assignmentIsOverdue, documentNeedsReview, taskIsOverdue } from "@/lib/compliance";
import { DEFAULT_ORG_NAME } from "@/lib/org";
import { formatDate } from "@/lib/dates";

type Tab = "overview" | "credentials" | "training" | "risk";

export default function ReportsPage() {
  const tasksQ = useCollection("tasks");
  const credsQ = useCollection("credentials");
  const docsQ = useCollection("documents");
  const trainingQ = useCollection("trainingAssignments");
  const riskQ = useCollection("riskCases");
  const empQ = useCollection("employees");
  const vendorsQ = useCollection("vendors");
  const insuranceQ = useCollection("insurancePolicies");
  const orgSettingsQ = useCollection("organizationSettings");

  const [tab, setTab] = useState<Tab>("overview");

  const queries = [tasksQ, credsQ, docsQ, trainingQ, riskQ, empQ, vendorsQ, insuranceQ, orgSettingsQ];
  const loading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const credentials = useMemo(() => credsQ.data ?? [], [credsQ.data]);
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const training = useMemo(() => trainingQ.data ?? [], [trainingQ.data]);
  const risk = useMemo(() => riskQ.data ?? [], [riskQ.data]);
  const employees = useMemo(() => empQ.data ?? [], [empQ.data]);
  const vendors = useMemo(() => vendorsQ.data ?? [], [vendorsQ.data]);
  const insurancePolicies = useMemo(() => insuranceQ.data ?? [], [insuranceQ.data]);
  const orgSettings = useMemo(() => orgSettingsQ.data ?? [], [orgSettingsQ.data]);

  const score = useMemo(
    () => computeComplianceScore({ tasks, credentials, trainingAssignments: training, documents, riskCases: risk }),
    [tasks, credentials, training, documents, risk],
  );

  const credStats = useMemo(() => {
    const active = credentials.filter((c) => credentialStatus(c) === "active").length;
    const expiring = credentials.filter((c) => credentialStatus(c) === "expiring_soon").length;
    const expired = credentials.filter((c) => credentialStatus(c) === "expired").length;
    return { active, expiring, expired, total: credentials.length };
  }, [credentials]);

  const trainingStats = useMemo(() => {
    const completed = training.filter((a) => a.status === "completed").length;
    const overdue = training.filter(assignmentIsOverdue).length;
    const pending = training.filter((a) => a.status !== "completed" && !assignmentIsOverdue(a)).length;
    return { completed, overdue, pending, total: training.length };
  }, [training]);

  function exportCSV(rows: string[][], filename: string) {
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCredentials() {
    const header = ["Employee", "Credential", "Type", "Issuing Body", "Expiration Date", "Status"];
    const rows = credentials.map((c) => [
      c.employeeName,
      c.credentialName,
      c.credentialType,
      c.issuingBody ?? "",
      c.expirationDate ? formatDate(c.expirationDate) : "No expiry",
      credentialStatus(c),
    ]);
    exportCSV([header, ...rows], "credentials-report.csv");
  }

  function exportTraining() {
    const header = ["Employee", "Module", "Status", "Due Date", "Completed At"];
    const rows = training.map((a) => [
      a.assignedToName,
      a.moduleTitle,
      a.status,
      a.dueDate ? formatDate(a.dueDate) : "",
      a.completedAt ? formatDate(a.completedAt) : "",
    ]);
    exportCSV([header, ...rows], "training-report.csv");
  }

  function generateCompliancePacket() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const generatedLabel = now.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    const orgName = orgSettings[0]?.orgName ?? DEFAULT_ORG_NAME;

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    function ensureSpace(needed: number) {
      if (y > pageHeight - margin - needed) {
        doc.addPage();
        y = margin;
      }
    }

    function sectionHeader(title: string) {
      ensureSpace(48);
      y += 8;
      doc.setDrawColor(210);
      doc.line(margin, y, pageWidth - margin, y);
      y += 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20);
      doc.text(title, margin, y);
      y += 18;
    }

    // Column-based table row. `cols` are [text, width-fraction] pairs.
    function tableHeader(cells: string[], widths: number[]) {
      ensureSpace(28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(120);
      let x = margin;
      cells.forEach((c, i) => {
        doc.text(c, x, y);
        x += widths[i] * contentWidth;
      });
      y += 12;
      doc.setDrawColor(225);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;
    }

    function tableRow(cells: string[], widths: number[]) {
      // Wrap each cell to its column width and take the tallest.
      const wrapped = cells.map((c, i) =>
        doc.splitTextToSize(c || "—", widths[i] * contentWidth - 6) as string[],
      );
      const rowHeight = Math.max(...wrapped.map((w) => w.length)) * 12 + 4;
      ensureSpace(rowHeight + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40);
      let x = margin;
      wrapped.forEach((lines, i) => {
        doc.text(lines, x, y);
        x += widths[i] * contentWidth;
      });
      y += rowHeight;
    }

    function bodyLine(text: string) {
      ensureSpace(16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40);
      const lines = doc.splitTextToSize(text, contentWidth) as string[];
      doc.text(lines, margin, y);
      y += lines.length * 13 + 2;
    }

    // -------- Header --------
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text(`${orgName} — Compliance Report`, margin, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Audit-readiness packet · Generated ${generatedLabel}`, margin, y);
    y += 6;

    // -------- Compliance summary --------
    sectionHeader("Compliance summary");
    const overdueTasks = tasks.filter(taskIsOverdue).length;
    const docsPastReview = documents.filter(documentNeedsReview).length;
    const openRisk = risk.filter((r) => r.status === "open" || r.status === "investigating").length;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20);
    doc.text(`Overall score: ${score.score}/100`, margin, y);
    y += 24;

    const summaryRows: [string, string][] = [
      ["Overdue tasks", String(overdueTasks)],
      ["Expired credentials", String(credStats.expired)],
      ["Expiring credentials (≤30d)", String(credStats.expiring)],
      ["Overdue training", String(trainingStats.overdue)],
      ["Documents past review", String(docsPastReview)],
      ["Open risk cases", String(openRisk)],
    ];
    for (const [label, value] of summaryRows) {
      ensureSpace(16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(label, margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20);
      doc.text(value, margin + 200, y);
      y += 15;
    }

    // -------- Credentials --------
    sectionHeader("Credentials");
    if (credentials.length === 0) {
      bodyLine("No credentials on record.");
    } else {
      const widths = [0.3, 0.32, 0.18, 0.2];
      tableHeader(["Employee", "Credential", "Status", "Expiration"], widths);
      for (const c of credentials) {
        tableRow(
          [
            c.employeeName,
            c.credentialName,
            credentialStatus(c).replace("_", " "),
            c.expirationDate ? formatDate(c.expirationDate) : "No expiry",
          ],
          widths,
        );
      }
    }

    // -------- Training --------
    sectionHeader("Training");
    if (training.length === 0) {
      bodyLine("No training assignments on record.");
    } else {
      const widths = [0.3, 0.4, 0.18, 0.12];
      tableHeader(["Employee", "Module", "Status", "Score"], widths);
      for (const a of training) {
        tableRow(
          [
            a.assignedToName,
            a.moduleTitle,
            assignmentIsOverdue(a) ? "overdue" : a.status,
            a.score != null ? String(a.score) : "—",
          ],
          widths,
        );
      }
    }

    // -------- Policies & SOPs --------
    sectionHeader("Policies & SOPs");
    const activeDocs = documents.filter((d) => d.status === "active");
    if (activeDocs.length === 0) {
      bodyLine("No active policy documents on record.");
    } else {
      const widths = [0.42, 0.22, 0.14, 0.22];
      tableHeader(["Title", "Type", "Version", "Review date"], widths);
      for (const d of activeDocs) {
        tableRow(
          [
            d.title,
            d.documentType,
            d.version,
            d.reviewDate ? formatDate(d.reviewDate) : "—",
          ],
          widths,
        );
      }
    }

    // -------- Vendors & BAAs --------
    sectionHeader("Vendors & BAAs");
    if (vendors.length === 0) {
      bodyLine("No vendors on record.");
    } else {
      const widths = [0.3, 0.24, 0.24, 0.22];
      tableHeader(["Vendor", "Type", "BAA status", "Insurance exp."], widths);
      for (const v of vendors) {
        const baaGap = v.baaRequired && v.baaStatus !== "signed";
        tableRow(
          [
            v.vendorName,
            v.vendorType.replace(/_/g, " "),
            baaGap ? `${v.baaStatus.replace(/_/g, " ")} (GAP)` : v.baaStatus.replace(/_/g, " "),
            v.insuranceExpirationDate ? formatDate(v.insuranceExpirationDate) : "—",
          ],
          widths,
        );
      }
      const gaps = vendors.filter((v) => v.baaRequired && v.baaStatus !== "signed");
      if (gaps.length > 0) {
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(200, 60, 60);
        ensureSpace(16);
        doc.text(
          `${gaps.length} vendor(s) require a signed BAA but do not have one.`,
          margin,
          y,
        );
        y += 14;
        doc.setTextColor(40);
      }
    }

    // -------- Insurance --------
    sectionHeader("Insurance");
    if (insurancePolicies.length === 0) {
      bodyLine("No insurance policies on record.");
    } else {
      const widths = [0.4, 0.26, 0.34];
      tableHeader(["Policy", "Type", "Renewal date"], widths);
      for (const p of insurancePolicies) {
        tableRow(
          [
            p.policyName,
            p.policyType,
            p.renewalDate ? formatDate(p.renewalDate) : "—",
          ],
          widths,
        );
      }
    }

    // -------- Open risk cases --------
    sectionHeader("Open risk cases");
    const openCases = risk.filter((r) => r.status === "open" || r.status === "investigating");
    if (openCases.length === 0) {
      bodyLine("No open risk cases.");
    } else {
      const widths = [0.5, 0.25, 0.25];
      tableHeader(["Case", "Severity", "Status"], widths);
      for (const r of openCases) {
        tableRow([r.caseTitle, r.severity, r.status], widths);
      }
    }

    doc.save(`compliance-packet-${dateStr}.pdf`);
    toast.success("Compliance packet downloaded.");
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <ErrorState
          message="We couldn't load report data."
          onRetry={() => queries.forEach((q) => void q.refetch())}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Analytics and exportable reports across all compliance areas."
        actions={
          <Button onClick={generateCompliancePacket} disabled={loading}>
            <FileText className="size-4" /> Download compliance packet (PDF)
          </Button>
        }
      />

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border">
        {(["overview", "credentials", "training", "risk"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Compliance score" value={score.score} icon={TrendingUp} tone={score.score >= 85 ? "success" : score.score >= 70 ? "warning" : "destructive"} loading={loading} />
            <StatCard label="Critical items" value={score.criticalCount} icon={TrendingUp} tone="destructive" loading={loading} />
            <StatCard label="High priority" value={score.highCount} icon={TrendingUp} tone="warning" loading={loading} />
            <StatCard label="Active employees" value={employees.filter((e) => e.employmentStatus === "active").length} icon={TrendingUp} loading={loading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Score breakdown</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-32 w-full" /> : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Starting score</span>
                      <span className="tabular-nums font-medium text-foreground">100</span>
                    </div>
                    {score.factors.map((f) => (
                      <div key={f.key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{f.label} ({f.count})</span>
                        <span className="tabular-nums text-destructive">{f.impact}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                      <span>Final score</span>
                      <span className="tabular-nums">{score.score}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Quick summary</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {loading ? <Skeleton className="h-32 w-full" /> : (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Overdue tasks</span><span>{tasks.filter(taskIsOverdue).length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Expired credentials</span><span>{credStats.expired}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Expiring credentials</span><span>{credStats.expiring}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Overdue training</span><span>{trainingStats.overdue}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Docs past review</span><span>{documents.filter(documentNeedsReview).length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Open risk cases</span><span>{risk.filter((r) => r.status === "open" || r.status === "investigating").length}</span></div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "credentials" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportCredentials} disabled={loading}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Active" value={credStats.active} icon={TrendingUp} tone="success" loading={loading} />
            <StatCard label="Expiring" value={credStats.expiring} icon={TrendingUp} tone="warning" loading={loading} />
            <StatCard label="Expired" value={credStats.expired} icon={TrendingUp} tone="destructive" loading={loading} />
            <StatCard label="Total" value={credStats.total} icon={TrendingUp} loading={loading} />
          </div>
          <Card>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Employee</th>
                        <th className="pb-2 pr-4 font-medium">Credential</th>
                        <th className="pb-2 pr-4 font-medium">Expiration</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map((c) => (
                        <tr key={c.id} className="border-b border-border/50">
                          <td className="py-2 pr-4">{c.employeeName}</td>
                          <td className="py-2 pr-4">{c.credentialName}</td>
                          <td className="py-2 pr-4">{c.expirationDate ? formatDate(c.expirationDate) : "No expiry"}</td>
                          <td className="py-2 capitalize">{credentialStatus(c).replace("_", " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "training" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportTraining} disabled={loading}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Completed" value={trainingStats.completed} icon={TrendingUp} tone="success" loading={loading} />
            <StatCard label="Pending" value={trainingStats.pending} icon={TrendingUp} tone="warning" loading={loading} />
            <StatCard label="Overdue" value={trainingStats.overdue} icon={TrendingUp} tone="destructive" loading={loading} />
            <StatCard label="Total" value={trainingStats.total} icon={TrendingUp} loading={loading} />
          </div>
          <Card>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Employee</th>
                        <th className="pb-2 pr-4 font-medium">Module</th>
                        <th className="pb-2 pr-4 font-medium">Due date</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {training.map((a) => (
                        <tr key={a.id} className="border-b border-border/50">
                          <td className="py-2 pr-4">{a.assignedToName}</td>
                          <td className="py-2 pr-4">{a.moduleTitle}</td>
                          <td className="py-2 pr-4">{a.dueDate ? formatDate(a.dueDate) : "—"}</td>
                          <td className="py-2">
                            {assignmentIsOverdue(a) ? "Overdue" : a.status}
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
      )}

      {tab === "risk" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Open" value={risk.filter((r) => r.status === "open").length} icon={TrendingUp} tone="warning" loading={loading} />
            <StatCard label="Investigating" value={risk.filter((r) => r.status === "investigating").length} icon={TrendingUp} tone="warning" loading={loading} />
            <StatCard label="Resolved" value={risk.filter((r) => r.status === "resolved").length} icon={TrendingUp} tone="success" loading={loading} />
            <StatCard label="Critical" value={risk.filter((r) => r.severity === "critical").length} icon={TrendingUp} tone="destructive" loading={loading} />
          </div>
          <Card>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Case</th>
                        <th className="pb-2 pr-4 font-medium">Type</th>
                        <th className="pb-2 pr-4 font-medium">Severity</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                        <th className="pb-2 font-medium">Incident date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {risk.map((r) => (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 pr-4">{r.caseTitle}</td>
                          <td className="py-2 pr-4 capitalize">{r.caseType}</td>
                          <td className="py-2 pr-4 capitalize">{r.severity}</td>
                          <td className="py-2 pr-4 capitalize">{r.status}</td>
                          <td className="py-2">{r.incidentDate ? formatDate(r.incidentDate) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

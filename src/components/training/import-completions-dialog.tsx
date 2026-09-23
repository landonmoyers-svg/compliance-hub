"use client";

import { useMemo, useState } from "react";
import { X, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import {
  parseCompletionCsv,
  reconcileCompletions,
  type ReconcileResult,
} from "@/lib/training-external";
import { formatDate } from "@/lib/dates";
import type { TrainingImport } from "@/lib/data/schema";
import { toast } from "sonner";

/**
 * Import a provider's own completion report and reconcile it against what staff
 * told us. Self-reported completions that the report confirms become verified;
 * ones it contradicts are flagged rather than quietly overwritten, because a
 * disagreement between two records is exactly what an auditor asks about.
 */
export function ImportCompletionsDialog({ onClose }: { onClose: () => void }) {
  const { profile, user } = useAuth();
  const modulesQ = useCollection("trainingModules");
  const assignQ = useCollection("trainingAssignments");
  const profilesQ = useCollection("profiles");

  const updateAssign = useUpdate("trainingAssignments");
  const createAttempt = useCreate("trainingAttempts");
  const createImport = useCreate("trainingImports");

  const [fileName, setFileName] = useState<string | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const modules = useMemo(() => modulesQ.data ?? [], [modulesQ.data]);
  const assignments = useMemo(() => assignQ.data ?? [], [assignQ.data]);
  const people = useMemo(
    () => (profilesQ.data ?? []).map((p) => ({ userId: p.userId, fullName: p.fullName, email: p.email })),
    [profilesQ.data],
  );

  const externalModules = modules.filter((m) => m.delivery === "external");

  async function handleFile(file: File) {
    setFileName(file.name);
    setParseError(null);
    setResult(null);
    try {
      const text = await file.text();
      const { rows, headerFound } = parseCompletionCsv(text);
      if (!headerFound) {
        setParseError("Couldn't find a header row with a person and a course column. Export the report as CSV and try again.");
        return;
      }
      if (rows.length === 0) {
        setParseError("The file parsed, but it has no data rows.");
        return;
      }
      setResult(reconcileCompletions({ rows, modules, assignments, people }));
    } catch {
      setParseError("Couldn't read that file.");
    }
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    const verifier = profile?.fullName ?? user?.fullName ?? "Admin";
    const now = new Date().toISOString();

    const verifiedCount = result.verify.filter((v) => !v.discrepancy).length;
    const discrepancyCount = result.verify.filter((v) => v.discrepancy).length;

    try {
      const batch = (await createImport.mutateAsync({
        provider: "Mineral",
        fileName: fileName ?? undefined,
        importedByName: verifier,
        periodLabel: periodLabel.trim() || undefined,
        rowCount: result.verify.length + result.unmatched.length + result.incomplete,
        matchedCount: result.verify.length,
        verifiedCount,
        discrepancyCount,
        unmatched: result.unmatched,
      })) as TrainingImport;

      for (const v of result.verify) {
        const wasOpen = v.assignment.status !== "completed";
        if (wasOpen) {
          // A completion the provider recorded but nobody told us about still
          // gets an attempt row, so every completion has one shape.
          await createAttempt.mutateAsync({
            assignmentId: v.assignment.id,
            trainingModuleId: v.assignment.trainingModuleId,
            moduleTitle: v.assignment.moduleTitle,
            userId: v.assignment.assignedToUserId,
            userName: v.assignment.assignedToName,
            score: v.row.score ?? 100,
            passed: true,
            answers: [],
            completedAt: v.completedAt,
          });
        }
        await updateAssign.mutateAsync({
          id: v.assignment.id,
          patch: {
            status: "completed",
            completedAt: v.assignment.completedAt ?? v.completedAt,
            externalCompletedAt: v.completedAt,
            completionSource: wasOpen ? "import" : v.assignment.completionSource ?? "external_attested",
            verificationStatus: v.discrepancy ? "discrepancy" : "verified",
            verifiedAt: now,
            verifiedByName: verifier,
            importBatchId: batch.id,
            reconciliationNote: v.discrepancy ?? undefined,
          },
        });
      }

      toast.success(
        `${verifiedCount} verified${discrepancyCount ? `, ${discrepancyCount} flagged` : ""}${
          result.unmatched.length ? `, ${result.unmatched.length} unmatched` : ""
        }`,
      );
      onClose();
    } catch {
      toast.error("Import failed partway through. Re-run it — already-verified rows are skipped.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="size-4 text-muted-foreground" /> Import provider completions
            </h2>
            <p className="text-xs text-muted-foreground">
              Mineral → Training → Actions → User Activity Report → export CSV, then drop it here.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          {externalModules.length === 0 && (
            <p className="rounded-md border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
              No modules are marked as delivered by an outside provider yet. Set a module&apos;s delivery to
              &ldquo;outside platform&rdquo; under Modules &amp; Quizzes first, or nothing here will match.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Report file (CSV)</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary/20">
                <Upload className="size-4 text-muted-foreground" />
                <span className="truncate">{fileName ?? "Choose the exported report"}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Period covered <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input
                className="input w-full"
                placeholder="e.g. Aug 2026"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
              />
            </div>
          </div>

          {parseError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{parseError}</p>
          )}

          {result && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-4">
                <Stat label="Will verify" value={result.verify.filter((v) => !v.discrepancy).length} tone="success" />
                <Stat label="Flagged" value={result.verify.filter((v) => v.discrepancy).length} tone="warning" />
                <Stat label="Unmatched" value={result.unmatched.length} />
                <Stat label="Not complete" value={result.incomplete} />
              </div>

              {result.verify.length > 0 && (
                <div className="rounded-lg border border-border">
                  <p className="border-b border-border px-4 py-2 text-sm font-medium">Matched completions</p>
                  <div className="max-h-56 overflow-y-auto divide-y divide-border/60">
                    {result.verify.map((v) => (
                      <div key={v.assignment.id} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{v.assignment.assignedToName}</p>
                          <p className="text-xs text-muted-foreground">{v.module.title} · {formatDate(v.completedAt)}</p>
                          {v.discrepancy && <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{v.discrepancy}</p>}
                        </div>
                        {v.discrepancy ? (
                          <Badge variant="warning" className="shrink-0 gap-1"><AlertTriangle className="size-3" /> Flag</Badge>
                        ) : (
                          <Badge variant="success" className="shrink-0 gap-1"><CheckCircle2 className="size-3" /> Verify</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.unmatched.length > 0 && (
                <div className="rounded-lg border border-border">
                  <p className="border-b border-border px-4 py-2 text-sm font-medium">
                    Unmatched rows <span className="font-normal text-muted-foreground">— kept with the import record for follow-up</span>
                  </p>
                  <div className="max-h-40 overflow-y-auto divide-y divide-border/60">
                    {result.unmatched.map((u, i) => (
                      <div key={i} className="px-4 py-2 text-sm">
                        <p className="font-medium">{u.name || u.email || "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.course || "—"} · {u.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={applying}>Cancel</Button>
          <Button onClick={apply} disabled={!result || result.verify.length === 0 || applying}>
            {applying ? "Importing…" : `Apply${result ? ` (${result.verify.length})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  const color =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warning" ? "text-amber-600 dark:text-amber-400"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

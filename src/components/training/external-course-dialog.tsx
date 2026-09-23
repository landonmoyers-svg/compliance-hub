"use client";

import { useState } from "react";
import { X, ExternalLink, GraduationCap, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/storage";
import { launchUrlFor, launchIsCatalogFallback } from "@/lib/training-external";
import type { TrainingModule } from "@/lib/data/schema";
import { toast } from "sonner";

/**
 * Completion path for a course that plays in an outside platform.
 *
 * The vendor owns the course; we own the record. So the flow is: open it there,
 * come back, state when it was finished and attach their certificate. That
 * makes the record self-reported but evidenced — an import of the vendor's own
 * report later upgrades it to verified.
 */
export function ExternalCourseDialog({
  module,
  personLabel,
  onClose,
  onComplete,
  busy,
  statement,
}: {
  module: TrainingModule;
  /** Whose completion this is — "you" for self-serve, a name when an admin records it. */
  personLabel?: string;
  onClose: () => void;
  onComplete: (data: { completedAt: string; certificatePath: string | null }) => void;
  busy: boolean;
  statement?: string;
}) {
  const url = launchUrlFor(module);
  const catalogFallback = launchIsCatalogFallback(module);
  const courseName = module.providerCourseCode?.trim() || module.title;

  const [opened, setOpened] = useState(false);
  // "Today" is captured once, at open, so re-renders can't shift the bound.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [completedAt, setCompletedAt] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [checked, setChecked] = useState(false);

  const needsFile = module.evidenceRequired !== false;
  const dateValid = !!completedAt && completedAt <= today;
  const canSubmit = checked && dateValid && (!needsFile || !!file) && !busy && !uploading;

  const attestation =
    statement ??
    `I completed this course in ${module.provider ?? "the provider's platform"} on the date above, and the certificate attached is mine.`;

  async function submit() {
    setUploading(true);
    try {
      const path = file ? await uploadFile(file, "training-certificate") : null;
      onComplete({
        completedAt: new Date(`${completedAt}T12:00:00`).toISOString(),
        certificatePath: path,
      });
    } catch {
      toast.error("Couldn't upload the certificate. Try again, or remove it and record the date only.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <GraduationCap className="size-4 text-muted-foreground" /> {module.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              Delivered by {module.provider ?? "an outside provider"}
              {personLabel ? ` · recording for ${personLabel}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Step 1 — take it there. */}
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <p className="text-sm font-medium">1. Take the course</p>
            {catalogFallback && (
              <p className="mt-1 text-sm text-muted-foreground">
                Search their catalog for <span className="font-medium text-foreground">{courseName}</span>.
              </p>
            )}
            <Button
              className="mt-3"
              variant="outline"
              disabled={!url}
              onClick={() => {
                if (!url) return;
                window.open(url, "_blank", "noopener,noreferrer");
                setOpened(true);
              }}
            >
              <ExternalLink className="size-4" />
              Open in {module.provider ?? "provider"}
            </Button>
            {!url && (
              <p className="mt-2 text-xs text-destructive">
                No course link is set for this module yet — an admin can add one under Modules &amp; Quizzes.
              </p>
            )}
            {opened && (
              <p className="mt-2 text-xs text-muted-foreground">Opened in a new tab. Come back here when you&apos;re done.</p>
            )}
          </div>

          {/* Step 2 — evidence it here. */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">2. Record it here</p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Completion date</label>
              <input
                type="date"
                className="input w-full"
                max={today}
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
              />
              {!dateValid && <p className="text-xs text-destructive">Pick the date shown on the certificate — it can&apos;t be in the future.</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Certificate {needsFile ? "*" : <span className="font-normal text-muted-foreground">(optional)</span>}
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm hover:bg-secondary/20">
                <Upload className="size-4 text-muted-foreground" />
                <span className="truncate">{file ? file.name : "Choose the PDF the provider issued"}</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Kept in the Hub, so the record survives whatever happens to the provider subscription.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm hover:bg-secondary/20">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>{attestation}</span>
            </label>

            <p className="text-xs text-muted-foreground">
              This is recorded as <span className="font-medium">self-reported</span> until an admin imports the provider&apos;s own completion report.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={busy || uploading}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {uploading ? "Uploading…" : busy ? "Saving…" : "Record completion"}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrainingModule } from "@/lib/data/schema";

/**
 * Completion path for a module that has no quiz: the user reads the module
 * contents and attests that they have read and understood them. Attestation is
 * the completion gate (parallel to passing the quiz for quiz-based modules).
 */
export function AttestModuleDialog({
  module,
  onClose,
  onAttest,
  busy,
  statement = "I attest that I have read and understand the contents of this module.",
  subtitle = "Read the module, then attest to complete it.",
}: {
  module: TrainingModule;
  onClose: () => void;
  onAttest: () => void;
  busy: boolean;
  /** The attestation the user is agreeing to (self vs. admin-on-behalf). */
  statement?: string;
  subtitle?: string;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><GraduationCap className="size-4 text-muted-foreground" /> {module.title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          {module.description ? (
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm">{module.description}</div>
          ) : (
            <p className="text-sm text-muted-foreground">Review the training materials for this module, then confirm your attestation below.</p>
          )}

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm hover:bg-secondary/20">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4" />
            <span>{statement}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onAttest} disabled={!checked || busy}>{busy ? "Completing…" : "Attest & complete"}</Button>
        </div>
      </div>
    </div>
  );
}

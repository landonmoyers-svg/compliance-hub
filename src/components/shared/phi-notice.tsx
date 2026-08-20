import { ShieldAlert } from "lucide-react";

/**
 * The practice's data-handling boundary, stated where people create or upload
 * documents: this app holds the PRACTICE'S OWN compliance records, never patient
 * PHI. Even when a form/document CAN be produced here, if the finished document
 * would contain PHI it must not be saved in the app — it belongs in the patient
 * chart / EHR. Users should enter de-identified references instead.
 *
 * `tone="prominent"` for surfaces that directly invite patient data (patient/
 * incident forms, sensitive templates); the calm default suits general uploads.
 */
export function PhiNotice({ tone = "default", className = "" }: { tone?: "default" | "prominent"; className?: string }) {
  const prominent = tone === "prominent";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${
        prominent
          ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border-border bg-secondary/40 text-muted-foreground"
      } ${className}`}
    >
      <ShieldAlert className={`mt-0.5 size-4 shrink-0 ${prominent ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
      <p>
        <span className="font-semibold text-foreground">Don&apos;t save patient PHI here.</span> This app is for your practice&apos;s
        own compliance records, not patient data. If a completed document would contain protected health information
        (patient name, DOB, MRN, diagnosis, etc.), keep it in the patient&apos;s chart/EHR — use a de-identified reference
        (initials or last 4 of the MRN) instead.
      </p>
    </div>
  );
}

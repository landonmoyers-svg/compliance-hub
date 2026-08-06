// Auto-detected step completion. Some playbook steps can be judged done from the
// practice's live data instead of a manual check-off — so a walkthrough reflects
// reality. We reuse the agenda's own signal: when a whole category of work has
// dropped off the live agenda (nothing outstanding), that work is genuinely done.
//
// Only "program-state" steps are auto-detected (credentials current, SRA
// remediated, screening current, backup taken, an audit run). Per-instance steps
// (onboarding a specific hire, a specific breach) stay manual — the data can't
// tell which instance you mean.

export interface GuideSignals {
  /** Agenda item categories currently outstanding (from buildAgenda output). */
  openCategories: Set<string>;
  /** Any Security Risk Assessment finding on record → the assessment was worked. */
  hasSraFindings: boolean;
  /** Any audit / mock survey has been run. */
  hasAudit: boolean;
}

// `${playbookSlug}:${stepKey}` → predicate over the live signals.
const AUTO: Record<string, (s: GuideSignals) => boolean> = {
  // Credentials are current when nothing credential-related is outstanding.
  "credentials-current:start-renewals": (s) => !s.openCategories.has("credential"),
  "credentials-current:reminders": (s) => !s.openCategories.has("credential"),
  // The SRA has been worked (findings exist) …
  "annual-sra:open-sra": (s) => s.hasSraFindings,
  "annual-sra:work-safeguards": (s) => s.hasSraFindings,
  // … and remediation is done when no SRA finding is outstanding.
  "annual-sra:remediate": (s) => s.hasSraFindings && !s.openCategories.has("sra"),
  "annual-sra:track": (s) => s.hasSraFindings && !s.openCategories.has("sra"),
  // Screening is current when nobody is due.
  "monthly-screening:who-due": (s) => !s.openCategories.has("screening"),
  "monthly-screening:screen": (s) => !s.openCategories.has("screening"),
  // A recent backup clears the backup item from the agenda.
  "weekly-backup:export": (s) => !s.openCategories.has("backup"),
  // A mock survey has been run.
  "audit-ready:mock-survey": (s) => s.hasAudit,
};

/** Which step keys of a playbook are satisfied by live data right now. */
export function autoDoneSteps(playbookSlug: string, stepKeys: string[], signals: GuideSignals): string[] {
  return stepKeys.filter((k) => AUTO[`${playbookSlug}:${k}`]?.(signals) === true);
}

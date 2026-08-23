/**
 * How much help a household wants from a model, and what they accept in return.
 *
 * Two honest positions, neither of which is the "right" one:
 *
 *   • **Private** — nothing about a document ever leaves the machine. The
 *     guarantee is absolute and needs no asterisk, and the cost is real: an
 *     unlabelled scan can't be sorted for you, so you file it yourself.
 *
 *   • **Assisted** — when the device can't work out what a document is, a
 *     redacted version is sent to a model. Better sorting, at the price of a
 *     third party seeing a de-identified copy.
 *
 * ## Why this is a mode and not a checkbox
 *
 * The two paths live in different modules. Private mode does not merely decline
 * to call the network — the code that *could* call it is never imported, so it
 * isn't in the running program at all. There is exactly one dynamic import in
 * the whole ingest layer (see `pipeline.ts`) and it only runs in Assisted mode.
 * That keeps "verify it by reading it" true for the strict setting rather than
 * downgrading it to "trust our if-statement".
 *
 * ## On the word "anonymised"
 *
 * We don't use it. Redaction removes identifiers, but context re-identifies:
 * "GEICO auto policy, 2019 Subaru Outback, Draper UT" narrows to very few
 * households with every number stripped. **De-identified** is the accurate word
 * and the one the UI uses.
 */

export type SecurityMode = "private" | "assisted";

/**
 * Private by default.
 *
 * A household that never opens settings ends up with the stronger guarantee,
 * and the weaker one is only ever reached by someone who chose it.
 */
export const DEFAULT_SECURITY_MODE: SecurityMode = "private";

export interface SecurityModeOption {
  key: SecurityMode;
  label: string;
  summary: string;
  /** What you get. */
  benefits: string[];
  /** What it costs. Stated as plainly as the benefits — no option is free. */
  costs: string[];
}

export const SECURITY_MODES: SecurityModeOption[] = [
  {
    key: "private",
    label: "Everything stays on this device",
    summary: "Nothing about your documents is ever sent anywhere. Sorting is done here, by this app.",
    benefits: [
      "No part of a document — not even a redacted copy — leaves your machine.",
      "Nothing to retain, so there is no retention promise to trust.",
      "The code that could send anything isn't loaded, so the claim can be checked rather than believed.",
    ],
    costs: [
      "Documents that don't say what they are — an unlabelled scan or a photo — usually can't be sorted for you.",
      "You'll file more of them by hand.",
    ],
  },
  {
    key: "assisted",
    label: "Let AI help with documents it can't place",
    summary:
      "When this device can't tell what a document is, a redacted copy is sent to an AI model to identify it.",
    benefits: [
      "Unlabelled scans and photos get sorted and grouped, which is most of the work.",
      "Identifiers — numbers, names, addresses — are removed here before anything is sent.",
      "You see exactly what would be sent, before it goes.",
    ],
    costs: [
      "A third party sees a de-identified copy of the document's text.",
      "Redaction removes identifiers, but context can still narrow down who a document belongs to.",
      "The provider's promise not to retain it is a contract, not something we can enforce.",
    ],
  },
];

export const SECURITY_MODE_BY_KEY: Record<SecurityMode, SecurityModeOption> = Object.fromEntries(
  SECURITY_MODES.map((m) => [m.key, m]),
) as Record<SecurityMode, SecurityModeOption>;

/**
 * Categories that stay on the device even in Assisted mode.
 *
 * These are the documents worth stealing and the ones a household would most
 * regret sending. Choosing "let AI help" should not quietly include the
 * passports and the will — so it doesn't, unless someone deliberately changes
 * this.
 */
export interface IngestPolicy {
  mode: SecurityMode;
  neverSend: string[];
  /**
   * Below this the device isn't sure enough to file a document itself, so it is
   * a candidate for help. Above it, sending would be pure exposure for nothing.
   */
  askForHelpBelowConfidence: number;
}

export const DEFAULT_POLICY: IngestPolicy = {
  mode: DEFAULT_SECURITY_MODE,
  neverSend: ["identity", "estate"],
  askForHelpBelowConfidence: 0.8,
};

export function policyFor(mode: SecurityMode, over: Partial<IngestPolicy> = {}): IngestPolicy {
  return { ...DEFAULT_POLICY, mode, ...over };
}

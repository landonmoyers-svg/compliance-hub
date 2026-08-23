import { LocalAnalyzer, type Analysis, type DocumentInput, type LocalModel } from "./analyzer";
import { redactText, describeRedactions, type RedactionResult } from "./redact";
import { DEFAULT_POLICY, type IngestPolicy } from "./security-mode";

/**
 * Deciding how one document gets identified.
 *
 * This file holds **the only dynamic import in the ingest layer**, and it is the
 * single place from which networking code can be reached. That is deliberate:
 * "does HomeVault send my documents anywhere?" is answered by reading one
 * function, and in Private mode the answer is that the module which could is
 * never loaded.
 *
 * The order is always: try locally first, and only consider help for what the
 * device genuinely couldn't place. Sending a document we already recognised
 * would be exposure bought for nothing.
 */

export interface PipelineOptions {
  policy?: IngestPolicy;
  /** Bundled on-device model, when the build has one (desktop). */
  localModel?: LocalModel;
  /**
   * Supplied only in Assisted mode, and only after the household has seen the
   * preview and approved this batch.
   */
  cloud?: {
    transport: unknown;
    consent: unknown;
  };
  now?: () => number;
}

export interface PipelineResult {
  analysis: Analysis;
  /** Shown in the UI and written to the ingest log, so the choice is auditable. */
  handling: "local" | "sent-redacted";
  reason: string;
  /** Present when the document was a candidate for help, so the UI can preview it. */
  redaction?: RedactionResult;
}

/**
 * What *would* be sent for this document, without sending it.
 *
 * Powers the pre-flight screen. The household approves this exact object, and
 * the same object is handed to the cloud analyzer — recomputing it later would
 * let the preview and the payload drift, which would make the consent
 * meaningless.
 */
export function previewForConsent(doc: DocumentInput): { redaction: RedactionResult; summary: string } {
  const redaction = redactText(doc.text);
  return { redaction, summary: describeRedactions(redaction) };
}

export async function identifyDocument(
  doc: DocumentInput,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const { policy = DEFAULT_POLICY, localModel, cloud, now = () => Date.now() } = options;

  const local = new LocalAnalyzer(localModel);
  const analysis = await local.analyze(doc);

  // Private mode stops here, always. Nothing below this line runs, and the
  // module that could send anything is never imported.
  if (policy.mode === "private") {
    return { analysis, handling: "local", reason: "Everything stays on this device." };
  }

  // Checked before anything else, so it is the reason reported: the strongest
  // guarantee in play is the one a household should see. Even in Assisted mode
  // the documents worth stealing stay put — choosing "let AI help" must not
  // quietly include the passports and the will.
  if (policy.neverSend.includes(analysis.category)) {
    return {
      analysis,
      handling: "local",
      reason: `Looks like a ${analysis.category} document, which never leaves this device.`,
    };
  }

  if (analysis.confidence >= policy.askForHelpBelowConfidence) {
    return { analysis, handling: "local", reason: "Recognised on this device — no need to send it." };
  }

  if (!cloud) {
    return { analysis, handling: "local", reason: "No approval for this batch — kept on this device." };
  }

  const { redaction } = previewForConsent(doc);
  if (!redaction.confident) {
    return {
      analysis,
      handling: "local",
      reason: "This scan was too unclear to redact reliably, so it wasn't sent.",
      redaction,
    };
  }

  // The one place the quarantined module is reached. Dynamic so it is absent
  // from the bundle a Private-mode household ever loads.
  const { CloudAnalyzer } = await import("./cloud/cloud-analyzer");
  const analyzer = new CloudAnalyzer(
    cloud.transport as ConstructorParameters<typeof CloudAnalyzer>[0],
    cloud.consent as ConstructorParameters<typeof CloudAnalyzer>[1],
    now,
  );

  try {
    return {
      analysis: await analyzer.analyze({ ...doc, redaction }),
      handling: "sent-redacted",
      reason: "Sent a redacted copy, with your approval.",
      redaction,
    };
  } catch (err) {
    // A refusal is not a failure of the ingest — fall back to the local answer
    // and say why, rather than losing the document.
    return {
      analysis,
      handling: "local",
      reason: err instanceof Error ? err.message : "Not sent — kept on this device.",
      redaction,
    };
  }
}

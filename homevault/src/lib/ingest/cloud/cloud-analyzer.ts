import { redactText, assertRedacted, type RedactionResult } from "../redact";
import type { Analysis, DocumentInput } from "../analyzer";

/**
 * The only code in HomeVault that can send document text anywhere.
 *
 * Quarantined in its own directory on purpose. In Private mode this module is
 * never imported, so it is not in the running program — which is what keeps
 * "nothing leaves this device" checkable by reading rather than by trusting a
 * conditional. `pipeline.ts` holds the single dynamic import that reaches it.
 *
 * Everything here is written to fail closed. If any check is ambiguous, nothing
 * is sent.
 */

/**
 * Proof that a household approved *this* batch after seeing what would go.
 *
 * A value the caller must construct and pass in, rather than a setting read from
 * storage: it can't be left switched on by accident, can't be inherited by the
 * next batch, and shows up in a stack trace when something transmits.
 */
export interface ConsentTicket {
  batchId: string;
  /** Documents the household approved. Anything else is refused. */
  approvedDocumentIds: string[];
  grantedAt: number;
  expiresAt: number;
  /** Exactly what was shown on the consent screen, kept for the ingest log. */
  shownSummary: string;
}

export interface CloudTransport {
  /** Receives ONLY redacted text. Implementations are never handed the original. */
  classifyRedacted(
    sanitizedText: string,
    meta: { batchId: string },
  ): Promise<Omit<Analysis, "documentId" | "via">>;
}

export class ConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentError";
  }
}

export class CloudAnalyzer {
  private readonly transport: CloudTransport;
  private readonly consent: ConsentTicket;
  private readonly now: () => number;

  constructor(transport: CloudTransport, consent: ConsentTicket, now: () => number = () => Date.now()) {
    this.transport = transport;
    this.consent = consent;
    this.now = now;
  }

  /**
   * @param doc.redaction The result the household was actually shown. Supplied
   *   rather than recomputed here, because recomputing would let the previewed
   *   payload and the sent payload drift apart — and the preview is the entire
   *   basis of the consent.
   */
  async analyze(doc: DocumentInput & { redaction?: RedactionResult }): Promise<Analysis> {
    if (this.now() > this.consent.expiresAt) {
      throw new ConsentError("That approval has expired. Review the batch and approve it again.");
    }
    if (!this.consent.approvedDocumentIds.includes(doc.id)) {
      throw new ConsentError(`"${doc.id}" wasn't part of the batch you approved.`);
    }

    const redaction = doc.redaction ?? redactText(doc.text);

    if (!redaction.confident) {
      throw new ConsentError(
        "This scan was too unclear to be sure every sensitive detail was hidden, so it wasn't sent.",
      );
    }

    // Last check before transmission. The redactor has already run; this exists
    // because a bug there would otherwise be silent and irreversible.
    assertRedacted(redaction.sanitized);

    const result = await this.transport.classifyRedacted(redaction.sanitized, {
      batchId: this.consent.batchId,
    });

    return { ...result, documentId: doc.id, via: "redacted-cloud" };
  }
}

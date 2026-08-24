import { identifyDocument, type PipelineOptions, type PipelineResult } from "./pipeline";
import { maskedIdentifier, type DocumentInput } from "./analyzer";

/**
 * Turning a folder of scans into proposed records.
 *
 * This is the layer the whole ingest pipeline was built for. `pipeline.ts`
 * answers "what is this one document?"; this answers "what are these four
 * hundred, and which ones do you actually need to look at?"
 *
 * ## The assumptions this is built on, which are not the convenient ones
 *
 * Filenames are noise. Real intake is `IMG_4523.HEIC`, `Scan_0007.pdf`,
 * `document(3).pdf` — a folder someone pointed a scanner at. So filenames are
 * carried for display only and are never used to classify, group, or order.
 *
 * A household has several accounts at the same bank. Two Chase statements are
 * two records unless the account identifiers match, and merging them would
 * silently destroy the distinction the household cares most about. Everything
 * here fails toward *more* records rather than fewer — an over-split pile is a
 * few minutes of merging, while an over-merged one hides a whole account and
 * may never be noticed.
 *
 * ## What "done" means for a batch
 *
 * Not "everything filed". A batch that files 380 documents and hands back 20
 * for review has succeeded; one that files all 400 by guessing at the last 20
 * has quietly corrupted the vault. The point of the review queue is that it is
 * short, not that it is empty.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface IntakeFile {
  id: string;
  /** Display only. Never used to classify, group, or order — see above. */
  filename: string;
  bytes: number;
  mediaType: string;
}

/**
 * Gets text out of a file, on this device.
 *
 * Deliberately narrow, and handed no network: OCR is the one genuinely heavy
 * step, and swapping in Tesseract WASM or a platform OCR service on desktop must
 * not be able to widen what the ingest layer can reach.
 */
export interface TextExtractor {
  readonly name: string;
  extract(file: IntakeFile): Promise<ExtractedText>;
}

export interface ExtractedText {
  text: string;
  pageCount?: number;
  /** True when this came from OCR rather than an embedded text layer. */
  ocr: boolean;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Why a proposal is in the review queue. Shown verbatim, so it must be plain. */
export type ReviewReason =
  | "unreadable"
  | "unrecognised"
  | "low-confidence"
  | "mixed-contents"
  | "sensitive";

export interface ProposedRecord {
  /** Stable within a batch; the group key when there is one. */
  id: string;
  label: string;
  category: string;
  issuer?: string;
  /**
   * Masked account number, when there is one — "···4471".
   *
   * Load-bearing rather than decorative: two accounts at the same bank produce
   * two proposals with identical labels and issuers, and with nothing to tell
   * them apart the list reads as a duplicated row. A household that then merges
   * them by hand undoes the one distinction this layer works hardest to keep.
   */
  distinguisher?: string;
  /** Files proposed as ONE record — pages of a packet, or years of one policy. */
  fileIds: string[];
  /** The weakest member's confidence, never the average. See below. */
  confidence: number;
  /** Empty means it can be filed without anyone looking at it. */
  reviewReasons: ReviewReason[];
  /** How each member was identified, for the ingest log. */
  handling: PipelineResult["handling"][];
}

export interface BatchProgress {
  total: number;
  completed: number;
  /** The file being worked on, for a status line. Display only. */
  current?: string;
}

export interface BatchPlan {
  /** Ready to file without anyone looking. */
  ready: ProposedRecord[];
  /** Short, ordered by how much a human is actually needed. */
  needsReview: ProposedRecord[];
  /** Nothing legible came out — usually a blank page or a photo of a wall. */
  unreadable: IntakeFile[];
  stats: {
    files: number;
    proposedRecords: number;
    sentForHelp: number;
  };
}

export interface BatchOptions extends PipelineOptions {
  extractor: TextExtractor;
  /**
   * How many files to work on at once. Bounded because extraction is CPU-bound
   * and unbounded parallelism on a laptop makes the whole app unresponsive —
   * which, during a five-minute import, reads as a crash.
   */
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
}

/**
 * Below this a document is not filed without a human, whatever it claims.
 *
 * Separate from the pipeline's `askForHelpBelowConfidence`, which decides
 * whether to *ask a model* — a different question from whether we're sure
 * enough to act unsupervised.
 */
export const REVIEW_BELOW_CONFIDENCE = 0.75;

/** Categories a human confirms even when the device is certain. */
export const ALWAYS_REVIEW_CATEGORIES = ["identity", "estate", "directives"];

// ---------------------------------------------------------------------------

const MIN_USEFUL_TEXT = 12;

export async function runBatch(files: IntakeFile[], options: BatchOptions): Promise<BatchPlan> {
  const { extractor, concurrency = 4, onProgress, signal, ...pipelineOptions } = options;

  const unreadable: IntakeFile[] = [];
  const identified: { file: IntakeFile; result: PipelineResult }[] = [];
  let completed = 0;

  const queue = [...files];
  async function worker() {
    for (;;) {
      if (signal?.aborted) return;
      const file = queue.shift();
      if (!file) return;

      onProgress?.({ total: files.length, completed, current: file.filename });
      try {
        const extracted = await extractor.extract(file);
        // A scan with no legible text is not a failure to classify — it's a
        // failure to read, and saying so is more useful than guessing a
        // category from a filename we've already decided not to trust.
        if (extracted.text.trim().length < MIN_USEFUL_TEXT) {
          unreadable.push(file);
        } else {
          const doc: DocumentInput = {
            id: file.id,
            text: extracted.text,
            filename: file.filename,
            pageCount: extracted.pageCount,
          };
          identified.push({ file, result: await identifyDocument(doc, pipelineOptions) });
        }
      } catch {
        // One corrupt file must never cost someone the other 399.
        unreadable.push(file);
      }
      completed += 1;
      onProgress?.({ total: files.length, completed });
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  return planFrom(identified, unreadable, files.length);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function planFrom(
  identified: { file: IntakeFile; result: PipelineResult }[],
  unreadable: IntakeFile[],
  fileCount: number,
): BatchPlan {
  const groups = new Map<string, { file: IntakeFile; result: PipelineResult }[]>();

  for (const entry of identified) {
    const { groupKey } = entry.result.analysis;
    // An absent group key means "don't group this with anything" — so it gets a
    // key nothing else can collide with, rather than being pooled with the other
    // ungrouped documents. Two unidentified scans have nothing in common except
    // that we failed to read them, which is not a reason to merge them.
    const key = groupKey ?? `ungrouped:${entry.file.id}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  const proposals = [...groups.entries()].map(([key, members]) => toProposal(key, members));

  const ready = proposals.filter((p) => p.reviewReasons.length === 0);
  const needsReview = proposals
    .filter((p) => p.reviewReasons.length > 0)
    .sort(reviewOrder);

  return {
    ready,
    needsReview,
    unreadable,
    stats: {
      files: fileCount,
      proposedRecords: proposals.length,
      sentForHelp: identified.filter((e) => e.result.handling === "sent-redacted").length,
    },
  };
}

function toProposal(
  key: string,
  members: { file: IntakeFile; result: PipelineResult }[],
): ProposedRecord {
  const analyses = members.map((m) => m.result.analysis);
  const primary = analyses[0];

  // The weakest member, not the average. A packet where three pages are obvious
  // and one is a mystery is a packet you should look at — averaging would let
  // the confident pages vouch for the page nobody could read.
  const confidence = Math.min(...analyses.map((a) => a.confidence));

  const reviewReasons: ReviewReason[] = [];
  if (key.startsWith("ungrouped:") && primary.confidence < REVIEW_BELOW_CONFIDENCE) {
    reviewReasons.push("unrecognised");
  } else if (confidence < REVIEW_BELOW_CONFIDENCE) {
    reviewReasons.push("low-confidence");
  }

  // Grouped documents that disagree about what they are. The group key matched,
  // so something links them, but a human should say what.
  if (new Set(analyses.map((a) => a.documentType)).size > 1) {
    reviewReasons.push("mixed-contents");
  }

  // Confirmed even at full confidence: these are the records where being
  // silently wrong is worst, and they're rare enough that asking costs little.
  if (ALWAYS_REVIEW_CATEGORIES.includes(primary.category)) {
    reviewReasons.push("sensitive");
  }

  return {
    id: key,
    label: primary.label,
    category: primary.category,
    issuer: primary.issuer,
    distinguisher: maskedIdentifier(primary.identifier),
    fileIds: members.map((m) => m.file.id),
    confidence,
    reviewReasons,
    handling: members.map((m) => m.result.handling),
  };
}

/**
 * Review order: the things most likely to be wrong, first.
 *
 * Someone who stops halfway through a queue should have dealt with the risky
 * items, not the alphabetically early ones.
 */
const REASON_PRIORITY: Record<ReviewReason, number> = {
  unreadable: 0,
  "mixed-contents": 1,
  unrecognised: 2,
  "low-confidence": 3,
  sensitive: 4,
};

function reviewOrder(a: ProposedRecord, b: ProposedRecord): number {
  const rank = (p: ProposedRecord) => Math.min(...p.reviewReasons.map((r) => REASON_PRIORITY[r]));
  return rank(a) - rank(b) || a.confidence - b.confidence;
}

/**
 * Plain-language explanation of why something is in the queue.
 *
 * Phrased as what the app couldn't do, never as something the household got
 * wrong. They pointed us at a folder; any shortfall here is ours.
 */
export const REVIEW_EXPLANATION: Record<ReviewReason, string> = {
  unreadable: "Nothing legible came out of this one.",
  unrecognised: "We couldn't tell what this is.",
  "low-confidence": "We have a guess, but we're not sure enough to file it for you.",
  "mixed-contents": "These look related but aren't the same kind of document.",
  sensitive: "Worth a glance because of what it is — we've filled in what we can.",
};

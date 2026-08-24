import type { ExtractedText, IntakeFile, TextExtractor } from "./batch";

/**
 * Getting text out of files in the browser, without sending them anywhere.
 *
 * ## What this build can and cannot read
 *
 * Handled here: plain text, CSV, and PDFs that carry a real text layer — which
 * covers everything downloaded from a bank, an insurer or a government portal.
 *
 * NOT handled here: photographs and scans, which need OCR. That is the larger
 * half of a real household's shoebox, and the honest thing is to say so on the
 * screen rather than to guess a category from `IMG_4523.HEIC` and file it
 * somewhere plausible-looking.
 *
 * ## Why OCR isn't simply switched on
 *
 * The obvious move — `tesseract.js` — fetches its language data (~15 MB) from a
 * public CDN on first run, and its worker from another. For most apps that is a
 * detail. Here it would mean an app whose headline promise is that nothing
 * leaves your machine quietly reaching out to jsdelivr the moment you import a
 * folder, and doing it from a page holding your passport. The request carries no
 * document text, but it is a network call we told the household did not happen,
 * and "well, technically the *contents* stayed local" is exactly the kind of
 * asterisk this product exists to not have.
 *
 * Two ways to do it properly, both open:
 *
 *   • Self-host the traineddata and the worker as app assets, so OCR is genuinely
 *     offline and Private mode's claim survives inspection.
 *   • Do OCR in the desktop build using the platform engine — macOS Vision and
 *     Windows OCR are on-device by construction, faster than Tesseract, and
 *     markedly better on photographed documents, which is the case that matters.
 *
 * Either slots in behind `TextExtractor` without touching anything else. That
 * seam is the reason this file is small.
 */

const TEXT_TYPES = ["text/plain", "text/csv", "text/markdown", "application/json"];

export function isTextLike(file: { mediaType: string; filename: string }): boolean {
  if (TEXT_TYPES.includes(file.mediaType)) return true;
  return /\.(txt|csv|md|json)$/i.test(file.filename);
}

export function isPdf(file: { mediaType: string; filename: string }): boolean {
  return file.mediaType === "application/pdf" || /\.pdf$/i.test(file.filename);
}

/** Files this build can read at all. Everything else needs OCR. */
export function canExtract(file: { mediaType: string; filename: string }): boolean {
  return isTextLike(file) || isPdf(file);
}

export class NeedsOcrError extends Error {
  constructor(filename: string) {
    super(`${filename} is an image — reading it needs OCR, which this build doesn't have yet.`);
    this.name = "NeedsOcrError";
  }
}

/**
 * Pulls the text strings out of a PDF's content streams.
 *
 * Deliberately not a PDF renderer. It reads the text-showing operators from the
 * uncompressed portions of the file, which is enough to classify a document and
 * costs no dependency and no network. A PDF whose streams are all compressed
 * yields nothing here and is reported as unreadable — correctly, since we truly
 * could not read it.
 */
export function extractPdfText(bytes: Uint8Array): string {
  // Latin-1 keeps byte values intact through the scan; we only care about the
  // ASCII inside literal strings.
  const raw = new TextDecoder("latin1").decode(bytes);
  const out: string[] = [];

  // Literal strings inside text-showing operators: (Hello) Tj  and  [(a)(b)] TJ
  const showText = /\((?:\\.|[^\\()])*\)\s*(?:Tj|TJ|'|")/g;
  for (const match of raw.matchAll(showText)) {
    const literal = match[0].slice(match[0].indexOf("(") + 1, match[0].lastIndexOf(")"));
    const decoded = literal
      .replace(/\\([nrtbf])/g, (_, c) => ({ n: "\n", r: "\n", t: " ", b: "", f: "\n" })[c as string] ?? "")
      .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\(.)/g, "$1");
    if (decoded.trim()) out.push(decoded);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

export class BrowserTextExtractor implements TextExtractor {
  readonly name = "browser";

  private readonly blobs: Map<string, Blob>;

  constructor(blobs: Map<string, Blob>) {
    this.blobs = blobs;
  }

  async extract(file: IntakeFile): Promise<ExtractedText> {
    const blob = this.blobs.get(file.id);
    if (!blob) throw new Error("File is no longer available.");

    if (isTextLike(file)) {
      return { text: await blob.text(), ocr: false };
    }

    if (isPdf(file)) {
      const text = extractPdfText(new Uint8Array(await blob.arrayBuffer()));
      return { text, ocr: false };
    }

    // Named rather than silently empty: "we can't read images yet" and "this
    // image was blank" are different facts and the UI says different things.
    throw new NeedsOcrError(file.filename);
  }
}

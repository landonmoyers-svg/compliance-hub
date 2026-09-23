"use client";

/**
 * On-device text recognition, for pages that must not leave the machine —
 * controlled-substance logs carrying patient chart numbers.
 *
 * In the Compliance Hub Mac app this calls Apple's Vision framework through the
 * native bridge: no network, no vendor, nothing to sign a BAA for.
 *
 * Everywhere else — Windows, or the Hub in a plain browser — it falls back to
 * Tesseract compiled to WebAssembly, which runs in a worker on this machine
 * from files served by the Hub itself. Slower and less accurate than Vision on
 * handwriting, but it has the property that matters: the page is never sent
 * anywhere. Both paths are on-device, so neither needs a BAA.
 */

export interface OcrLine {
  text: string;
  confidence: number;
  /** Position on the page, 0–1, origin top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

type Bridge = { postMessage: (m: unknown) => void };
type NativeWindow = Window & {
  webkit?: { messageHandlers?: { hubNative?: Bridge } };
  __hubNativeApp?: { platform: string; ocr?: boolean; version?: string };
  __hubOcrResult?: (r: { id: string; lines?: string; error?: string }) => void;
};

function nativeWindow(): NativeWindow | null {
  return typeof window === "undefined" ? null : (window as NativeWindow);
}

/** Apple Vision, through the Mac app's bridge. The better reader of handwriting. */
export function nativeOcrAvailable(): boolean {
  const w = nativeWindow();
  return !!w?.__hubNativeApp?.ocr && !!w.webkit?.messageHandlers?.hubNative;
}

/**
 * True when this device can read a page without sending it anywhere. Always
 * true in a browser that can run WebAssembly, which is every browser the Hub
 * supports — the question is only which engine does it.
 */
export function localOcrAvailable(): boolean {
  return nativeOcrAvailable() || typeof WebAssembly !== "undefined";
}

/** Which engine will read the page, for telling the person what to expect. */
export function ocrEngine(): "vision" | "tesseract" | "none" {
  if (nativeOcrAvailable()) return "vision";
  return typeof WebAssembly !== "undefined" ? "tesseract" : "none";
}

const waiting = new Map<string, { resolve: (l: OcrLine[]) => void; reject: (e: Error) => void }>();

function ensureReceiver(w: NativeWindow) {
  if (w.__hubOcrResult) return;
  w.__hubOcrResult = (r) => {
    const pending = waiting.get(r.id);
    if (!pending) return;
    waiting.delete(r.id);
    if (r.error) pending.reject(new Error(r.error));
    else {
      try { pending.resolve(JSON.parse(r.lines ?? "[]") as OcrLine[]); }
      catch { pending.reject(new Error("Couldn't read the page")); }
    }
  };
}

/** Read one page on this device, whichever engine this device has. */
export async function readPageLocally(base64Image: string, timeoutMs = 60_000): Promise<OcrLine[]> {
  if (nativeOcrAvailable()) return readWithVision(base64Image, timeoutMs);
  return readWithTesseract(base64Image);
}

/* --------------------------------------------------- Tesseract (WASM) */

/**
 * The worker is expensive to start, so it is kept for the life of the page —
 * a log is usually several pages, and paying that cost once matters.
 *
 * Every file it loads is served by the Hub (see public/tessdata), not a CDN.
 * That is deliberate: the point of on-device reading is that nothing about
 * this page leaves the machine, and a third-party script would undo it.
 */
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function tesseractWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, { langPath: "/tessdata", gzip: true });
    })().catch((e) => {
      workerPromise = null;   // let the next attempt try again
      throw e;
    });
  }
  return workerPromise;
}

/** Release the worker once a capture is finished. */
export async function releaseOcr(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  try { await (await p)?.terminate(); } catch { /* already gone */ }
}

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("That page couldn't be opened as an image."));
    img.src = src;
  });
}

async function readWithTesseract(base64Image: string): Promise<OcrLine[]> {
  const worker = await tesseractWorker();
  const src = base64Image.startsWith("data:") ? base64Image : `data:image/png;base64,${base64Image}`;
  // Measure the page ourselves: Tesseract reports pixel boxes and doesn't hand
  // back the image size, and the rest of this file works in 0–1 so that Vision
  // and Tesseract results are interchangeable downstream.
  const { width: w, height: h } = await imageSize(src);
  const { data } = await worker.recognize(src, {}, { blocks: true });
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  return lines
    .filter((l) => l.text.trim().length > 0)
    .map((l) => ({
      text: l.text.trim(),
      confidence: (l.confidence ?? 0) / 100,
      x: l.bbox.x0 / w,
      y: l.bbox.y0 / h,
      width: (l.bbox.x1 - l.bbox.x0) / w,
      height: (l.bbox.y1 - l.bbox.y0) / h,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/* ------------------------------------------------ Apple Vision (Mac app) */

function readWithVision(base64Image: string, timeoutMs: number): Promise<OcrLine[]> {
  const w = nativeWindow();
  const bridge = w?.webkit?.messageHandlers?.hubNative;
  if (!w || !bridge) return Promise.reject(new Error("This device can't read pages on its own."));
  ensureReceiver(w);
  const id = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<OcrLine[]>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    bridge.postMessage({ type: "ocr", id, image: base64Image });
    setTimeout(() => {
      if (waiting.delete(id)) reject(new Error("Reading the page timed out."));
    }, timeoutMs);
  });
}

/* ------------------------------------------------------------ into rows */

/** Group recognized lines into visual rows, so a table reads across, not down. */
export function groupIntoRows(lines: OcrLine[], tolerance = 0.012): OcrLine[][] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    const mid = (l: OcrLine) => l.y + l.height / 2;
    if (row && Math.abs(mid(row[0]) - mid(line)) <= Math.max(tolerance, row[0].height * 0.6)) row.push(line);
    else rows.push([line]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

/** The plain text of a page, one visual row per line. */
export function rowsToText(lines: OcrLine[]): string {
  return groupIntoRows(lines).map((r) => r.map((l) => l.text).join("  ")).join("\n");
}

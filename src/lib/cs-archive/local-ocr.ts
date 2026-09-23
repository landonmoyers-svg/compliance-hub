"use client";

/**
 * On-device text recognition, for pages that must not leave the machine —
 * controlled-substance logs carrying patient chart numbers.
 *
 * In the Compliance Hub Mac app this calls Apple's Vision framework through the
 * native bridge: no network, no vendor, nothing to sign a BAA for. In a plain
 * browser there is no equivalent, so `localOcrAvailable()` is false and the
 * caller should say so rather than quietly sending the page to a server.
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

/** True when this device can read a page without sending it anywhere. */
export function localOcrAvailable(): boolean {
  const w = nativeWindow();
  return !!w?.__hubNativeApp?.ocr && !!w.webkit?.messageHandlers?.hubNative;
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

/** Read one page on this device. Rejects if local OCR isn't available here. */
export function readPageLocally(base64Image: string, timeoutMs = 30_000): Promise<OcrLine[]> {
  const w = nativeWindow();
  const bridge = w?.webkit?.messageHandlers?.hubNative;
  if (!w || !bridge) return Promise.reject(new Error("This device can't read pages on its own — open the Compliance Hub Mac app."));
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

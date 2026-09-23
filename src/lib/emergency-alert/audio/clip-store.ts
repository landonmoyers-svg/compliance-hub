"use client";

/**
 * On-device storage for incident audio (IndexedDB — lives on this device's
 * disk, never uploaded). Two stores:
 *
 *  outbox  — on the phone that triggered the alert: clips waiting to reach an
 *            admin device. A clip is deleted here only after an admin device
 *            confirms it saved it.
 *  library — on an admin device: clips received and kept for incident review.
 */

export interface StoredClip {
  key: string;            // `${incidentId}:${seq}`
  incidentId: string;
  incidentLabel: string;  // "Code Gray — Murray Clinic 1"
  seq: number;            // order within the incident
  recordedAt: string;
  durationSec: number;
  mime: string;
  blob: Blob;
  receivedAt?: string;    // library only
  fromName?: string;      // library only: who was recording
}

const DB_NAME = "emergency-audio";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ["outbox", "library"]) {
        if (!db.objectStoreNames.contains(store)) {
          const s = db.createObjectStore(store, { keyPath: "key" });
          s.createIndex("incident", "incidentId");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type Store = "outbox" | "library";

async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { resolve(req.result); db.close(); };
    t.onerror = () => { reject(t.error); db.close(); };
  });
}

export const clipStore = {
  put: (store: Store, clip: StoredClip) => tx(store, "readwrite", (s) => s.put(clip)),
  get: (store: Store, key: string) => tx<StoredClip | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<StoredClip | undefined>),
  remove: (store: Store, key: string) => tx(store, "readwrite", (s) => s.delete(key)),
  all: (store: Store) => tx<StoredClip[]>(store, "readonly", (s) => s.getAll() as IDBRequest<StoredClip[]>),
  byIncident: (store: Store, incidentId: string) =>
    tx<StoredClip[]>(store, "readonly", (s) => s.index("incident").getAll(incidentId) as IDBRequest<StoredClip[]>),
};

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

/** A stable, human label for this device, shown as "saved on …". */
export function deviceLabel(): string {
  const KEY = "emergency-device-label";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const ua = navigator.userAgent;
    const kind = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /CrOS/.test(ua) ? "Chromebook" : "Computer";
    const app = /Electron/.test(ua) ? "Hub desktop app" : "browser";
    const label = `${kind} (${app}) ${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(KEY, label);
    return label;
  } catch {
    return "Unknown device";
  }
}

export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function extFor(mime: string): string {
  return mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * In-memory registry of what the admin device is receiving right now: live
 * microphone streams per incident and a count of clips saved this session.
 * The receiver host writes it; the dashboard's audio panel reads it.
 */

export interface LiveFeed { incidentId: string; stream: MediaStream; from: string }

let feeds: LiveFeed[] = [];
let savedThisSession = 0;
let libraryVersion = 0;
let status: "off" | "ready" | "denied" | "error" = "off";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const liveStore = {
  addFeed(f: LiveFeed) { feeds = [...feeds.filter((x) => x.stream.id !== f.stream.id), f]; emit(); },
  removeFrom(peer: string) { const n = feeds.filter((x) => x.from !== peer); if (n.length !== feeds.length) { feeds = n; emit(); } },
  clipSaved() { savedThisSession += 1; libraryVersion += 1; emit(); },
  libraryChanged() { libraryVersion += 1; emit(); },
  setStatus(s: typeof status) { if (s !== status) { status = s; emit(); } },
};

function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useLiveFeeds() { return useSyncExternalStore(subscribe, () => feeds, () => feeds); }
export function useLibraryVersion() { return useSyncExternalStore(subscribe, () => libraryVersion, () => 0); }
export function useReceiverStatus() { return useSyncExternalStore(subscribe, () => status, () => "off" as const); }
export function useSavedThisSession() { return useSyncExternalStore(subscribe, () => savedThisSession, () => 0); }

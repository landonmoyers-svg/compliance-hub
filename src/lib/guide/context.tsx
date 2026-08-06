"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { playbookBySlug, type Playbook } from "./playbooks";

/** How the Guide hand-holds you through a playbook. User-selectable. */
export type GuideStyle = "panel" | "tour" | "chat";

const STYLE_KEY = "guide.style";
const PROGRESS_KEY = "guide.progress"; // { [playbookSlug]: string[] of done step keys }

interface GuideState {
  style: GuideStyle;
  setStyle: (s: GuideStyle) => void;

  active: Playbook | null;
  stepIndex: number;
  start: (slug: string, style?: GuideStyle) => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;

  isDone: (slug: string, stepKey: string) => boolean;
  toggleDone: (slug: string, stepKey: string) => void;
  doneCount: (slug: string) => number;
}

const GuideContext = createContext<GuideState | null>(null);

function readProgress(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}"); } catch { return {}; }
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<GuideStyle>("panel");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, string[]>>({});

  // Hydrate persisted prefs/progress on mount (client only).
  useEffect(() => {
    const s = (typeof window !== "undefined" && localStorage.getItem(STYLE_KEY)) as GuideStyle | null;
    if (s === "panel" || s === "tour" || s === "chat") setStyleState(s);
    setProgress(readProgress());
  }, []);

  const setStyle = useCallback((s: GuideStyle) => {
    setStyleState(s);
    try { localStorage.setItem(STYLE_KEY, s); } catch { /* ignore */ }
  }, []);

  const active = useMemo(() => (activeSlug ? playbookBySlug(activeSlug) ?? null : null), [activeSlug]);

  const start = useCallback((slug: string, s?: GuideStyle) => {
    const pb = playbookBySlug(slug);
    if (!pb) return;
    if (s) setStyle(s);
    setActiveSlug(slug);
    // Resume at the first not-done step, else the beginning.
    const done = readProgress()[slug] ?? [];
    const first = pb.steps.findIndex((st) => !done.includes(st.key));
    setStepIndex(first === -1 ? 0 : first);
  }, [setStyle]);

  const stop = useCallback(() => { setActiveSlug(null); setStepIndex(0); }, []);
  const next = useCallback(() => setStepIndex((i) => (active ? Math.min(i + 1, active.steps.length - 1) : i)), [active]);
  const prev = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);
  const goTo = useCallback((i: number) => setStepIndex(i), []);

  const isDone = useCallback((slug: string, stepKey: string) => (progress[slug] ?? []).includes(stepKey), [progress]);
  const doneCount = useCallback((slug: string) => (progress[slug] ?? []).length, [progress]);

  const toggleDone = useCallback((slug: string, stepKey: string) => {
    setProgress((prev) => {
      const cur = prev[slug] ?? [];
      const nextArr = cur.includes(stepKey) ? cur.filter((k) => k !== stepKey) : [...cur, stepKey];
      const next = { ...prev, [slug]: nextArr };
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo<GuideState>(() => ({
    style, setStyle, active, stepIndex, start, stop, next, prev, goTo,
    isDone, toggleDone, doneCount,
  }), [style, setStyle, active, stepIndex, start, stop, next, prev, goTo, isDone, toggleDone, doneCount]);

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide(): GuideState {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide must be used within GuideProvider");
  return ctx;
}

/** Fire a request for Sage to open and answer a prompt (the "chat" style). The
 *  assistant widget listens for this event. */
export function askSage(prompt: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sage:ask", { detail: { prompt } }));
  }
}

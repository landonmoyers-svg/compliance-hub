"use client";

import { useEffect, useState } from "react";

/**
 * False during SSR and the very first client render, true once the component has
 * mounted and React is interactive. Use it to keep a trigger disabled until its
 * click handler is guaranteed bound, so a pre-hydration click is never silently
 * dropped — the control reads as "not ready yet" instead of doing nothing.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

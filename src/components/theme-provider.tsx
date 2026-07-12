"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

const prefersDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolveTheme = (t: Theme): Resolved => (t === "system" ? (prefersDark() ? "dark" : "light") : t);

/**
 * Manages the light/dark appearance. Follows the device setting by default
 * ("system"), or a saved Light/Dark override, and writes the resolved value to
 * <html data-theme>. A tiny inline script in the document head applies the same
 * value before first paint (see layout.tsx) to avoid a flash.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<Resolved>("dark");

  // Hydrate the saved preference.
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setThemeState(stored);
  }, []);

  // Apply the resolved theme and track system changes while on "system".
  useEffect(() => {
    const apply = () => {
      const r = resolveTheme(theme);
      setResolved(r);
      document.documentElement.setAttribute("data-theme", r);
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(ThemeContext) ?? { theme: "system", resolved: "dark", setTheme: () => {} };
}

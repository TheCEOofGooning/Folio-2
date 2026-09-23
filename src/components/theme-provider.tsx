"use client";

/**
 * Theme: light / dark / system, with system preference sync.
 *
 * Three-layer design so there is never a flash of the wrong theme:
 *  1. `themeScript` runs in `<head>` before first paint and sets `.dark`/`.light`
 *     from localStorage (falling back to the media query).
 *  2. This provider owns the *state*, keeps `classList` in sync, and listens for
 *     `prefers-color-scheme` changes so "System" follows the OS live — including
 *     macOS auto-switching at sunset without a reload.
 *  3. The CSS defines a `prefers-color-scheme` fallback for the no-JS case.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "folio-theme";

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (theme: ThemeChoice) => void;
  /** Cycles light → dark → system, which is what the nav button does. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline, blocking, ~200 bytes. Placed in `<head>` by the root layout so the
 * correct class is present before the first pixel is painted.
 */
export const themeScript = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}")||"system";var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement.classList;r.toggle("dark",d);r.toggle("light",!d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Adopt whatever the blocking script already decided — no second repaint.
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "system";
    const next = stored === "system" ? systemTheme() : stored;
    setThemeState(stored);
    setResolved(next);
    applyTheme(next);
  }, []);

  // Live system sync while the choice is "system".
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "system" !== "system") return;
      const next = media.matches ? "dark" : "light";
      setResolved(next);
      applyTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    const value = next === "system" ? systemTheme() : next;
    setResolved(value);
    applyTheme(value);
  }, []);

  const cycle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, cycle }),
    [theme, resolved, setTheme, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  // A safe default keeps components usable outside the provider (e.g. a story).
  return (
    context ?? {
      theme: "system",
      resolved: "light",
      setTheme: () => undefined,
      cycle: () => undefined,
    }
  );
}

'use client';

/**
 * components/theme-provider.tsx — dark / light / system with zero flash.
 *
 * The initial class is applied by the inline script in `app/layout.tsx` (which
 * reads the cookie before first paint); this provider takes over afterwards to
 * keep React state, `localStorage`, the cookie and `prefers-color-scheme` in
 * sync — including live changes to the OS setting while the tab is open.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'folio-theme';
const COOKIE = 'folio_theme';

interface ThemeContextValue {
  theme: Theme;
  resolved: Resolved;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPreference(): Resolved {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

function readCookie(): Theme | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  const value = match?.[1];
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<Resolved>('light');

  // Hydrate from the cookie/localStorage that the pre-paint script already used.
  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) ?? readCookie();
    const initial: Theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setThemeState(initial);
    const next = initial === 'system' ? systemPreference() : initial;
    setResolved(next);
    applyClass(next);
  }, []);

  // Follow the OS while the user is on "system".
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light';
      setResolved(next);
      applyClass(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const resolvedNext = next === 'system' ? systemPreference() : next;
    setResolved(resolvedNext);
    applyClass(resolvedNext);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the cookie below still persists the choice */
    }
    // A cookie (not just localStorage) means SSR can pre-render the right class.
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}

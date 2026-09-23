"use client";

/**
 * Viewer state for a statically rendered site.
 *
 * Folio's public pages are cached and viewer-agnostic, so they cannot know who is
 * reading at render time. This provider resolves the viewer exactly once per page
 * load (one request to `/api/session`, which is Edge-cached and returns
 * `{ user: null }` for signed-out visitors) and shares it through context.
 *
 * It also owns the sign-in gate: any island that needs an account (clapping,
 * bookmarking, commenting) calls `requireAuth()` instead of redirecting, so a
 * reader never loses their place in an article to a login page.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SessionUser } from "@/db/types";
import { AuthDialog } from "@/components/auth/auth-dialog";

interface SessionContextValue {
  user: SessionUser | null;
  /** True until the first `/api/session` response lands. */
  loading: boolean;
  /** Server actions can rotate the session (login/logout) — re-read on demand. */
  refresh: () => Promise<void>;
  /** Opens the sign-in dialog. Returns false when the visitor is signed out. */
  requireAuth: (reason?: string) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  /** Set when a server component already knows the viewer (dashboard routes). */
  initialUser?: SessionUser | null;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [loading, setLoading] = useState(initialUser === null);
  const [gate, setGate] = useState<{ open: boolean; reason?: string }>({ open: false });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const payload = (await response.json()) as { user: SessionUser | null };
      setUser(payload.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requireAuth = useCallback(
    (reason?: string) => {
      if (user) return true;
      setGate({ open: true, reason });
      return false;
    },
    [user],
  );

  const value = useMemo<SessionContextValue>(
    () => ({ user, loading, refresh: load, requireAuth }),
    [user, loading, load, requireAuth],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      <AuthDialog
        open={gate.open}
        reason={gate.reason}
        onOpenChange={(open) => setGate((previous) => ({ ...previous, open }))}
        onAuthenticated={() => {
          setGate({ open: false });
          // The session cookie changed, so a full reload is the honest way to
          // re-render every server component with the new identity.
          window.location.reload();
        }}
      />
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return context;
}

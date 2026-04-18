"use client";

/**
 * Client-side session context.
 *
 * The parent `(app)/layout.tsx` (a Server Component) resolves the
 * session via `requireSession()` and pipes it into this provider so
 * client components can read it without another server round-trip.
 *
 * Kept intentionally thin — no mutations. Org switching happens via
 * `POST /api/orgs/switch`, which resets the cookie and triggers a
 * reload.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { AuthSession } from "@sparkflow/auth";

const SessionContext = createContext<AuthSession | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: AuthSession;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): AuthSession {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside SessionProvider (app route group)");
  }
  return ctx;
}

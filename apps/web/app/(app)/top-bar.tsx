"use client";

/**
 * Minimal top bar for authenticated routes. Shows the active org name,
 * the user's email, and a theme toggle placeholder. Kept simple on
 * purpose — richer navigation lands with the dashboard work package.
 */
import { useSession } from "./session-context";

export interface TopBarProps {
  organizationName: string;
}

export function TopBar({ organizationName }: TopBarProps) {
  const session = useSession();
  return (
    <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">{organizationName}</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {session.role}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-[hsl(var(--muted-foreground))]" dir="ltr">
          {session.user.email}
        </span>
        {/* TODO: wire real theme toggle once `@sparkflow/ui` exposes one. */}
        <button
          type="button"
          className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
          aria-label="Toggle theme"
        >
          ☾
        </button>
      </div>
    </header>
  );
}

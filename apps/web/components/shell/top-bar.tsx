"use client";

/**
 * Authenticated top bar. Shows the active organization name, a theme
 * toggle, and a user avatar dropdown (settings / billing / sign out).
 *
 * Reads the current session from the in-tree `SessionProvider` so the
 * bar re-renders on org switches without a server round-trip.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, Moon, Settings, Sun, CreditCard } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sparkflow/ui";
import { useSession } from "../../app/(app)/session-context";

export interface TopBarProps {
  organizationName: string;
}

function initialsFor(email: string, name?: string): string {
  const source = (name ?? email ?? "?").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return source.slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (first + second).toUpperCase();
}

export function TopBar({ organizationName }: TopBarProps) {
  const session = useSession();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Reflect the current theme without taking a hard dependency on a
  // theme provider we may not have mounted yet.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  function toggleTheme() {
    if (typeof document === "undefined") return;
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
    try {
      window.localStorage.setItem("sparkflow-theme", next);
    } catch {
      // Private mode / storage blocked — ignore.
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Swallow; we redirect either way.
    }
    window.location.href = "/login";
  }

  const email = session.user.email;
  const name = session.user.name;
  const initials = initialsFor(email, name);

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))]/80 px-4 backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-sm font-semibold text-[hsl(var(--primary-foreground))]">
          SF
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{organizationName}</span>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
            {session.role}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="החלף ערכת נושא"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="תפריט משתמש"
              className="rounded-full"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{name ?? email}</span>
                <span
                  className="text-[11px] font-normal text-[hsl(var(--muted-foreground))]"
                  dir="ltr"
                >
                  {email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/coming-soon?feature=settings">
                <Settings className="h-4 w-4" /> הגדרות
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/billing">
                <CreditCard className="h-4 w-4" /> חיוב
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut className="h-4 w-4" /> התנתק
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

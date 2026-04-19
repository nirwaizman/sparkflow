"use client";

/**
 * Narrow, icon-first left rail for the authenticated app shell.
 *
 * Modeled after the Genspark 4.0 workspace layout: a 64px column
 * with a New button on top, primary destinations below, and a
 * "More" overflow that routes to `/coming-soon`.
 *
 * Everything is rendered with logical (start/end) spacing so
 * the default RTL (Hebrew) layout keeps the rail anchored to the
 * visual start edge without needing extra direction-aware logic.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Ellipsis,
  FolderOpen,
  Home,
  ListChecks,
  Plus,
  Workflow,
} from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@sparkflow/ui";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/chat/new", label: "חדש", icon: Plus, primary: true },
  { href: "/", label: "בית", icon: Home },
  { href: "/agents", label: "סוכנים", icon: Bot },
  { href: "/workflows", label: "תהליכים", icon: Workflow },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/files", label: "Drive", icon: FolderOpen },
  { href: "/coming-soon?feature=more", label: "עוד", icon: Ellipsis },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  // Strip query string for comparison.
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <TooltipProvider delayDuration={150}>
      <aside
        aria-label="ניווט ראשי"
        className={cn(
          "sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center gap-1 py-3",
          "border-e border-[hsl(var(--border))] bg-[hsl(var(--card))]/40 backdrop-blur",
          "md:flex",
        )}
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="icon"
                  variant={item.primary ? "default" : active ? "secondary" : "ghost"}
                  className={cn(
                    "h-11 w-11 rounded-xl",
                    active && !item.primary && "bg-[hsl(var(--muted))]",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Link href={item.href} aria-label={item.label}>
                    <Icon className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </aside>
    </TooltipProvider>
  );
}

"use client";

/**
 * Narrow, icon-first left rail for the authenticated app shell.
 *
 * Genspark-parity layout. The rail is a 64px column organized into three
 * grouped clusters separated by hairline dividers, plus a Studio
 * dropdown that fans out the 8 studio surfaces and a More overflow for
 * Integrations / Billing / Settings:
 *
 *   Top:      New, Home
 *   Create:   Super (highlighted), Chat, Studio
 *   Automate: Agents, Workflows, Tasks
 *   Assets:   Files, Integrations
 *   Bottom:   More (dropdown)
 *
 * Everything is rendered with logical (start/end) spacing so the default
 * RTL (Hebrew) layout keeps the rail anchored to the visual start edge
 * without needing extra direction-aware logic.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CreditCard,
  Ellipsis,
  FolderOpen,
  Home,
  ListChecks,
  MessageSquare,
  Paintbrush,
  Plug,
  Plus,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@sparkflow/ui";
import { StudioMenuContent } from "./studio-menu";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  highlight?: boolean;
};

const TOP_ITEMS: NavItem[] = [
  { href: "/chat/new", label: "חדש", icon: Plus, primary: true },
  { href: "/", label: "בית", icon: Home },
];

// Create cluster — Super is highlighted with the primary→accent gradient.
const CREATE_ITEMS: NavItem[] = [
  { href: "/super", label: "Super", icon: Sparkles, highlight: true },
  { href: "/chat/new", label: "צ'אט", icon: MessageSquare },
];

const AUTOMATE_ITEMS: NavItem[] = [
  { href: "/agents", label: "סוכנים", icon: Bot },
  { href: "/workflows", label: "תהליכים", icon: Workflow },
  { href: "/tasks", label: "משימות", icon: ListChecks },
];

const ASSETS_ITEMS: NavItem[] = [
  { href: "/files", label: "Drive", icon: FolderOpen },
  { href: "/integrations", label: "אינטגרציות", icon: Plug },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  // Strip query string for comparison.
  const base = href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

function NavButton({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          size="icon"
          variant={item.primary ? "default" : active ? "secondary" : "ghost"}
          className={cn(
            "h-11 w-11 rounded-xl",
            active && !item.primary && "bg-[hsl(var(--muted))]",
            item.highlight &&
              "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] hover:opacity-90",
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
}

function GroupDivider() {
  return (
    <span
      aria-hidden
      className="my-1 h-px w-6 bg-[hsl(var(--border))]"
    />
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const studioActive =
    isActive(pathname, "/slides") ||
    isActive(pathname, "/sheets") ||
    isActive(pathname, "/docs") ||
    isActive(pathname, "/image") ||
    isActive(pathname, "/video") ||
    isActive(pathname, "/music") ||
    isActive(pathname, "/design") ||
    isActive(pathname, "/dev");

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
        {TOP_ITEMS.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}

        <GroupDivider />
        {CREATE_ITEMS.map((item) => (
          <NavButton
            key={`create:${item.href}`}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}

        {/* Studio — dropdown to the 8 studio surfaces. */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant={studioActive ? "secondary" : "ghost"}
                  className={cn(
                    "h-11 w-11 rounded-xl",
                    studioActive && "bg-[hsl(var(--muted))]",
                  )}
                  aria-label="Studio"
                >
                  <Paintbrush className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              Studio
            </TooltipContent>
          </Tooltip>
          <StudioMenuContent />
        </DropdownMenu>

        <GroupDivider />
        {AUTOMATE_ITEMS.map((item) => (
          <NavButton
            key={`automate:${item.href}`}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}

        <GroupDivider />
        {ASSETS_ITEMS.map((item) => (
          <NavButton
            key={`assets:${item.href}`}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}

        {/* More — dropdown for overflow destinations. */}
        <div className="mt-auto">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 rounded-xl"
                    aria-label="עוד"
                  >
                    <Ellipsis className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                עוד
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="left" sideOffset={8} className="min-w-[12rem]">
              <DropdownMenuLabel>עוד</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/integrations">
                  <Plug className="h-4 w-4" />
                  <span>אינטגרציות</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/billing">
                  <CreditCard className="h-4 w-4" />
                  <span>חיוב</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/coming-soon?feature=settings">
                  <Settings className="h-4 w-4" />
                  <span>הגדרות</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}

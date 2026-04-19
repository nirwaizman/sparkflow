"use client";

/**
 * Authenticated workspace home. Modeled after Genspark AI Workspace 4.0:
 *
 *   - hero headline with the active org name,
 *   - a "super prompt" composer that routes to `/chat/new?q=...&mode=...`,
 *   - a 4x4 grid of feature tiles (16 tiles) with Super Agent as a wide
 *     featured card spanning two columns at `lg+`,
 *   - a compact usage strip hydrated from `/api/auth/me`.
 *
 * The page is RTL-first (Hebrew copy) but relies on logical utilities
 * (`ms-*`, `me-*`, `start/end`) so an LTR locale would not need
 * structural changes.
 */
import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Code,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  ListChecks,
  Mail,
  MessageSquare,
  Music,
  Paintbrush,
  Paperclip,
  Phone,
  Plug,
  Presentation,
  Send,
  Sparkles,
  Table,
  Video,
  Workflow,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@sparkflow/ui";

type Mode = "chat" | "search" | "research";

const MODES: { id: Mode; label: string }[] = [
  { id: "chat", label: "צ'אט" },
  { id: "search", label: "חיפוש" },
  { id: "research", label: "מחקר" },
];

const MODELS = [
  { id: "auto", label: "Auto" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
];

type Tile = {
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
};

// Regular tiles. "Super Agent" is elevated and rendered separately
// (see `FEATURED_TILE` below) as a wide card with a gradient border.
const TILES: Tile[] = [
  {
    title: "AI Chat",
    description: "שיחה חכמה עם ניתוב אוטומטי לחיפוש, מחקר וסוכנים.",
    href: "/chat/new",
    icon: MessageSquare,
    tone: "primary",
  },
  {
    title: "AI Slides",
    description: "מצגות מקצועיות מטקסט חופשי, כולל עיצוב אוטומטי.",
    href: "/slides",
    icon: Presentation,
    tone: "accent",
  },
  {
    title: "AI Sheets",
    description: "גיליונות נתונים עם נוסחאות ותובנות שנוצרו ב-AI.",
    href: "/sheets",
    icon: Table,
    tone: "success",
  },
  {
    title: "AI Docs",
    description: "מסמכים ארוכים, דוחות וסיכומים עם ציטוטים מעוגנים.",
    href: "/docs",
    icon: FileText,
    tone: "primary",
  },
  {
    title: "AI Image",
    description: "יצירת תמונות ובאנרים מתיאור טקסטואלי.",
    href: "/image",
    icon: ImageIcon,
    tone: "warning",
  },
  {
    title: "AI Video",
    description: "קליפים וסרטונים קצרים שנוצרים ישירות מתיאור.",
    href: "/video",
    icon: Video,
    tone: "accent",
  },
  {
    title: "AI Music",
    description: "מוזיקה מקורית, ג'ינגלים וסאונדטרקים מטקסט.",
    href: "/music",
    icon: Music,
    tone: "primary",
  },
  {
    title: "AI Designer",
    description: "עיצוב גרפי — פוסטים, באנרים ומותגים מלאים.",
    href: "/design",
    icon: Paintbrush,
    tone: "warning",
  },
  {
    title: "AI Developer",
    description: "כתיבת קוד, ריפקטור ובניית אפליקציות שלמות.",
    href: "/dev",
    icon: Code,
    tone: "success",
  },
  {
    title: "AI Agents",
    description: "צוותי סוכנים המבצעים משימות רב-שלביות עצמאית.",
    href: "/agents",
    icon: Bot,
    tone: "accent",
  },
  {
    title: "AI Tasks",
    description: "ריכוז משימות עם מעקב סטטוס ותזכורות.",
    href: "/tasks",
    icon: ListChecks,
    tone: "success",
  },
  {
    title: "AI Workflows",
    description: "אוטומציות שניתנות להרצה מתוזמנת או מופעלת.",
    href: "/workflows",
    icon: Workflow,
    tone: "primary",
  },
  {
    title: "Browser",
    description: "דפדפן סוכני שמפעיל אתרים ומבצע פעולות עבורך.",
    href: "/browser",
    icon: Globe,
    tone: "primary",
  },
  {
    title: "Phone",
    description: "סוכן טלפוני שמתקשר, מזמן ומשאיר הודעות.",
    href: "/phone",
    icon: Phone,
    tone: "success",
  },
  {
    title: "Integrations",
    description: "חבר Gmail, Drive, Slack ומערכות נוספות.",
    href: "/integrations",
    icon: Plug,
    tone: "muted",
  },
  {
    title: "AI Files",
    description: "ספריית קבצי הידע שלך — מאוחסנת ומותאמת ל-RAG.",
    href: "/files",
    icon: FolderOpen,
    tone: "muted",
  },
];

const FEATURED_TILE = {
  title: "Super Agent",
  tagline: "Describe anything. We'll orchestrate.",
  href: "/super",
  icon: Sparkles,
};

const TONE_CLASS: Record<string, string> = {
  primary: "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]",
  accent: "bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]",
  success: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  muted: "bg-[hsl(var(--muted))] text-[hsl(var(--fg))]",
};

export interface WorkspaceHomeProps {
  organizationName: string;
  userName?: string | null;
}

type UsageSnapshot = {
  messagesToday: number | null;
  monthlyCostUsd: number | null;
};

export function WorkspaceHome({
  organizationName,
  userName,
}: WorkspaceHomeProps) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [model, setModel] = useState<(typeof MODELS)[number]>(MODELS[0]!);
  const [usage, setUsage] = useState<UsageSnapshot>({
    messagesToday: null,
    monthlyCostUsd: null,
  });

  useEffect(() => {
    let cancelled = false;
    // Best-effort: /api/auth/me currently only returns a session, but we
    // still call it so that when the backend adds a `usage` slice (see
    // TODO below) this surface picks it up automatically.
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled || !data || typeof data !== "object") return;
        const maybeUsage = (data as { usage?: UsageSnapshot }).usage;
        if (maybeUsage) setUsage(maybeUsage);
      })
      .catch(() => {
        // Keep the `-` fallback on any network error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function composerHref(): string {
    const trimmed = prompt.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    params.set("mode", mode);
    const qs = params.toString();
    return qs ? `/chat/new?${qs}` : "/chat/new";
  }

  const greetName = userName?.trim() || organizationName;

  return (
    <div
      className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8"
    >
      <section className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs text-[hsl(var(--muted-foreground))]">
          <Sparkles className="h-3 w-3" /> SparkFlow AI Workspace
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          ברוך הבא, {greetName}
        </h1>
        <p className="max-w-2xl text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
          All your AI — slides, sheets, docs, images, video, music, design,
          code, browser, phone. One workspace.
        </p>
      </section>

      {/* Super composer */}
      <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            dir="auto"
            rows={3}
            placeholder="שאל, בקש, או תאר משימה..."
            className="min-h-[96px] resize-none border-0 bg-transparent text-base focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                window.location.href = composerHref();
              }
            }}
          />
          <ComposerToolbar
            mode={mode}
            setMode={setMode}
            model={model}
            setModel={setModel}
            submitHref={composerHref()}
            canSubmit={prompt.trim().length > 0}
          />
        </CardContent>
      </Card>

      {/* Feature grid — 4x4 on lg+, 2-col on sm. Super Agent (wide) +
          15 regular tiles = 16 cell slots. */}
      <section
        aria-label="כלי עבודה"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      >
        {/* Featured: Super Agent — occupies 2 columns with a gradient
            border. Uses a nested wrapper trick so the gradient lives on
            the outer ring while the inner card keeps the app surface. */}
        <Link
          href={FEATURED_TILE.href}
          aria-label={FEATURED_TILE.title}
          className={cn(
            "group col-span-2 rounded-xl p-px",
            "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))]",
            "transition-transform hover:scale-[1.01]",
          )}
        >
          <div className="flex h-full flex-col justify-between rounded-[11px] bg-[hsl(var(--card))] p-5">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))]",
                  "text-[hsl(var(--primary-foreground))]",
                )}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">
                    {FEATURED_TILE.title}
                  </span>
                  <span className="rounded-full border border-[hsl(var(--border))] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    New
                  </span>
                </div>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {FEATURED_TILE.tagline}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[hsl(var(--primary))]">
              פתח
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>

        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card
              key={tile.title}
              className="group h-full border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 transition-colors hover:border-[hsl(var(--primary))]/40"
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    TONE_CLASS[tile.tone] ?? TONE_CLASS.primary,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{tile.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {tile.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="group/cta -mx-2 text-[hsl(var(--primary))]"
                >
                  <Link href={tile.href}>
                    פתח
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover/cta:-translate-x-0.5 rtl:rotate-180 rtl:group-hover/cta:translate-x-0.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Usage strip */}
      <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))]/40">
        <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-col">
            <span className="text-sm font-medium">מה חדש</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Slides, Sheets, Docs ו-Image זמינים כעת בחשבון שלך.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <UsageStat
              label="הודעות היום"
              value={
                usage.messagesToday === null
                  ? "-"
                  : usage.messagesToday.toLocaleString("he-IL")
              }
            />
            <UsageStat
              label="עלות חודשית"
              value={
                usage.monthlyCostUsd === null
                  ? "-"
                  : `$${usage.monthlyCostUsd.toFixed(2)}`
              }
            />
            <Button asChild size="sm" variant="outline">
              <Link href="/billing">צפה בחיוב</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TODO: wire `/api/auth/me` to return a `usage` payload
          ({ messagesToday, monthlyCostUsd }) sourced from the
          observability package; until then we display "-". */}
    </div>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

type ToolbarProps = {
  mode: Mode;
  setMode: (m: Mode) => void;
  model: (typeof MODELS)[number];
  setModel: (m: (typeof MODELS)[number]) => void;
  submitHref: string;
  canSubmit: boolean;
};

function ComposerToolbar({
  mode,
  setMode,
  model,
  setModel,
  submitHref,
  canSubmit,
}: ToolbarProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Upload — routes to /files (the knowledge drive) */}
        <Button asChild size="sm" variant="ghost">
          <Link href="/files" aria-label="העלה קובץ">
            <Paperclip className="h-4 w-4" />
            <span className="hidden sm:inline">העלה</span>
          </Link>
        </Button>

        {/* Drive — not yet connected */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" variant="ghost" disabled aria-label="Google Drive">
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Drive</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>בקרוב</TooltipContent>
        </Tooltip>

        {/* Gmail — not yet connected */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button size="sm" variant="ghost" disabled aria-label="Gmail">
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">Gmail</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>בקרוב</TooltipContent>
        </Tooltip>

        {/* Model picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              {model.label}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>מודל</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODELS.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => setModel(m)}>
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mode pill */}
        <div
          role="tablist"
          aria-label="מצב"
          className="ms-auto inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-0.5"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                mode === m.id
                  ? "bg-[hsl(var(--bg))] font-medium text-[hsl(var(--fg))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--fg))]",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Send */}
        <Button
          asChild={canSubmit}
          size="icon"
          aria-label="שלח"
          disabled={!canSubmit}
          className="rounded-full"
        >
          {canSubmit ? (
            <Link href={submitHref}>
              <Send className="h-4 w-4 rtl:rotate-180" />
            </Link>
          ) : (
            <Send className="h-4 w-4 rtl:rotate-180" />
          )}
        </Button>
      </div>
    </TooltipProvider>
  );
}

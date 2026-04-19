"use client";

/**
 * <ImageStudio />
 *
 * Client-side UI for /api/image/generate. Keeps the last 10 prompts in
 * localStorage (key: `sparkflow-image-prompts`) and renders a small grid
 * of results with download + copy-url buttons.
 *
 * Adds a provider picker (OpenAI / Replicate / Google) sourced from
 * GET /api/image/generate — providers whose env var is missing render as
 * disabled buttons with a tooltip explaining which key to set.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@sparkflow/ui";

type Size = "1024x1024" | "1024x1792" | "1792x1024";
type Quality = "low" | "medium" | "high";
type ProviderId = "openai" | "replicate" | "google";

interface ResultImage {
  url: string;
  storagePath: string | null;
  revisedPrompt?: string;
}

interface ProviderStatus {
  id: string;
  name: string;
  envVar: string;
  configured: boolean;
}

const HISTORY_KEY = "sparkflow-image-prompts";
const HISTORY_MAX = 10;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    /* quota / private-mode — ignore */
  }
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
        style={{ animationDelay: "120ms" }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
        style={{ animationDelay: "240ms" }}
      />
    </span>
  );
}

export function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<Size>("1024x1024");
  const [quality, setQuality] = useState<Quality>("medium");
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ResultImage[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/image/generate", { method: "GET" })
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((data: { providers: ProviderStatus[] }) => {
        if (cancelled) return;
        setProviders(data.providers ?? []);
        const firstConfigured = data.providers?.find((p) => p.configured);
        if (firstConfigured) setProvider(firstConfigured.id as ProviderId);
      })
      .catch(() => {
        /* no-op; UI just shows all as unknown */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [prompt]);

  const onGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setImages([]);
    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, size, quality, provider }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { images: ResultImage[] };
      setImages(data.images);

      const next = [trimmed, ...history.filter((p) => p !== trimmed)].slice(
        0,
        HISTORY_MAX,
      );
      setHistory(next);
      saveHistory(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generation_failed");
    } finally {
      setLoading(false);
    }
  }, [prompt, size, quality, provider, loading, history]);

  const onCopyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, []);

  const onDownload = useCallback(async (url: string, index: number) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `sparkflow-image-${Date.now()}-${index}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      /* ignore */
    }
  }, []);

  const anyConfigured = providers.length === 0 || providers.some((p) => p.configured);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="space-y-4 p-6">
            {providers.length > 0 ? (
              <div className="space-y-2">
                <Label>Provider</Label>
                <div className="flex flex-wrap gap-2">
                  {providers.map((p) => {
                    const active = provider === p.id;
                    const disabled = !p.configured;
                    const btn = (
                      <Button
                        key={p.id}
                        type="button"
                        variant={active ? "default" : "secondary"}
                        size="sm"
                        disabled={disabled}
                        onClick={() => !disabled && setProvider(p.id as ProviderId)}
                      >
                        {p.name}
                      </Button>
                    );
                    return disabled ? (
                      <Tooltip key={p.id}>
                        <TooltipTrigger asChild>
                          <span>{btn}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Set {p.envVar} to enable
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      btn
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="image-prompt">Prompt</Label>
              <Textarea
                id="image-prompt"
                ref={taRef}
                dir="auto"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="תארו את התמונה שתרצו ליצור…"
                rows={3}
                className="min-h-[80px] resize-none"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    onGenerate();
                  }
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Size</Label>
                <div className="flex flex-wrap gap-2">
                  {(["1024x1024", "1024x1792", "1792x1024"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={size === s ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setSize(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quality</Label>
                <div className="flex flex-wrap gap-2">
                  {(["low", "medium", "high"] as const).map((q) => (
                    <Button
                      key={q}
                      type="button"
                      variant={quality === q ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setQuality(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Cmd/Ctrl + Enter to generate
              </div>
              <Button
                onClick={onGenerate}
                disabled={loading || !prompt.trim() || !anyConfigured}
              >
                {loading ? (
                  <>
                    Generating <Dots />
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </div>

            {!anyConfigured && providers.length > 0 ? (
              <Alert>
                <AlertTitle>API keys required</AlertTitle>
                <AlertDescription>
                  Set one of: {providers.map((p) => p.envVar).join(", ")}.
                </AlertDescription>
              </Alert>
            ) : null}

            {error ? (
              <Alert>
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {history.length > 0 ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Recent prompts
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="max-w-xs truncate"
                  >
                    <Badge variant="secondary">{p}</Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {images.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img, i) => (
              <Card key={`${img.url}-${i}`}>
                <CardContent className="space-y-2 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.revisedPrompt ?? prompt}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onDownload(img.url, i)}
                    >
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onCopyUrl(img.url)}
                    >
                      Copy URL
                    </Button>
                  </div>
                  {img.revisedPrompt ? (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {img.revisedPrompt}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

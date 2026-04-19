"use client";

/**
 * <VideoStudio />
 *
 * Client-side UI for /api/video/generate. Kicks off a provider job and
 * polls /api/video/jobs/[id] every 3s until the job terminates.
 *
 * Providers whose env var is missing render as disabled buttons with a
 * tooltip explaining which key to set. If no provider has keys we show
 * an "API keys required" card instead of the generate button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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

type Duration = 2 | 5 | 10;
type JobStatus = "processing" | "succeeded" | "failed";

interface ProviderStatus {
  id: string;
  name: string;
  envVar: string;
  configured: boolean;
}

interface JobState {
  jobId: string;
  status: JobStatus;
  url: string | null;
  error: string | null;
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

export function VideoStudio() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<Duration>(5);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/video/generate", { method: "GET" })
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((data: { providers: ProviderStatus[] }) => {
        if (cancelled) return;
        setProviders(data.providers ?? []);
        const first = data.providers?.find((p) => p.configured);
        if (first) setProviderId(first.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling loop
  useEffect(() => {
    if (!job || job.status !== "processing") return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/video/jobs/${job.jobId}`);
        if (res.ok) {
          const data = (await res.json()) as JobState;
          if (!cancelled) {
            setJob(data);
            if (data.status === "processing") {
              pollRef.current = setTimeout(tick, 3000);
            }
          }
        } else {
          pollRef.current = setTimeout(tick, 5000);
        }
      } catch {
        pollRef.current = setTimeout(tick, 5000);
      }
    };
    pollRef.current = setTimeout(tick, 3000);

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [job]);

  const onGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || starting || !providerId) return;
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          provider: providerId,
          durationSec: duration,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        jobId: string;
        status: JobStatus;
      };
      setJob({ jobId: data.jobId, status: data.status, url: null, error: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "generation_failed");
    } finally {
      setStarting(false);
    }
  }, [prompt, duration, providerId, starting]);

  const anyConfigured = providers.length === 0 || providers.some((p) => p.configured);

  if (providers.length > 0 && !anyConfigured) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <div className="text-base font-semibold">API keys required</div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Set one of the following env vars to enable video generation:
          </p>
          <ul className="list-disc pl-5 text-sm">
            {providers.map((p) => (
              <li key={p.id}>
                <code className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5">
                  {p.envVar}
                </code>{" "}
                — {p.name}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

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
                    const active = providerId === p.id;
                    const disabled = !p.configured;
                    const btn = (
                      <Button
                        key={p.id}
                        type="button"
                        variant={active ? "default" : "secondary"}
                        size="sm"
                        disabled={disabled}
                        onClick={() => !disabled && setProviderId(p.id)}
                      >
                        {p.name}
                      </Button>
                    );
                    return disabled ? (
                      <Tooltip key={p.id}>
                        <TooltipTrigger asChild>
                          <span>{btn}</span>
                        </TooltipTrigger>
                        <TooltipContent>Set {p.envVar} to enable</TooltipContent>
                      </Tooltip>
                    ) : (
                      btn
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="video-prompt">Prompt</Label>
              <Textarea
                id="video-prompt"
                dir="auto"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A cinematic shot of a lighthouse at dawn…"
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

            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex flex-wrap gap-2">
                {([2, 5, 10] as const).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={duration === d ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setDuration(d)}
                  >
                    {d}s
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Cmd/Ctrl + Enter to generate
              </div>
              <Button
                onClick={onGenerate}
                disabled={
                  starting ||
                  !prompt.trim() ||
                  !providerId ||
                  (job?.status === "processing")
                }
              >
                {starting || job?.status === "processing" ? (
                  <>
                    {job?.status === "processing" ? "Rendering" : "Starting"} <Dots />
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </div>

            {error ? (
              <Alert>
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {job?.status === "failed" ? (
              <Alert>
                <AlertTitle>Generation failed</AlertTitle>
                <AlertDescription>{job.error ?? "unknown error"}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {job?.status === "succeeded" && job.url ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <video
                src={job.url}
                controls
                className="w-full rounded-md bg-black"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" asChild>
                  <a href={job.url} download target="_blank" rel="noreferrer">
                    Download
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(job.url ?? "").catch(() => {});
                  }}
                >
                  Copy URL
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

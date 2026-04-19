"use client";

/**
 * In-browser meeting recorder.
 *
 * - Enumerates available audio-input devices (mic selector).
 * - Uses MediaRecorder; prefers `audio/webm;codecs=opus` when supported,
 *   with a graceful fallback to whatever the browser offers.
 * - Hard cap: 60 minutes per recording.
 * - On stop, uploads the blob to `/api/meetings/upload`, then kicks
 *   `/api/meetings/:id/process` and navigates to the detail page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent } from "@sparkflow/ui";

const MAX_RECORDING_MS = 60 * 60 * 1000; // 60 min
const PREFERRED_MIME = "audio/webm;codecs=opus";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return PREFERRED_MIME;
  const candidates = [
    PREFERRED_MIME,
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

type RecorderState = "idle" | "recording" | "stopping" | "uploading" | "error";

export function MeetingRecorder() {
  const router = useRouter();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mimeType = useMemo(() => pickMimeType(), []);

  // Enumerate mic devices (labels only appear after permission is granted).
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      if (!deviceId && mics[0]) setDeviceId(mics[0].deviceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [deviceId]);

  useEffect(() => {
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    };
  }, [refreshDevices]);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const uploadBlob = useCallback(
    async (blob: Blob) => {
      setState("uploading");
      const ext = blob.type.includes("mp4")
        ? "m4a"
        : blob.type.includes("ogg")
          ? "ogg"
          : "webm";
      const filename = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;

      const form = new FormData();
      form.append("file", new File([blob], filename, { type: blob.type || "audio/webm" }));

      try {
        const res = await fetch("/api/meetings/upload", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}) as { error?: string });
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { id: string };
        // Fire-and-forget process kick.
        fetch(`/api/meetings/${body.id}/process`, { method: "POST" }).catch(() => {});
        router.push(`/meetings/${body.id}`);
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [router],
  );

  const start = useCallback(async () => {
    setError(undefined);
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      // Labels now populate — refresh the selector.
      refreshDevices();

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) chunksRef.current.push(evt.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        cleanup();
        void uploadBlob(blob);
      };

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      recorder.start(1000); // emit chunks every second
      setState("recording");

      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 500);
      maxTimerRef.current = setTimeout(() => {
        stop();
      }, MAX_RECORDING_MS);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : String(err));
      cleanup();
    }
    // stop is stable via ref; avoid cyclic dep by not listing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, mimeType, refreshDevices, uploadBlob, cleanup]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state !== "inactive") {
      setState("stopping");
      rec.stop();
    }
  }, []);

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="meeting-mic">
            Microphone
          </label>
          <select
            id="meeting-mic"
            className="h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            disabled={state === "recording" || state === "stopping"}
          >
            {devices.length === 0 ? (
              <option value="">Default microphone</option>
            ) : (
              devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 6)})`}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-2xl tabular-nums">
            {formatElapsed(elapsedMs)}
            <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
              / {formatElapsed(MAX_RECORDING_MS)} max
            </span>
          </div>
          <div className="flex gap-2">
            {state === "recording" || state === "stopping" ? (
              <Button type="button" onClick={stop} disabled={state === "stopping"}>
                Stop &amp; upload
              </Button>
            ) : (
              <Button type="button" onClick={start} disabled={state === "uploading"}>
                {state === "uploading" ? "Uploading…" : "Start recording"}
              </Button>
            )}
          </div>
        </div>

        {error ? (
          <Alert>
            <AlertTitle>Recorder error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

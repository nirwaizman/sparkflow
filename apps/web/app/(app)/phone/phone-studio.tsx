"use client";

/**
 * Phone calling client UI.
 *
 * - Form: phone number (E.164), script textarea, optional voice id.
 * - Start: POST /api/phone/call → append to local history.
 * - History: each entry polls /api/phone/calls/[id] every 4s until the
 *   call is terminal (`ended` / `failed` / `cancelled`); we render the
 *   transcript once it's available.
 * - If the first call returns 503 "phone not configured", we surface a
 *   friendly banner and disable the form.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Label, Textarea } from "@sparkflow/ui";

type TranscriptTurn = { role: string; message: string };

type CallRecord = {
  id: string;
  status?: string;
  transcript?: unknown;
  endedAt?: string;
  endedReason?: string;
  recordingUrl?: string;
  // Local-only: phone + script we dialed — handy in the history list.
  toNumber: string;
  scriptPreview: string;
};

const TERMINAL_STATUSES = new Set([
  "ended",
  "failed",
  "canceled",
  "cancelled",
]);

function normalizeTranscript(raw: unknown): TranscriptTurn[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    // Single blob — split into pseudo-turns by line.
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => ({ role: "assistant", message: line }));
  }
  if (Array.isArray(raw)) {
    return raw
      .map((t) => {
        if (t && typeof t === "object") {
          const role =
            "role" in t && typeof (t as { role: unknown }).role === "string"
              ? (t as { role: string }).role
              : "assistant";
          const message =
            "message" in t && typeof (t as { message: unknown }).message === "string"
              ? (t as { message: string }).message
              : "content" in t && typeof (t as { content: unknown }).content === "string"
                ? (t as { content: string }).content
                : "";
          return { role, message };
        }
        return { role: "assistant", message: String(t) };
      })
      .filter((t) => t.message.length > 0);
  }
  return [];
}

export function PhoneStudio() {
  const [toNumber, setToNumber] = useState("");
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("");
  const [isStarting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [calls, setCalls] = useState<CallRecord[]>([]);

  // Keep a single interval that polls every active call. We re-create it
  // whenever the set of non-terminal call ids changes.
  const pollRef = useRef<number | null>(null);
  const activeIdsRef = useRef<string[]>([]);

  const refreshCall = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/phone/calls/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const body = (await res.json()) as { call?: Partial<CallRecord> };
      if (!body.call) return;
      setCalls((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: body.call!.status ?? c.status,
                transcript: body.call!.transcript ?? c.transcript,
                endedAt: body.call!.endedAt ?? c.endedAt,
                endedReason: body.call!.endedReason ?? c.endedReason,
                recordingUrl: body.call!.recordingUrl ?? c.recordingUrl,
              }
            : c,
        ),
      );
    } catch {
      // Transient network errors — the next tick will retry.
    }
  }, []);

  useEffect(() => {
    const active = calls
      .filter((c) => !c.status || !TERMINAL_STATUSES.has(c.status))
      .map((c) => c.id);
    activeIdsRef.current = active;
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (active.length === 0) return;
    pollRef.current = window.setInterval(() => {
      for (const id of activeIdsRef.current) {
        void refreshCall(id);
      }
    }, 4_000);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [calls, refreshCall]);

  const startCall = useCallback(async () => {
    if (!toNumber.trim() || !script.trim() || isStarting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/phone/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toNumber: toNumber.trim(),
          script,
          voice: voice.trim() || undefined,
        }),
      });
      if (res.status === 503) {
        setNotConfigured(true);
        setError("Phone calling is not configured on this deployment.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ??
            `Request failed: ${res.status}`,
        );
      }
      const body = (await res.json()) as {
        call: { id: string; status?: string };
      };
      setCalls((prev) => [
        {
          id: body.call.id,
          status: body.call.status ?? "queued",
          toNumber: toNumber.trim(),
          scriptPreview: script.slice(0, 120),
        },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [toNumber, script, voice, isStarting]);

  return (
    <div className="space-y-6">
      {notConfigured ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Phone calling requires <code>VAPI_API_KEY</code> and{" "}
          <code>VAPI_PHONE_NUMBER_ID</code>. Set them in your environment
          to enable this feature.
        </div>
      ) : null}

      <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="phone-to">Phone number (E.164)</Label>
          <Input
            id="phone-to"
            type="tel"
            placeholder="+15551234567"
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value)}
            disabled={isStarting || notConfigured}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone-script">Script</Label>
          <Textarea
            id="phone-script"
            rows={6}
            placeholder='e.g. "You are booking a haircut for Monday afternoon. Ask for availability, confirm the time, and get a confirmation number."'
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={isStarting || notConfigured}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone-voice">Voice (optional)</Label>
          <Input
            id="phone-voice"
            placeholder="ElevenLabs voice id"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={isStarting || notConfigured}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={startCall}
            disabled={
              !toNumber.trim() ||
              !script.trim() ||
              isStarting ||
              notConfigured
            }
          >
            {isStarting ? "Starting…" : "Start call"}
          </Button>
          {error ? (
            <span className="text-sm text-red-600">{error}</span>
          ) : null}
        </div>
      </section>

      {calls.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-700">Call history</h2>
          <ul className="space-y-3">
            {calls.map((c) => {
              const turns = normalizeTranscript(c.transcript);
              const terminal = c.status && TERMINAL_STATUSES.has(c.status);
              return (
                <li
                  key={c.id}
                  className="rounded-md border border-neutral-200 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{c.toNumber}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {c.scriptPreview}
                      </div>
                    </div>
                    <div className="text-xs">
                      <span
                        className={`rounded px-2 py-0.5 ${
                          terminal
                            ? c.endedReason?.includes("fail") ||
                              c.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {c.status ?? "queued"}
                      </span>
                    </div>
                  </div>
                  {c.recordingUrl ? (
                    <audio
                      controls
                      src={c.recordingUrl}
                      className="mt-2 w-full"
                    />
                  ) : null}
                  {turns.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {turns.map((t, i) => (
                        <div key={i} className="text-xs">
                          <span className="mr-2 font-mono text-neutral-400">
                            {t.role}
                          </span>
                          <span>{t.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : !terminal ? (
                    <p className="mt-2 text-xs text-neutral-500">
                      Waiting for transcript…
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

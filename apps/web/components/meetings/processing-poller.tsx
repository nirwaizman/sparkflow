"use client";

/**
 * Client-side refresher for meetings that are still processing.
 *
 * Polls `/api/meetings/:id` every 2s while the status is `uploaded` or
 * `processing`, and calls `router.refresh()` when it transitions so the server
 * component re-renders with the final notes.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ProcessingPoller({
  meetingId,
  initialStatus,
}: {
  meetingId: string;
  initialStatus: "uploaded" | "processing" | "ready" | "failed";
}) {
  const router = useRouter();

  useEffect(() => {
    if (initialStatus !== "uploaded" && initialStatus !== "processing") return;
    let cancelled = false;
    const MAX_ATTEMPTS = 300; // ~10 min at 2s cadence

    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
        try {
          const res = await fetch(`/api/meetings/${meetingId}`, { cache: "no-store" });
          if (!res.ok) continue;
          const body = (await res.json()) as {
            meeting?: { status: "uploaded" | "processing" | "ready" | "failed" };
          };
          const status = body.meeting?.status;
          if (status === "ready" || status === "failed") {
            router.refresh();
            return;
          }
        } catch {
          /* transient */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId, initialStatus, router]);

  return null;
}

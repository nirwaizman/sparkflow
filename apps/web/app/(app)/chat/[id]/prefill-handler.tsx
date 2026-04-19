"use client";

/**
 * One-shot localStorage prefill bridge for `/chat/[id]?q=...`.
 *
 * We cannot modify the chat composer as part of this change set, so the
 * contract is intentionally lightweight: this component writes the
 * pending prompt into `localStorage` under a well-known key and then
 * strips the query param from the URL so a refresh won't repeat the
 * action. The composer (a later change) reads the key on mount, sends
 * the message, and clears it.
 *
 * TODO: once `components/chat/composer.tsx` picks up the key
 *       (`sparkflow-prefill`), delete this comment. Until then the
 *       prompt round-trips silently — no regression, just a no-op.
 */
import { useEffect } from "react";

const STORAGE_KEY = "sparkflow-prefill";

export function PrefillHandler({
  q,
  mode,
}: {
  q?: string;
  mode?: string;
}) {
  useEffect(() => {
    if (!q || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ q, mode: mode ?? "chat", ts: Date.now() }),
      );
    } catch {
      // localStorage may be unavailable (private mode). In that case we
      // fall back to URL-only state and let the composer pick it up
      // from `?q=` if it ever starts reading that.
    }

    // Strip the query string so a reload doesn't re-fire the prompt.
    const url = new URL(window.location.href);
    if (url.searchParams.has("q") || url.searchParams.has("mode")) {
      url.searchParams.delete("q");
      url.searchParams.delete("mode");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + (url.search ? url.search : "") + url.hash,
      );
    }
  }, [q, mode]);

  return null;
}

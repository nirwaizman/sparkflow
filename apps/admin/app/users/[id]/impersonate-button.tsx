"use client";

import { useState } from "react";

export function ImpersonateButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const impersonate = async () => {
    if (busy) return;
    if (
      !confirm(
        `Start impersonating ${email}?\n\nThis will be logged in the audit trail.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus("Impersonation cookie set. Open the main app to continue.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={impersonate}
        disabled={busy}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {busy ? "Starting…" : "Impersonate"}
      </button>
      {status && (
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          {status}
        </p>
      )}
    </div>
  );
}

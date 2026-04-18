"use client";

/**
 * Small client components for the billing page.
 *
 * Each button POSTs to the matching /api/billing/... route and follows
 * the returned Stripe URL. On failure, surfaces a toast-free inline
 * error by falling back to an alert — the billing happy path is
 * exercised enough to not justify a toast dep here yet.
 */
import { useState, useTransition } from "react";

export function CheckoutButton({
  tier,
  interval,
  label,
}: {
  tier: "pro" | "team";
  interval: "month" | "year";
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tier, interval }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setErr(body?.error ?? `Request failed (${res.status})`);
          return;
        }
        const body = (await res.json()) as { url?: string };
        if (body.url) window.location.href = body.url;
      } catch (e) {
        setErr(e instanceof Error ? e.message : "network_error");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "Loading…" : label}
      </button>
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </div>
  );
}

export function PortalButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const onClick = () => {
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/portal", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setErr(body?.error ?? `Request failed (${res.status})`);
          return;
        }
        const body = (await res.json()) as { url?: string };
        if (body.url) window.location.href = body.url;
      } catch (e) {
        setErr(e instanceof Error ? e.message : "network_error");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Loading…" : label}
      </button>
      {err ? <span className="text-xs text-destructive">{err}</span> : null}
    </div>
  );
}

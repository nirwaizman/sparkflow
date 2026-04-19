"use client";

/**
 * Refund request form (stub).
 *
 * Writes a `refund.requested` row to `audit_logs` via the
 * `/api/refunds` route. The real Stripe call is intentionally not wired
 * up — billing is paused in this environment. Once billing resumes,
 * `/api/refunds` should fan out to Stripe's `refunds.create` and patch
 * this row with the refund id.
 */
import { useState } from "react";

export function RefundRequestForm({
  organizationId,
  stripeCustomerId,
  stripeSubscriptionId,
}: {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}) {
  const [amountUsd, setAmountUsd] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = Number(amountUsd);
    if (!Number.isFinite(n) || n <= 0) {
      setStatus("Amount must be a positive number.");
      return;
    }
    if (!reason.trim()) {
      setStatus("Reason is required.");
      return;
    }
    if (
      !confirm(
        `Mark refund of $${n.toFixed(2)} as PENDING for ${stripeCustomerId}?\n\nNo Stripe call will be made yet — billing is paused.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          amountUsd: n,
          reason: reason.trim(),
          stripeCustomerId,
          stripeSubscriptionId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { auditId?: string };
      setStatus(
        `Refund marked pending (audit ${body.auditId ?? "?"}). Follow up once billing resumes.`,
      );
      setAmountUsd("");
      setReason("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 text-sm">
      <div
        className="text-xs text-[hsl(var(--muted-foreground))]"
        dir="ltr"
      >
        Customer: {stripeCustomerId} · Subscription: {stripeSubscriptionId}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          placeholder="Amount (USD)"
          className="w-40 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          className="flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Mark pending"}
        </button>
      </div>
      {status && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{status}</p>
      )}
    </form>
  );
}

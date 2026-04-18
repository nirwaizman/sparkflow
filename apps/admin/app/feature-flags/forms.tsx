"use client";

/**
 * Client forms for the feature-flags admin page. Keeps the server
 * page component free of event handlers.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function FeatureFlagForm({
  id,
  enabled,
  rolloutPercent,
}: {
  id: string;
  enabled: boolean;
  rolloutPercent: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [enabledState, setEnabled] = useState(enabled);
  const [rollout, setRollout] = useState(rolloutPercent);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/feature-flags", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled: enabledState, rolloutPercent: rollout }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={enabledState}
        onChange={(e) => setEnabled(e.target.checked)}
        className="accent-brand-600"
        aria-label="enabled"
      />
      <input
        type="number"
        min={0}
        max={100}
        value={rollout}
        onChange={(e) => setRollout(Number(e.target.value))}
        className="w-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-0.5 text-xs"
        aria-label="rollout %"
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-md border border-[hsl(var(--border))] px-2 py-0.5 text-xs hover:bg-[hsl(var(--muted))] disabled:opacity-50"
      >
        {busy ? "…" : "Save"}
      </button>
    </div>
  );
}

export function NewFlagForm({
  orgs,
}: {
  orgs: { id: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [scope, setScope] = useState<string>("global");
  const [enabled, setEnabled] = useState(false);
  const [rollout, setRollout] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feature-flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: key.trim(),
          organizationId: scope === "global" ? null : scope,
          enabled,
          rolloutPercent: rollout,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setKey("");
      setRollout(0);
      setEnabled(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm">
      <input
        required
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="flag.key"
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 font-mono text-xs"
      />
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs"
      >
        <option value="global">global</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-brand-600"
        />
        enabled
      </label>
      <input
        type="number"
        min={0}
        max={100}
        value={rollout}
        onChange={(e) => setRollout(Number(e.target.value))}
        className="w-20 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1.5 py-1 text-xs"
        aria-label="rollout %"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create"}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </form>
  );
}

"use client";

/**
 * Client-only action buttons + consent widget for /privacy.
 *
 * The data-export card triggers the server route, then feeds the returned
 * `data:` URL into a hidden <a download>. The delete-account card asks
 * for typed confirmation before scheduling. Consent preferences live in
 * `localStorage` for now.
 *
 * TODO(compliance/consent): persist consent preferences to a dedicated
 * `user_consents` table so they follow the user across devices and can
 * be produced on-demand for DSAR responses.
 */
import { useEffect, useState } from "react";

const CONSENT_KEYS = [
  { key: "analytics", label: "Product analytics" },
  { key: "marketingEmails", label: "Marketing emails" },
  { key: "modelTraining", label: "Allow my chats to improve models" },
] as const;

type ConsentKey = (typeof CONSENT_KEYS)[number]["key"];
type ConsentState = Record<ConsentKey, boolean>;

const STORAGE_KEY = "sf-consent-prefs";
const DEFAULT_STATE: ConsentState = {
  analytics: true,
  marketingEmails: false,
  modelTraining: false,
};

export function ExportDataButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/compliance/export", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `http_${res.status}`);
      }
      const data = (await res.json()) as { downloadUrl: string };
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = `sparkflow-export-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMessage("Download started.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Preparing export..." : "Download my data"}
      </button>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}

export function DeleteAccountButton() {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (confirm !== "DELETE") {
      setMessage('Type "DELETE" to confirm.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/compliance/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `http_${res.status}`);
      }
      const data = (await res.json()) as { scheduledAt: string };
      setMessage(
        `Deletion scheduled. Your data will be removed on ${new Date(
          data.scheduledAt,
        ).toLocaleDateString()}.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder='Type "DELETE" to confirm'
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={run}
        disabled={busy || confirm !== "DELETE"}
        className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? "Scheduling..." : "Request account deletion"}
      </button>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}

export function ConsentPrefs() {
  const [state, setState] = useState<ConsentState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ConsentState>;
        setState({ ...DEFAULT_STATE, ...parsed });
      }
    } catch {
      // Ignore corrupt JSON — fall through to defaults.
    }
    setHydrated(true);
  }, []);

  function toggle(key: ConsentKey) {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable in private mode.
      }
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-3">
      {CONSENT_KEYS.map(({ key, label }) => (
        <li key={key} className="flex items-center justify-between gap-4">
          <span className="text-sm">{label}</span>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={state[key]}
              onChange={() => toggle(key)}
              disabled={!hydrated}
              className="h-4 w-4"
            />
            <span className="text-xs text-muted-foreground">
              {state[key] ? "Enabled" : "Disabled"}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

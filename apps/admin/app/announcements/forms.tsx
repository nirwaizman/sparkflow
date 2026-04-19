"use client";

/**
 * Client forms for the announcements page.
 *
 * `AnnouncementForm` POSTs to /api/announcements which writes the
 * feature-flag row and optionally triggers an email blast via
 * `@sparkflow/growth`'s `sendEmail`. `ToggleButton` flips the `enabled`
 * column on an existing flag.
 */
import { useState } from "react";

export function AnnouncementForm() {
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">(
    "info",
  );
  const [sendEmail, setSendEmail] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!body.trim()) {
      setStatus("Body is required.");
      return;
    }
    if (
      sendEmail &&
      !confirm(
        "Send this announcement to ALL users by email?\n\nThis cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          severity,
          sendEmail,
          enabled,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setStatus(b.error ?? `HTTP ${res.status}`);
        return;
      }
      const b = (await res.json()) as {
        key?: string;
        emailedTo?: number;
        emailSkipped?: string;
      };
      setStatus(
        `Saved as ${b.key}.${
          sendEmail
            ? b.emailSkipped
              ? ` Email skipped: ${b.emailSkipped}.`
              : ` Emailed ${b.emailedTo ?? 0} users.`
            : ""
        }`,
      );
      setBody("");
      setSendEmail(false);
      // Refresh the list — simplest correct option.
      window.location.reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 text-sm">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Announcement body (shown in banner + email)"
        className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          Severity:
          <select
            value={severity}
            onChange={(e) =>
              setSeverity(e.target.value as "info" | "warning" | "critical")
            }
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
          >
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          Also email all users
        </label>
        <button
          type="submit"
          disabled={busy}
          className="ml-auto rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
      {status && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{status}</p>
      )}
    </form>
  );
}

export function ToggleButton({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(enabled);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, enabled: !current }),
      });
      if (res.ok) setCurrent(!current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))] disabled:opacity-50"
    >
      {current ? "Disable" : "Enable"}
    </button>
  );
}

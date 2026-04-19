"use client";

/**
 * Integrations — Google Drive + Gmail.
 *
 * Renders a simple list of available providers with a status pill
 * (Connected / Not connected / Not configured / Expired) and a
 * Connect / Disconnect action. Once connected, pulls 10 sample items
 * per service so the user can verify the hookup end-to-end.
 *
 * Status shape — see `/api/integrations/status`.
 */
import { useCallback, useEffect, useState } from "react";

type ProviderKey = "google-drive" | "gmail";
type ProviderStatus =
  | "not_configured"
  | "not_connected"
  | "connected"
  | "expired";

type StatusPayload = {
  providers: Record<
    ProviderKey,
    { status: ProviderStatus; scopes?: string; expiresAt?: number }
  >;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type GmailMessage = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  date: string;
  subject: string;
};

const PROVIDER_META: Record<
  ProviderKey,
  { label: string; blurb: string; iconEmoji: string }
> = {
  "google-drive": {
    label: "Google Drive",
    blurb: "Read-only access so agents can pull context from your Drive files.",
    iconEmoji: "\u{1F4C1}",
  },
  gmail: {
    label: "Gmail",
    blurb: "Read-only access so agents can triage your inbox.",
    iconEmoji: "\u2709\uFE0F",
  },
};

function StatusPill({ status }: { status: ProviderStatus }) {
  const map: Record<ProviderStatus, { label: string; className: string }> = {
    connected: {
      label: "Connected",
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    not_connected: {
      label: "Not connected",
      className: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]",
    },
    not_configured: {
      label: "Not configured",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    },
    expired: {
      label: "Expired",
      className: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    },
  };
  const meta = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null);
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[] | null>(
    null,
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetch("/api/integrations/status", { cache: "no-store" });
      if (s.ok) {
        const json = (await s.json()) as StatusPayload;
        setStatus(json);
        const googleConnected =
          json.providers["google-drive"].status === "connected";

        if (googleConnected) {
          const [dr, gm] = await Promise.all([
            fetch("/api/integrations/google/drive/list", { cache: "no-store" }),
            fetch("/api/integrations/gmail/messages", { cache: "no-store" }),
          ]);
          if (dr.ok) {
            const j = (await dr.json()) as { files?: DriveFile[] };
            setDriveFiles((j.files ?? []).slice(0, 10));
          }
          if (gm.ok) {
            const j = (await gm.json()) as { messages?: GmailMessage[] };
            setGmailMessages((j.messages ?? []).slice(0, 10));
          }
        } else {
          setDriveFiles(null);
          setGmailMessages(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Read any ?connected=google or ?error=... left by the callback
    // redirect, show a one-time banner, then clean up the URL.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const connected = url.searchParams.get("connected");
      const err = url.searchParams.get("error");
      if (connected) {
        setBanner(`Connected: ${connected}`);
        url.searchParams.delete("connected");
        window.history.replaceState({}, "", url.toString());
      } else if (err) {
        setBanner(`Connection error: ${err}`);
        url.searchParams.delete("error");
        url.searchParams.delete("detail");
        window.history.replaceState({}, "", url.toString());
      }
    }
    refresh();
  }, [refresh]);

  const connectGoogle = async () => {
    // If configured, the connect route returns a 302 redirect. If not
    // configured, it returns a JSON `{ configured: false }` body. We
    // probe with fetch(redirect:"manual") so we can distinguish the
    // two and surface a friendly message instead of a blank page.
    try {
      const res = await fetch("/api/integrations/google/connect", {
        redirect: "manual",
      });
      // `redirect: "manual"` on a 302 yields status 0 / "opaqueredirect"
      // in browsers. Navigate the top-level window in that case.
      if (res.type === "opaqueredirect" || res.status === 0 || res.status === 302) {
        window.location.href = "/api/integrations/google/connect";
        return;
      }
      const json = await res.json().catch(() => ({}));
      setBanner(
        typeof json.message === "string"
          ? json.message
          : "Google OAuth not configured",
      );
    } catch {
      // As a last resort, just navigate — the server will redirect if
      // configured or render JSON otherwise.
      window.location.href = "/api/integrations/google/connect";
    }
  };

  const disconnectGoogle = async () => {
    await fetch("/api/integrations/google/disconnect", { method: "POST" });
    setBanner("Disconnected Google");
    await refresh();
  };

  const googleStatus = status?.providers["google-drive"].status;
  const isGoogleConnected = googleStatus === "connected";
  const isGoogleConfigured = googleStatus !== "not_configured";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Integrations</h1>
      <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
        Connect third-party services so your agents can read their data.
      </p>

      {banner && (
        <div className="mb-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
          {banner}
        </div>
      )}

      {(["google-drive", "gmail"] as ProviderKey[]).map((key) => {
        const meta = PROVIDER_META[key];
        const s = status?.providers[key].status ?? "not_connected";
        return (
          <section
            key={key}
            className="mb-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--muted))] text-xl"
                >
                  {meta.iconEmoji}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">{meta.label}</h2>
                    <StatusPill status={s} />
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {meta.blurb}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s === "connected" ? (
                  <button
                    type="button"
                    onClick={disconnectGoogle}
                    className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectGoogle}
                    disabled={!isGoogleConfigured && s === "not_configured"}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {loading && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Loading integration status…
        </p>
      )}

      {isGoogleConnected && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h2 className="mb-2 text-sm font-semibold">Drive — recent files</h2>
            {driveFiles === null ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Loading…
              </p>
            ) : driveFiles.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                No files found.
              </p>
            ) : (
              <ul className="space-y-2">
                {driveFiles.map((f) => (
                  <li key={f.id} className="text-sm">
                    {f.webViewLink ? (
                      <a
                        href={f.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {f.name}
                      </a>
                    ) : (
                      <span className="font-medium">{f.name}</span>
                    )}
                    <span className="ms-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {f.mimeType}
                      {f.modifiedTime ? ` · ${f.modifiedTime.slice(0, 10)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h2 className="mb-2 text-sm font-semibold">Gmail — recent messages</h2>
            {gmailMessages === null ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Loading…
              </p>
            ) : gmailMessages.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Inbox is empty.
              </p>
            ) : (
              <ul className="space-y-3">
                {gmailMessages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">
                        {m.subject || "(no subject)"}
                      </span>
                      <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                        {m.date}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                      {m.from}
                    </div>
                    <p className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
                      {m.snippet}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

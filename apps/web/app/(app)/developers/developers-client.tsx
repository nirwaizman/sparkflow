"use client";

/**
 * Developers page client.
 *
 * Two tabs:
 *   1. "API keys": list + create + revoke. Newly-minted keys surface a
 *      one-time "copy key" banner; after dismissal the raw value is
 *      unrecoverable.
 *   2. "Webhooks": list + create + delete + test-send. On creation the
 *      signing secret is shown once in the dialog.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkflow/ui";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
  lastDeliveredAt: string | null;
  lastStatus: number | null;
};

export function DevelopersClient() {
  return (
    <Tabs defaultValue="keys" className="w-full">
      <TabsList>
        <TabsTrigger value="keys">API keys</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
      </TabsList>
      <TabsContent value="keys" className="mt-6">
        <ApiKeysSection />
      </TabsContent>
      <TabsContent value="webhooks" className="mt-6">
        <WebhooksSection />
      </TabsContent>
    </Tabs>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  API keys                                  */
/* -------------------------------------------------------------------------- */

function ApiKeysSection() {
  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [justCreated, setJustCreated] = useState<{ plain: string; name: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys", { cache: "no-store" });
      const body = (await res.json()) as { keys?: ApiKeyRow[] };
      setRows(body.keys ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Failed: ${res.status}`);
        return;
      }
      const body = (await res.json()) as { key: ApiKeyRow & { plain: string } };
      setJustCreated({ plain: body.key.plain, name: body.key.name });
      setNewName("");
      setCreateOpen(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [load, newName]);

  const onRevoke = useCallback(
    async (id: string) => {
      if (!confirm("Revoke this key? Applications using it will start failing.")) return;
      await fetch(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    },
    [load],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>API keys</CardTitle>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Create key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Production backend"
                maxLength={120}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={() => void onCreate()} disabled={submitting || !newName.trim()}>
                {submitting ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {justCreated ? <CopyOnceBanner entry={justCreated} onDismiss={() => setJustCreated(null)} /> : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Prefix</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.keyPrefix}…</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.revokedAt ? (
                        <span className="text-destructive">Revoked</span>
                      ) : (
                        <span className="text-emerald-600">Active</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!r.revokedAt ? (
                        <Button variant="ghost" size="sm" onClick={() => void onRevoke(r.id)}>
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CopyOnceBanner({
  entry,
  onDismiss,
}: {
  entry: { plain: string; name: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.plain);
      setCopied(true);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <p className="font-medium">Copy your new key now</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is the only time we will show the full key for <strong>{entry.name}</strong>.
        Store it somewhere safe — you won&apos;t be able to see it again.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Input readOnly value={entry.plain} className="font-mono text-xs" />
        <Button size="sm" onClick={() => void onCopy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Webhooks                                  */
/* -------------------------------------------------------------------------- */

const EVENT_OPTIONS = [
  "task.created",
  "task.completed",
  "task.failed",
  "workflow.created",
  "workflow.run.started",
  "workflow.run.completed",
  "workflow.run.failed",
  "file.uploaded",
  "file.ingested",
  "file.failed",
];

function WebhooksSection() {
  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["task.completed"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{ url: string; secret: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks", { cache: "no-store" });
      const body = (await res.json()) as { webhooks?: WebhookRow[] };
      setRows(body.webhooks ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Failed: ${res.status}`);
        return;
      }
      const body = (await res.json()) as {
        webhook: { url: string; secret: string };
      };
      setJustCreated({ url: body.webhook.url, secret: body.webhook.secret });
      setOpen(false);
      setUrl("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [events, load, url]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this webhook subscription?")) return;
      await fetch(`/api/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    },
    [load],
  );

  const onTest = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}/test`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as { status?: number } | null;
      alert(body?.status ? `Endpoint responded with ${body.status}` : "Delivery failed");
      await load();
    },
    [load],
  );

  const toggleEvent = (ev: string) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Webhooks</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New subscription</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New webhook subscription</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hook-url">Endpoint URL</Label>
                <Input
                  id="hook-url"
                  placeholder="https://example.com/sparkflow"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Events</Label>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {EVENT_OPTIONS.map((ev) => (
                    <label
                      key={ev}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={events.includes(ev)}
                        onChange={() => toggleEvent(ev)}
                      />
                      <span className="font-mono text-xs">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={() => void onCreate()}
                disabled={submitting || !url.trim() || events.length === 0}
              >
                {submitting ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {justCreated ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <p className="font-medium">Signing secret</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Store this secret now — it is used to verify the HMAC signature on
              each delivery to <strong>{justCreated.url}</strong> and will not
              be shown again.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Input readOnly value={justCreated.secret} className="font-mono text-xs" />
              <Button
                size="sm"
                onClick={() => void navigator.clipboard.writeText(justCreated.secret)}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhook subscriptions yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Events</th>
                  <th className="px-3 py-2 font-medium">Last delivery</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{r.url}</td>
                    <td className="px-3 py-2 text-xs">{r.events.join(", ")}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.lastDeliveredAt
                        ? `${new Date(r.lastDeliveredAt).toLocaleString()} · ${r.lastStatus ?? "n/a"}`
                        : "Never"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => void onTest(r.id)}>
                        Test
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void onDelete(r.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

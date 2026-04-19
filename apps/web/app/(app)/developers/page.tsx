/**
 * /developers — Public API key + outgoing webhook management.
 *
 * Server wrapper. All interactive state lives inside the client
 * `<DevelopersClient />` component, which talks to `/api/keys` and
 * `/api/webhooks`.
 */
import { DevelopersClient } from "./developers-client";

export const dynamic = "force-dynamic";

export default function DevelopersPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Developers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage API keys and outgoing webhook subscriptions for your
          organization. The public API base is{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/v1</code>.
        </p>
      </header>
      <DevelopersClient />
    </div>
  );
}

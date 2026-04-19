"use client";

/**
 * SCIM token display card. Shows the freshly-minted token plus a
 * copyable bearer ready to paste into the IdP's "SCIM token" field.
 */
import { useState } from "react";

interface Props {
  orgId: string;
  token: string;
  scimBase: string;
}

export function ScimTokenCard({ orgId, token, scimBase }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const bearer = `${orgId}:${token}`;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard denied — leave state alone */
    }
  }

  return (
    <section className="rounded-lg border p-5">
      <h2 className="mb-2 text-lg font-medium">SCIM provisioning</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Point your IdP at the endpoint below. This token is shown once per
        page load and cannot be recovered — copy it now.
      </p>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Endpoint</dt>
          <dd className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted p-2 text-xs">{scimBase}</code>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => copy(scimBase, "endpoint")}
            >
              {copied === "endpoint" ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>

        <div>
          <dt className="text-xs uppercase text-muted-foreground">Bearer token</dt>
          <dd className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-muted p-2 text-xs">
              {bearer}
            </code>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => copy(bearer, "bearer")}
            >
              {copied === "bearer" ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>
      </dl>
    </section>
  );
}

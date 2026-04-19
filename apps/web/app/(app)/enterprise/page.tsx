/**
 * /enterprise — enterprise admin dashboard.
 *
 * Three stacked cards:
 *   1. SSO setup — shows whether WorkOS is configured and exposes the
 *      authorize URL for the current org's slug.
 *   2. SCIM token — mints/renders a one-shot SCIM bearer the admin
 *      copies into their IdP. Token persistence is in-memory for now
 *      (see `@sparkflow/enterprise/scim`); regenerate on deploy.
 *   3. IP allowlist — CIDR list editor that POSTs to the API route.
 *
 * Server Component for session + SSO-config checks. The SCIM token
 * mint + IP allowlist editor are client components for the obvious
 * reasons.
 */
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession, requireRole, AuthError } from "@sparkflow/auth";
import { getDb, organizations } from "@sparkflow/db";
import {
  getAllowlist,
  isWorkOSConfigured,
  mintScimToken,
} from "@sparkflow/enterprise";
import { IpAllowlistEditor } from "./ip-allowlist-editor";
import { ScimTokenCard } from "./scim-token-card";

export const dynamic = "force-dynamic";

export default async function EnterprisePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    requireRole(session, "admin");
  } catch (err) {
    if (err instanceof AuthError) redirect("/");
    throw err;
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

  const ssoConfigured = isWorkOSConfigured();
  const cidrs = getAllowlist(session.organizationId);

  // We mint a fresh token on every render so admins always see a
  // copyable value. The previous hash is overwritten, which is OK — a
  // real `scim_tokens` table will replace this mint-on-render hack.
  const scimToken = mintScimToken(session.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Enterprise</h1>
        <p className="text-sm text-muted-foreground">
          SSO, SCIM provisioning, and network allowlisting for{" "}
          <span className="font-medium">{org?.name ?? "your organization"}</span>.
        </p>
      </header>

      <section className="rounded-lg border p-5">
        <h2 className="mb-2 text-lg font-medium">Single sign-on</h2>
        {ssoConfigured ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              WorkOS is configured. Share this link with your IdP admins or
              embed it in your product as the SSO entry point.
            </p>
            <code className="block rounded bg-muted p-2 text-xs">
              /api/sso/authorize?org={org?.slug ?? session.organizationId}
            </code>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            SSO is not configured. Set <code>WORKOS_API_KEY</code> and{" "}
            <code>WORKOS_CLIENT_ID</code> on the server, then return to this
            page to finish the setup in your WorkOS dashboard.
          </p>
        )}
      </section>

      <ScimTokenCard
        token={scimToken}
        orgId={session.organizationId}
        scimBase="/api/scim/v2"
      />

      <section className="rounded-lg border p-5">
        <h2 className="mb-2 text-lg font-medium">IP allowlist</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          One CIDR block per line. Leave empty to disable the allowlist
          (all IPs permitted). Invalid blocks are rejected on save.
        </p>
        <IpAllowlistEditor initial={cidrs} />
      </section>
    </div>
  );
}

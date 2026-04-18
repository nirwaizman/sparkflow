export const dynamic = "force-dynamic";

/**
 * Admin user detail + impersonation stub.
 *
 * TODO(impersonation): the full handoff — minting a scoped Supabase
 * session for the target user — is not implemented here. This page
 * surfaces a button that POSTs to `/api/impersonate` which:
 *   - sets an `sf-impersonating` cookie containing the target user id,
 *   - writes an audit log entry via `@sparkflow/auth`'s `logAudit`.
 * Downstream code (`getSession`) is expected to honour the cookie in
 * a follow-up change; until then this is purely a trail of intent.
 * The cookie is scoped to the current host. In production set the
 * `ADMIN_COOKIE_DOMAIN` env (e.g. `.sparkflow.app`); for local dev
 * leave it blank and the browser defaults to host-only (localhost).
 */
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  getDb,
  memberships,
  organizations,
  users,
} from "@sparkflow/db";
import { ImpersonateButton } from "./impersonate-button";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) notFound();

  const memberRows = await db
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
      createdAt: memberships.createdAt,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(memberships)
    .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, id));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{user.displayName ?? user.email}</h1>
      <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]" dir="ltr">
        {user.email}
      </p>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Metadata
        </h2>
        <dl className="grid grid-cols-[120px_1fr] gap-2 text-sm">
          <dt className="text-[hsl(var(--muted-foreground))]">User ID</dt>
          <dd dir="ltr">{user.id}</dd>
          <dt className="text-[hsl(var(--muted-foreground))]">Locale</dt>
          <dd>{user.locale}</dd>
          <dt className="text-[hsl(var(--muted-foreground))]">Created</dt>
          <dd dir="ltr">{user.createdAt.toISOString()}</dd>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Memberships
        </h2>
        <ul className="space-y-1 text-sm">
          {memberRows.map((m) => (
            <li key={m.organizationId} className="flex items-center gap-2">
              <span className="font-medium">{m.orgName}</span>
              <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px]">
                {m.role}
              </span>
            </li>
          ))}
          {memberRows.length === 0 && (
            <li className="text-xs text-[hsl(var(--muted-foreground))]">
              No memberships.
            </li>
          )}
        </ul>
      </section>

      <ImpersonateButton userId={user.id} email={user.email} />
    </div>
  );
}

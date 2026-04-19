export const dynamic = "force-dynamic";

/**
 * Admin org detail page.
 *
 * Shows the information support + success need for a single org:
 *   - metadata (id, slug, created)
 *   - members table with role
 *   - SSO status (reads `feature_flags` with key `sso:enabled` for a
 *     lightweight signal; the full WorkOS connection state lives in
 *     `@sparkflow/enterprise/sso` and is fetched lazily by the web app)
 *   - SCIM token status (read-only — we only store a hash so the raw
 *     token is never redisplayed; if present, we show "set" + the
 *     first/last 4 of the hash as a fingerprint)
 *   - subscription tier + status + period end
 *   - month-to-date usage + cost (USD), as a cheap quota indicator
 *   - Actions: data export, refund request
 *
 * All data is scoped to the org id in the URL.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import {
  featureFlags,
  getDb,
  memberships,
  organizations,
  subscriptions,
  usageRecords,
  users,
} from "@sparkflow/db";
import { RefundRequestForm } from "./refund-form";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  if (!org) notFound();

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [members, sub, usageAgg, ssoFlagRow, scimFlagRow] = await Promise.all([
    db
      .select({
        userId: memberships.userId,
        role: memberships.role,
        joinedAt: memberships.createdAt,
        email: users.email,
        displayName: users.displayName,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, id))
      .orderBy(desc(memberships.createdAt))
      .limit(500),

    db
      .select({
        tier: subscriptions.tier,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAt: subscriptions.cancelAt,
        stripeCustomerId: subscriptions.stripeCustomerId,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, id))
      .limit(1),

    db
      .select({
        records: count(usageRecords.id),
        cost: sum(usageRecords.costUsd),
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organizationId, id),
          gte(usageRecords.createdAt, monthStart),
        ),
      ),

    // SSO status signal — an org-scoped `sso:enabled` flag set by the
    // enterprise package when a connection is provisioned.
    db
      .select({ enabled: featureFlags.enabled, payload: featureFlags.payload })
      .from(featureFlags)
      .where(
        and(
          eq(featureFlags.organizationId, id),
          eq(featureFlags.key, "sso:enabled"),
        ),
      )
      .limit(1),

    // SCIM token fingerprint — stored as `scim:token-hash` feature-flag
    // payload for display only. We never store the raw token.
    db
      .select({ payload: featureFlags.payload })
      .from(featureFlags)
      .where(
        and(
          eq(featureFlags.organizationId, id),
          eq(featureFlags.key, "scim:token-hash"),
        ),
      )
      .limit(1),
  ]);

  const s = sub[0];
  const usageRow = usageAgg[0];
  const monthCost = Number(usageRow?.cost ?? 0);
  const monthRecords = Number(usageRow?.records ?? 0);

  const ssoEnabled = Boolean(ssoFlagRow[0]?.enabled);
  const ssoPayload = ssoFlagRow[0]?.payload as
    | { provider?: string; connectionId?: string }
    | null
    | undefined;

  const scimPayload = scimFlagRow[0]?.payload as
    | { hash?: string; createdAt?: string }
    | null
    | undefined;
  const scimHash = scimPayload?.hash ?? null;
  const scimFingerprint = scimHash
    ? `${scimHash.slice(0, 4)}…${scimHash.slice(-4)}`
    : null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p
            className="text-sm text-[hsl(var(--muted-foreground))]"
            dir="ltr"
          >
            {org.slug} · {org.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/api/export?orgId=${org.id}`}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
          >
            Export org data
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Members
          </div>
          <div className="mt-1 text-2xl font-semibold" dir="ltr">
            {members.length}
          </div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Subscription tier
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {s?.tier ?? "free"}
          </div>
          <div
            className="text-xs text-[hsl(var(--muted-foreground))]"
            dir="ltr"
          >
            {s?.status ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Usage MTD
          </div>
          <div className="mt-1 text-2xl font-semibold" dir="ltr">
            ${monthCost.toFixed(2)}
          </div>
          <div
            className="text-xs text-[hsl(var(--muted-foreground))]"
            dir="ltr"
          >
            {monthRecords} records
          </div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            SSO
          </div>
          <div className="mt-1 text-lg font-semibold">
            {ssoEnabled ? "Enabled" : "Disabled"}
          </div>
          <div
            className="text-xs text-[hsl(var(--muted-foreground))]"
            dir="ltr"
          >
            {ssoPayload?.provider ?? "—"}
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          SCIM
        </h2>
        {scimFingerprint ? (
          <dl className="grid grid-cols-[160px_1fr] gap-2 text-sm">
            <dt className="text-[hsl(var(--muted-foreground))]">
              Token fingerprint
            </dt>
            <dd className="font-mono text-xs" dir="ltr">
              {scimFingerprint}{" "}
              <span className="text-[hsl(var(--muted-foreground))]">
                (hash of token — raw token never stored)
              </span>
            </dd>
            <dt className="text-[hsl(var(--muted-foreground))]">
              Created
            </dt>
            <dd className="text-xs" dir="ltr">
              {scimPayload?.createdAt ?? "—"}
            </dd>
          </dl>
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            No SCIM token registered for this org.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Members ({members.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[hsl(var(--muted-foreground))]">
              <tr>
                <th className="py-1">Email</th>
                <th className="py-1">Name</th>
                <th className="py-1">Role</th>
                <th className="py-1">Joined</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.userId}
                  className="border-t border-[hsl(var(--border))]"
                >
                  <td className="py-1" dir="ltr">
                    {m.email}
                  </td>
                  <td className="py-1">{m.displayName ?? "—"}</td>
                  <td className="py-1">
                    <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px]">
                      {m.role}
                    </span>
                  </td>
                  <td className="py-1 text-xs" dir="ltr">
                    {m.joinedAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-1">
                    <Link
                      href={`/users/${m.userId}`}
                      className="text-xs text-brand-500 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-2 text-xs text-[hsl(var(--muted-foreground))]"
                  >
                    No members.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Refund request
        </h2>
        {s ? (
          <RefundRequestForm
            organizationId={org.id}
            stripeCustomerId={s.stripeCustomerId}
            stripeSubscriptionId={s.stripeSubscriptionId}
          />
        ) : (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Org has no active subscription — nothing to refund.
          </p>
        )}
      </section>
    </div>
  );
}

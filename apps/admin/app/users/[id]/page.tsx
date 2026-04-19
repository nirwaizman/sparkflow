export const dynamic = "force-dynamic";

/**
 * Admin user detail page.
 *
 * Aggregates everything support needs to triage a ticket in one place:
 *   - metadata (id, locale, created)
 *   - org memberships (+ roles)
 *   - recent activity (last 10 messages, cross-org)
 *   - spend this calendar month (USD, via `usage_records`)
 *   - active subscription for the user's default org
 *   - API keys (name + prefix, never the raw key — we only store hash)
 *   - uploaded files (count + total bytes)
 *
 * Data loads happen in parallel via `Promise.all`. Every query is
 * filtered by the target user id; no cross-tenant leaks.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, sql, sum } from "drizzle-orm";
import {
  apiKeys,
  conversations,
  files,
  getDb,
  memberships,
  messages,
  organizations,
  subscriptions,
  usageRecords,
  users,
} from "@sparkflow/db";
import { ImpersonateButton } from "./impersonate-button";

function bytesHuman(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

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

  // Month-to-date cutoff for cost aggregate.
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );

  const [
    memberRows,
    recentMessages,
    costRow,
    activeSub,
    keys,
    fileAgg,
  ] = await Promise.all([
    db
      .select({
        organizationId: memberships.organizationId,
        role: memberships.role,
        createdAt: memberships.createdAt,
        orgName: organizations.name,
        orgSlug: organizations.slug,
      })
      .from(memberships)
      .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.userId, id)),

    db
      .select({
        id: messages.id,
        createdAt: messages.createdAt,
        role: messages.role,
        conversationId: messages.conversationId,
        conversationTitle: conversations.title,
      })
      .from(messages)
      .innerJoin(
        conversations,
        eq(conversations.id, messages.conversationId),
      )
      .where(eq(conversations.userId, id))
      .orderBy(desc(messages.createdAt))
      .limit(10),

    db
      .select({ total: sum(usageRecords.costUsd) })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, id),
          gte(usageRecords.createdAt, monthStart),
        ),
      ),

    // Use the user's default org (if any) to surface an active
    // subscription — users can belong to many orgs so we pick the
    // "primary" one for this widget. Null when user has no default.
    user.defaultOrganizationId
      ? db
          .select({
            tier: subscriptions.tier,
            status: subscriptions.status,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            cancelAt: subscriptions.cancelAt,
            orgName: organizations.name,
          })
          .from(subscriptions)
          .innerJoin(
            organizations,
            eq(organizations.id, subscriptions.organizationId),
          )
          .where(eq(subscriptions.organizationId, user.defaultOrganizationId))
          .limit(1)
      : Promise.resolve([] as {
          tier: string;
          status: string;
          currentPeriodEnd: Date;
          cancelAt: Date | null;
          orgName: string;
        }[]),

    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        revokedAt: apiKeys.revokedAt,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        orgName: organizations.name,
      })
      .from(apiKeys)
      .leftJoin(organizations, eq(organizations.id, apiKeys.organizationId))
      .where(and(eq(apiKeys.userId, id), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt))
      .limit(50),

    db
      .select({
        count: count(files.id),
        totalBytes: sql<number>`coalesce(sum(${files.sizeBytes}), 0)`,
      })
      .from(files)
      .where(eq(files.userId, id)),
  ]);

  // Silence unused-import warning — `inArray` is retained for future
  // cross-org filtering variants.
  void inArray;

  const costThisMonth = Number(costRow[0]?.total ?? 0);
  const sub = activeSub[0];
  const fileCount = Number(fileAgg[0]?.count ?? 0);
  const fileBytes = Number(fileAgg[0]?.totalBytes ?? 0);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">
        {user.displayName ?? user.email}
      </h1>
      <p
        className="mb-4 text-sm text-[hsl(var(--muted-foreground))]"
        dir="ltr"
      >
        {user.email}
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <ImpersonateButton userId={user.id} email={user.email} />
        {user.defaultOrganizationId && (
          <Link
            href={`/api/export?orgId=${user.defaultOrganizationId}`}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
          >
            Export default-org data
          </Link>
        )}
      </div>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Metadata
        </h2>
        <dl className="grid grid-cols-[160px_1fr] gap-2 text-sm">
          <dt className="text-[hsl(var(--muted-foreground))]">User ID</dt>
          <dd dir="ltr">{user.id}</dd>
          <dt className="text-[hsl(var(--muted-foreground))]">Locale</dt>
          <dd>{user.locale}</dd>
          <dt className="text-[hsl(var(--muted-foreground))]">Created</dt>
          <dd dir="ltr">{user.createdAt.toISOString()}</dd>
          <dt className="text-[hsl(var(--muted-foreground))]">
            Default org
          </dt>
          <dd dir="ltr">{user.defaultOrganizationId ?? "—"}</dd>
        </dl>
      </section>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Cost this month (USD)
          </div>
          <div className="mt-1 text-2xl font-semibold" dir="ltr">
            ${costThisMonth.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Files
          </div>
          <div className="mt-1 text-2xl font-semibold" dir="ltr">
            {fileCount}
          </div>
          <div
            className="text-xs text-[hsl(var(--muted-foreground))]"
            dir="ltr"
          >
            {bytesHuman(fileBytes)} total
          </div>
        </div>
        <div className="rounded-lg border border-[hsl(var(--border))] p-4">
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Subscription (default org)
          </div>
          {sub ? (
            <>
              <div className="mt-1 text-lg font-semibold">
                {sub.tier} · {sub.status}
              </div>
              <div
                className="text-xs text-[hsl(var(--muted-foreground))]"
                dir="ltr"
              >
                {sub.orgName} · renews{" "}
                {sub.currentPeriodEnd.toISOString().slice(0, 10)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              No active subscription.
            </div>
          )}
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Memberships
        </h2>
        <ul className="space-y-1 text-sm">
          {memberRows.map((m) => (
            <li
              key={m.organizationId}
              className="flex items-center gap-2"
            >
              <Link
                href={`/orgs/${m.organizationId}`}
                className="font-medium hover:underline"
              >
                {m.orgName ?? m.organizationId}
              </Link>
              <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px]">
                {m.role}
              </span>
              <span
                className="text-xs text-[hsl(var(--muted-foreground))]"
                dir="ltr"
              >
                since {m.createdAt.toISOString().slice(0, 10)}
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

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Recent activity
        </h2>
        <ul className="space-y-1 text-sm">
          {recentMessages.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span
                className="w-40 shrink-0 text-xs text-[hsl(var(--muted-foreground))]"
                dir="ltr"
              >
                {m.createdAt.toISOString().slice(0, 19)}
              </span>
              <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px]">
                {m.role}
              </span>
              <span className="truncate">
                {m.conversationTitle ?? m.conversationId}
              </span>
            </li>
          ))}
          {recentMessages.length === 0 && (
            <li className="text-xs text-[hsl(var(--muted-foreground))]">
              No messages.
            </li>
          )}
        </ul>
      </section>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          API keys ({keys.length})
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-[hsl(var(--muted-foreground))]">
            <tr>
              <th className="py-1">Name</th>
              <th className="py-1">Org</th>
              <th className="py-1" dir="ltr">
                Prefix
              </th>
              <th className="py-1">Last used</th>
              <th className="py-1">Created</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr
                key={k.id}
                className="border-t border-[hsl(var(--border))]"
              >
                <td className="py-1">{k.name}</td>
                <td className="py-1">{k.orgName ?? "—"}</td>
                <td className="py-1 font-mono text-xs" dir="ltr">
                  {k.keyPrefix}…
                </td>
                <td className="py-1 text-xs" dir="ltr">
                  {k.lastUsedAt
                    ? k.lastUsedAt.toISOString().slice(0, 19)
                    : "—"}
                </td>
                <td className="py-1 text-xs" dir="ltr">
                  {k.createdAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-2 text-xs text-[hsl(var(--muted-foreground))]"
                >
                  No active API keys.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export const dynamic = "force-dynamic";

/**
 * Admin orgs list: org name, slug, member count, tier.
 */
import { count, desc, eq, sql } from "drizzle-orm";
import {
  getDb,
  memberships,
  organizations,
  subscriptions,
} from "@sparkflow/db";

export default async function OrgsPage() {
  const db = getDb();

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      tier: subscriptions.tier,
      status: subscriptions.status,
      memberCount: sql<number>`(select count(*) from ${memberships} where ${memberships.organizationId} = ${organizations.id})`,
    })
    .from(organizations)
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .orderBy(desc(organizations.createdAt))
    .limit(200);

  // quiet unused-import warning in case future diffs drop the aggregate
  void count;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Organizations</h1>
      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))]">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Members</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-[hsl(var(--border))]">
                <td className="px-3 py-2">{o.name}</td>
                <td className="px-3 py-2" dir="ltr">
                  {o.slug}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {Number(o.memberCount ?? 0)}
                </td>
                <td className="px-3 py-2">{o.tier ?? "free"}</td>
                <td className="px-3 py-2">{o.status ?? "—"}</td>
                <td className="px-3 py-2" dir="ltr">
                  {o.createdAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]"
                >
                  No organizations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

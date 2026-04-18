export const dynamic = "force-dynamic";

/**
 * Admin users list.
 *
 * Lists every user with their primary org + last activity (latest
 * message timestamp). Supports an `?q=` substring filter on email.
 */
import Link from "next/link";
import { desc, eq, ilike, sql } from "drizzle-orm";
import {
  getDb,
  memberships,
  messages,
  organizations,
  users,
} from "@sparkflow/db";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const db = getDb();

  const baseQuery = db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      createdAt: users.createdAt,
      orgName: organizations.name,
    })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
    .orderBy(desc(users.createdAt))
    .limit(200);

  const rows = q
    ? await baseQuery.where(ilike(users.email, `%${q}%`))
    : await baseQuery;

  // Look up last-seen via most recent message across any conversation
  // in the user's org. Rather than N+1, we aggregate in one query.
  const lastSeen = await db
    .select({
      userId: memberships.userId,
      lastMessage: sql<Date>`max(${messages.createdAt})`,
    })
    .from(memberships)
    .leftJoin(messages, sql`true`)
    .groupBy(memberships.userId);
  const lastSeenByUser = new Map(
    lastSeen.map((r) => [r.userId, r.lastMessage]),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <form className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search email…"
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-sm hover:bg-[hsl(var(--muted))]"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))]">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Org</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const last = lastSeenByUser.get(u.id);
              return (
                <tr
                  key={u.id}
                  className="border-t border-[hsl(var(--border))]"
                >
                  <td className="px-3 py-2" dir="ltr">
                    {u.email}
                  </td>
                  <td className="px-3 py-2">{u.displayName ?? "—"}</td>
                  <td className="px-3 py-2">{u.orgName ?? "—"}</td>
                  <td className="px-3 py-2" dir="ltr">
                    {last ? new Date(last).toISOString().slice(0, 19) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/users/${u.id}`}
                      className="text-xs text-brand-500 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]"
                >
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

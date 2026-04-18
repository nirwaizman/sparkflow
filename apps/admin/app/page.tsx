export const dynamic = "force-dynamic";

/**
 * Admin dashboard (Server Component).
 *
 * Simple aggregate snapshot:
 *   - total orgs
 *   - total users
 *   - messages in the last 24h
 *   - total cost in the last 30d (USD)
 */
import { count, gte, sql, sum } from "drizzle-orm";
import {
  getDb,
  messages,
  organizations,
  usageRecords,
  users,
} from "@sparkflow/db";

export default async function AdminDashboardPage() {
  const db = getDb();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [orgRow] = await db.select({ c: count() }).from(organizations);
  const [userRow] = await db.select({ c: count() }).from(users);
  const [msgRow] = await db
    .select({ c: count() })
    .from(messages)
    .where(gte(messages.createdAt, dayAgo));
  const [costRow] = await db
    .select({ total: sum(usageRecords.costUsd) })
    .from(usageRecords)
    .where(gte(usageRecords.createdAt, monthAgo));

  const cards: { label: string; value: string }[] = [
    { label: "Organizations", value: String(orgRow?.c ?? 0) },
    { label: "Users", value: String(userRow?.c ?? 0) },
    { label: "Messages (24h)", value: String(msgRow?.c ?? 0) },
    {
      label: "Cost (30d, USD)",
      value: `$${Number(costRow?.total ?? 0).toFixed(2)}`,
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
          >
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-semibold" dir="ltr">
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Silence unused-import warning for `sql` if Drizzle's narrow type ever
// requires a cast via raw SQL in a future diff.
void sql;

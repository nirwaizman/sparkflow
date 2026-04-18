export const dynamic = "force-dynamic";

/**
 * Admin usage_records viewer with simple filters.
 *
 * Filters (all optional, via query string):
 *   - ?feature=
 *   - ?provider=
 *   - ?model=
 *   - ?org= (organization slug)
 */
import { and, desc, eq, SQL } from "drizzle-orm";
import {
  getDb,
  organizations,
  usageRecords,
} from "@sparkflow/db";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{
    feature?: string;
    provider?: string;
    model?: string;
    org?: string;
  }>;
}) {
  const q = await searchParams;
  const db = getDb();

  const conds: SQL[] = [];
  if (q.feature) conds.push(eq(usageRecords.feature, q.feature));
  if (q.provider) conds.push(eq(usageRecords.provider, q.provider));
  if (q.model) conds.push(eq(usageRecords.model, q.model));

  let orgIdFilter: string | null = null;
  if (q.org) {
    const [found] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, q.org))
      .limit(1);
    if (found) {
      orgIdFilter = found.id;
      conds.push(eq(usageRecords.organizationId, found.id));
    }
  }

  const rows = await db
    .select({
      id: usageRecords.id,
      organizationId: usageRecords.organizationId,
      feature: usageRecords.feature,
      provider: usageRecords.provider,
      model: usageRecords.model,
      inputTokens: usageRecords.inputTokens,
      outputTokens: usageRecords.outputTokens,
      costUsd: usageRecords.costUsd,
      latencyMs: usageRecords.latencyMs,
      createdAt: usageRecords.createdAt,
      orgName: organizations.name,
    })
    .from(usageRecords)
    .leftJoin(organizations, eq(organizations.id, usageRecords.organizationId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(usageRecords.createdAt))
    .limit(200);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Usage records</h1>

      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <input
          name="feature"
          defaultValue={q.feature ?? ""}
          placeholder="feature"
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
        />
        <input
          name="provider"
          defaultValue={q.provider ?? ""}
          placeholder="provider"
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
        />
        <input
          name="model"
          defaultValue={q.model ?? ""}
          placeholder="model"
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
        />
        <input
          name="org"
          defaultValue={q.org ?? ""}
          placeholder="org slug"
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1"
        />
        <button
          type="submit"
          className="rounded-md border border-[hsl(var(--border))] px-2 py-1 hover:bg-[hsl(var(--muted))]"
        >
          Apply
        </button>
      </form>

      {q.org && !orgIdFilter && (
        <p className="mb-2 text-xs text-red-300">
          No org matched slug "{q.org}" — showing unfiltered results.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))]">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Org</th>
              <th className="px-3 py-2">Feature</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2" dir="ltr">Tokens (in/out)</th>
              <th className="px-3 py-2" dir="ltr">Cost (USD)</th>
              <th className="px-3 py-2" dir="ltr">Latency (ms)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[hsl(var(--border))]">
                <td className="px-3 py-2 text-xs" dir="ltr">
                  {r.createdAt.toISOString().slice(0, 19)}
                </td>
                <td className="px-3 py-2">{r.orgName ?? r.organizationId}</td>
                <td className="px-3 py-2">{r.feature}</td>
                <td className="px-3 py-2">
                  {r.provider ? `${r.provider}/` : ""}
                  {r.model ?? "—"}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {r.inputTokens} / {r.outputTokens}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {r.costUsd}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {r.latencyMs ?? "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]"
                >
                  No matching records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

/**
 * Admin feature flags console.
 *
 * Renders every flag row (global + any org-scoped rows) and lets an
 * operator toggle `enabled` / tweak `rolloutPercent`, plus create a
 * new flag by key. Writes go through the `/api/feature-flags` route
 * co-located with this page.
 */
import { asc } from "drizzle-orm";
import {
  getDb,
  featureFlags,
  organizations,
  type FeatureFlag,
} from "@sparkflow/db";
import { FeatureFlagForm, NewFlagForm } from "./forms";

export default async function FeatureFlagsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(featureFlags)
    .orderBy(asc(featureFlags.key));

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .orderBy(asc(organizations.name));

  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const typed: FeatureFlag[] = rows;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Feature flags</h1>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Create new flag
        </h2>
        <NewFlagForm orgs={orgs} />
      </section>

      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))]">
            <tr>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Enabled</th>
              <th className="px-3 py-2" dir="ltr">Rollout %</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {typed.map((f) => (
              <tr key={f.id} className="border-t border-[hsl(var(--border))]">
                <td className="px-3 py-2 font-mono text-xs">{f.key}</td>
                <td className="px-3 py-2">
                  {f.organizationId
                    ? (orgById.get(f.organizationId)?.name ?? f.organizationId)
                    : "global"}
                </td>
                <td className="px-3 py-2">{f.enabled ? "yes" : "no"}</td>
                <td className="px-3 py-2" dir="ltr">
                  {f.rolloutPercent}
                </td>
                <td className="px-3 py-2 text-xs" dir="ltr">
                  {f.updatedAt.toISOString().slice(0, 19)}
                </td>
                <td className="px-3 py-2">
                  <FeatureFlagForm
                    id={f.id}
                    enabled={f.enabled}
                    rolloutPercent={f.rolloutPercent}
                  />
                </td>
              </tr>
            ))}
            {typed.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]"
                >
                  No flags defined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

/**
 * Broadcast / announcement console.
 *
 * Announcements live in the `feature_flags` table under the key
 * `announcement:<YYYY-MM-DD>` with the message body in `payload.body`.
 * The web app's top-bar reads the most recent non-expired row and
 * renders a banner. Operators can also trigger an email fan-out via the
 * growth package; the email toggle is on the form below.
 *
 * We list existing announcements (latest first) with a toggle to
 * enable/disable them without deleting history.
 */
import { asc, desc, ilike } from "drizzle-orm";
import { getDb, featureFlags, type FeatureFlag } from "@sparkflow/db";
import { AnnouncementForm, ToggleButton } from "./forms";

export default async function AnnouncementsPage() {
  const db = getDb();
  const rows: FeatureFlag[] = await db
    .select()
    .from(featureFlags)
    .where(ilike(featureFlags.key, "announcement:%"))
    .orderBy(desc(featureFlags.createdAt))
    .limit(100);

  // `asc` retained for a potential "sort by date ascending" toggle.
  void asc;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Broadcast announcements</h1>

      <section className="mb-6 rounded-lg border border-[hsl(var(--border))] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          New announcement
        </h2>
        <AnnouncementForm />
      </section>

      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[hsl(var(--muted))]">
            <tr>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Body</th>
              <th className="px-3 py-2">Enabled</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const payload = f.payload as
                | { body?: string; emailSent?: boolean; severity?: string }
                | null;
              return (
                <tr key={f.id} className="border-t border-[hsl(var(--border))]">
                  <td className="px-3 py-2 font-mono text-xs">{f.key}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-md truncate">
                      {payload?.body ?? "—"}
                    </div>
                    <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                      {payload?.severity
                        ? `severity=${payload.severity}`
                        : "severity=info"}
                      {payload?.emailSent ? " · emailed" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">{f.enabled ? "yes" : "no"}</td>
                  <td className="px-3 py-2 text-xs" dir="ltr">
                    {f.createdAt.toISOString().slice(0, 19)}
                  </td>
                  <td className="px-3 py-2">
                    <ToggleButton id={f.id} enabled={f.enabled} />
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
                  No announcements yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

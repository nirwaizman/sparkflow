/**
 * /coming-soon — landing for features that are visible in the UI but
 * not yet wired up (Drive, Gmail, Music, Video, Meeting Notes, …).
 *
 * Server Component only dispatches the feature name from the
 * `?feature=` query param to a client island that handles the
 * "notify me" interest signal. We persist the signal in localStorage
 * for now — a real waitlist table is out of scope for this change.
 */
import { ComingSoonCard } from "./coming-soon-card";

type SearchParams = { feature?: string | string[] };

const LABELS: Record<string, string> = {
  drive: "Google Drive",
  gmail: "Gmail",
  music: "AI Music",
  video: "AI Video",
  "meeting-notes": "Meeting Notes",
  settings: "הגדרות משתמש",
  more: "כלים נוספים",
};

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const rawFeature = Array.isArray(sp.feature) ? sp.feature[0] : sp.feature;
  const key = (rawFeature ?? "").toLowerCase();
  const label = LABELS[key] ?? "יכולת זו";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
      <ComingSoonCard featureKey={key || "unknown"} featureLabel={label} />
    </div>
  );
}

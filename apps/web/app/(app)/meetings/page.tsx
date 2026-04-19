/**
 * Meetings dashboard.
 *
 * Server component. Lists past meetings for the caller's org and hands off to
 * client components for uploading + in-browser recording.
 */
import Link from "next/link";
import { requireSession } from "@sparkflow/auth";
import { listMeetings } from "@sparkflow/meetings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparkflow/ui";
import { MeetingUploader } from "@/components/meetings/uploader";
import { MeetingRecorder } from "@/components/meetings/recorder";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    uploaded: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
    processing: "bg-amber-500/10 text-amber-600",
    ready: "bg-emerald-500/10 text-emerald-600",
    failed: "bg-red-500/10 text-red-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        tone[status] ?? tone.uploaded
      }`}
    >
      {status}
    </span>
  );
}

export default async function MeetingsPage() {
  const session = await requireSession();
  const rows = await listMeetings(session.organizationId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Record or upload a meeting. We transcribe, diarize, and pull out
          action items and decisions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <MeetingRecorder />
        <MeetingUploader />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Past meetings</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Nothing yet. Record or upload an audio file to get started."
              : `${rows.length} meeting${rows.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/meetings/${row.id}`}
                    className="flex items-center justify-between gap-4 py-3 hover:bg-[hsl(var(--muted))]/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{row.title}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(row.createdAt).toLocaleString()} · {row.mime} ·{" "}
                        {formatBytes(row.sizeBytes)}
                        {row.error ? ` · ${row.error}` : ""}
                      </div>
                    </div>
                    <StatusPill status={row.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

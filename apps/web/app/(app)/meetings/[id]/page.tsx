/**
 * Meeting detail page.
 *
 * Layout: transcript on the left (scrollable, speaker-by-speaker), notes on
 * the right (summary + decisions + checkable action items). If the meeting is
 * still processing, a client-side poller keeps refreshing until it flips.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@sparkflow/auth";
import { getMeeting } from "@sparkflow/meetings";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkflow/ui";
import { ActionItemsList } from "@/components/meetings/action-items-list";
import { ProcessingPoller } from "@/components/meetings/processing-poller";

export const dynamic = "force-dynamic";

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const row = await getMeeting(id, session.organizationId);
  if (!row) notFound();

  const notes = row.notes;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/meetings"
            className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
          >
            ← Meetings
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{row.title}</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {new Date(row.createdAt).toLocaleString()} · status: {row.status}
            {notes?.language ? ` · ${notes.language}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {notes ? (
            <>
              <Button asChild variant="secondary">
                <a href={`/api/meetings/${row.id}/export?format=md`}>Export .md</a>
              </Button>
              <Button asChild variant="secondary">
                <a href={`/api/meetings/${row.id}/export?format=pdf`}>Export .pdf</a>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <ProcessingPoller meetingId={row.id} initialStatus={row.status} />

      {row.status === "failed" && row.error ? (
        <Alert>
          <AlertTitle>Processing failed</AlertTitle>
          <AlertDescription>{row.error}</AlertDescription>
        </Alert>
      ) : null}

      {row.status !== "ready" || !notes ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {row.status === "processing" || row.status === "uploaded"
                ? "Transcribing and summarising… this usually takes under a minute per 10 minutes of audio."
                : "Notes are not available for this meeting."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT: Transcript */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] space-y-4 overflow-y-auto">
              {notes.turns.length > 0 ? (
                notes.turns.map((turn, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                      {turn.speaker} · {formatTimestamp(turn.startMs)}
                    </div>
                    <p className="text-sm leading-relaxed">{turn.text}</p>
                  </div>
                ))
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {notes.transcript}
                </p>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: Notes */}
          <div className="flex flex-col gap-6">
            {notes.participants.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Participants</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {notes.participants.map((p, i) => (
                    <Badge key={i} variant="secondary">
                      {p}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {notes.topics.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Topics</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {notes.topics.map((t, i) => (
                    <Badge key={i}>{t}</Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {notes.summary}
                </p>
              </CardContent>
            </Card>

            {notes.decisions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Decisions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {notes.decisions.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium">{d.text}</span>
                        {d.rationale ? (
                          <span className="text-[hsl(var(--muted-foreground))]">
                            {" "}
                            — {d.rationale}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Action items</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionItemsList meetingId={row.id} items={notes.actionItems} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * POST /api/meetings/:id/process
 *
 * Runs the full pipeline inline:
 *   1. Download audio from Supabase Storage.
 *   2. Whisper transcription.
 *   3. Diarization (segment-based when we have timestamps, else LLM).
 *   4. LLM summary + action-item / decision extraction.
 *
 * The record is flipped to `processing` up front and to `ready`/`failed` at
 * the end so polling from the client can reflect progress. Long-running
 * processing on Vercel should run on the background queue; see the TODO below.
 *
 * TODO(meetings): move this into an Inngest-style background job once
 * `@sparkflow/tasks` gains an audio worker; inline runs are capped by the
 * Next.js route timeout.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { captureError, logger, incr } from "@sparkflow/observability";
import {
  diarizeTranscript,
  downloadMeetingAudio,
  getMeeting,
  summarizeMeeting,
  transcribeAudio,
  updateMeeting,
  type MeetingNotes,
} from "@sparkflow/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Whisper + two LLM calls can take a while for long meetings.
export const maxDuration = 300;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const row = await getMeeting(id, session.organizationId);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (row.status === "processing") {
      return NextResponse.json({ error: "already_processing" }, { status: 409 });
    }

    await updateMeeting(id, { status: "processing", error: undefined });

    try {
      const audio = await downloadMeetingAudio(row.storagePath);
      logger.info({ meetingId: id, bytes: audio.length }, "meetings.process.start");

      const transcription = await transcribeAudio({
        buffer: audio,
        mime: row.mime,
      });
      const turns = await diarizeTranscript(transcription.text, transcription.segments);
      const summary = await summarizeMeeting({
        transcript: renderTurnsForSummary(turns, transcription.text),
      });

      const durationMs =
        transcription.segments && transcription.segments.length > 0
          ? transcription.segments[transcription.segments.length - 1]!.endMs
          : undefined;

      const notes: MeetingNotes = {
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        transcript: transcription.text,
        turns,
        language: transcription.language,
        durationMs,
        summary: summary.summary,
        actionItems: summary.actionItems,
        decisions: summary.decisions,
        participants: summary.participants,
        topics: summary.topics,
      };

      await updateMeeting(id, { status: "ready", notes });
      incr("meetings.process.ok");
      return NextResponse.json({ id, status: "ready" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateMeeting(id, { status: "failed", error: msg });
      captureError(err, { route: "api/meetings/[id]/process.POST", meetingId: id });
      logger.error({ meetingId: id, err: msg }, "meetings.process.failed");
      incr("meetings.process.failed");
      return NextResponse.json({ error: "process_failed", detail: msg }, { status: 500 });
    }
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/meetings/[id]/process.POST" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

function renderTurnsForSummary(
  turns: Array<{ speaker: string; text: string }>,
  fallback: string,
): string {
  if (turns.length === 0) return fallback;
  return turns.map((t) => `${t.speaker}: ${t.text}`).join("\n\n");
}

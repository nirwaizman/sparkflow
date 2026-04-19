/**
 * Speaker diarization.
 *
 * Whisper does not do diarization. There are two paths:
 *
 *   1. "heuristic" — the transcript already contains timestamps from Whisper's
 *      verbose_json response. We don't have true speaker labels, but we can
 *      group consecutive segments into turns based on silence gaps and bucket
 *      them into alternating speakers. This is cheap and deterministic.
 *
 *   2. "llm" — no timestamps available (e.g. `gpt-4o-transcribe` returned plain
 *      text). We ask an LLM to split the transcript into speaker turns using
 *      `generateObject`. We don't know real names, so we emit "Speaker 1",
 *      "Speaker 2", etc.
 *
 * Either way the output shape is the same: `Array<{speaker, text, startMs, endMs}>`.
 */

import { z } from "zod";
import { generateObject } from "@sparkflow/llm";
import type { DiarizedTurn, TranscriptSegment } from "./types";

/** Silence longer than this between segments triggers a new speaker turn. */
const SILENCE_GAP_MS = 1500;

const llmSchema = z.object({
  turns: z
    .array(
      z.object({
        speaker: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

export async function diarizeTranscript(
  text: string,
  segments?: TranscriptSegment[],
): Promise<DiarizedTurn[]> {
  if (segments && segments.length > 0) {
    return diarizeFromSegments(segments);
  }
  return diarizeWithLlm(text);
}

/**
 * Group Whisper segments into alternating "Speaker 1 / Speaker 2" turns using
 * pause-based chunking. This is a best-effort fallback — real speaker
 * identification would need a dedicated diarization model (pyannote, etc.).
 *
 * TODO(meetings): swap for Deepgram / pyannote diarization when we wire a
 * second transcription provider.
 */
export function diarizeFromSegments(segments: TranscriptSegment[]): DiarizedTurn[] {
  if (segments.length === 0) return [];

  const turns: DiarizedTurn[] = [];
  let current: DiarizedTurn | null = null;
  let speakerIdx = 0;
  let lastEnd = segments[0]!.startMs;

  for (const seg of segments) {
    const gap = seg.startMs - lastEnd;
    if (!current || gap >= SILENCE_GAP_MS) {
      if (current) turns.push(current);
      speakerIdx = current ? (speakerIdx === 0 ? 1 : 0) : 0;
      current = {
        speaker: `Speaker ${speakerIdx + 1}`,
        text: seg.text.trim(),
        startMs: seg.startMs,
        endMs: seg.endMs,
      };
    } else {
      current.text = `${current.text} ${seg.text.trim()}`.trim();
      current.endMs = seg.endMs;
    }
    lastEnd = seg.endMs;
  }
  if (current) turns.push(current);
  return turns;
}

/**
 * Ask an LLM to split a plain transcript into speaker turns. Timestamps are
 * synthesised proportionally from character offsets because no real timing
 * is available.
 */
export async function diarizeWithLlm(text: string): Promise<DiarizedTurn[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const { object } = await generateObject({
    schema: llmSchema,
    system:
      "You segment meeting transcripts into speaker turns. When speaker names are " +
      "not explicit, label them Speaker 1, Speaker 2, etc. Preserve the original " +
      "wording — do not paraphrase. Return every word of the transcript exactly " +
      "once across all turns.",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: `Segment this transcript into speaker turns:\n\n${trimmed}`,
      },
    ],
    temperature: 0,
  });

  // Distribute timestamps proportionally across turns by character length so
  // the UI can still render a rough scrubber.
  const totalChars = object.turns.reduce((n, t) => n + t.text.length, 0) || 1;
  // Without a known duration, assume 150 wpm -> ~5 chars/sec as a placeholder.
  const approxDurationMs = Math.round((trimmed.length / 5) * 1000);

  let cursor = 0;
  return object.turns.map((t) => {
    const portion = t.text.length / totalChars;
    const endMs = cursor + Math.round(portion * approxDurationMs);
    const turn: DiarizedTurn = {
      speaker: t.speaker,
      text: t.text,
      startMs: cursor,
      endMs,
    };
    cursor = endMs;
    return turn;
  });
}

/**
 * OpenAI audio-transcription client.
 *
 * Hits `POST https://api.openai.com/v1/audio/transcriptions` directly rather
 * than routing through `@sparkflow/llm`, because the LLM package is text-only
 * (chat completions / structured output). Whisper wants a multipart body.
 *
 * Model selection:
 *   - Defaults to `whisper-1` (stable, widely available).
 *   - If `OPENAI_TRANSCRIBE_MODEL` is set we honour it; callers that know the
 *     newer `gpt-4o-transcribe` model is enabled for their org can opt in via
 *     env or the explicit `model` arg.
 */

import { optionalEnv, assertEnv } from "@sparkflow/shared";
import type { TranscriptionResult, TranscriptSegment } from "./types";

export type TranscribeArgs = {
  buffer: Buffer;
  /** MIME type of the audio blob, e.g. "audio/wav", "audio/mpeg", "audio/mp4". */
  mime: string;
  /** ISO 639-1 code; when omitted Whisper auto-detects. */
  language?: string;
  /** Override the model id (e.g. "gpt-4o-transcribe"). */
  model?: string;
  /** Optional filename hint; defaults to `audio.<ext-from-mime>`. */
  filename?: string;
};

const DEFAULT_MODEL = "whisper-1";

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("flac")) return "flac";
  return "bin";
}

type WhisperVerboseJson = {
  text: string;
  language?: string;
  segments?: Array<{
    id?: number;
    start: number;
    end: number;
    text: string;
  }>;
};

/**
 * Transcribe a single audio buffer with Whisper (or a compatible model).
 *
 * Returns `{text, segments?, language}`. `segments` is only populated when the
 * model supports `verbose_json` — `whisper-1` does, `gpt-4o-transcribe`
 * currently does not and callers fall back to plain text.
 */
export async function transcribeAudio(args: TranscribeArgs): Promise<TranscriptionResult> {
  const apiKey = assertEnv("OPENAI_API_KEY");
  const model =
    args.model ?? optionalEnv("OPENAI_TRANSCRIBE_MODEL") ?? DEFAULT_MODEL;
  const filename = args.filename ?? `audio.${extFromMime(args.mime)}`;

  // `whisper-1` understands verbose_json with timestamps; other models may
  // only accept json/text. Callers that explicitly pick a different model
  // should also pass `response_format` via env if they want non-default.
  const wantsVerbose = model === "whisper-1";

  const form = new FormData();
  // In Node 18+ the global Blob and FormData accept ArrayBuffer-backed data.
  const blob = new Blob([args.buffer], { type: args.mime });
  form.append("file", blob, filename);
  form.append("model", model);
  if (args.language) form.append("language", args.language);
  if (wantsVerbose) {
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
  } else {
    form.append("response_format", "json");
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `openai.transcribe failed: HTTP ${res.status} ${res.statusText} ${body.slice(0, 500)}`,
    );
  }

  if (wantsVerbose) {
    const data = (await res.json()) as WhisperVerboseJson;
    const segments: TranscriptSegment[] | undefined = data.segments?.map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));
    return {
      text: data.text,
      segments,
      language: data.language ?? args.language,
    };
  }

  const data = (await res.json()) as { text: string; language?: string };
  return { text: data.text, language: data.language ?? args.language };
}

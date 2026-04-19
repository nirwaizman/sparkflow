import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Transcribe an audio file URL using OpenAI Whisper. Requires
 * `OPENAI_API_KEY`; errors gracefully when missing.
 */
const parameters = z.object({
  audioUrl: z.string().url().describe("Publicly reachable audio URL"),
  language: z
    .string()
    .optional()
    .describe("Optional ISO-639-1 language hint (e.g. 'en', 'he')"),
  model: z
    .string()
    .optional()
    .describe("Whisper model name (default 'whisper-1')"),
});

type Params = z.infer<typeof parameters>;

export type TranscribeAudioResult = {
  text: string;
  language?: string;
  durationSeconds?: number;
  error?: string;
};

export const transcribeAudioTool: ToolRegistration<
  Params,
  TranscribeAudioResult
> = {
  tool: {
    name: "transcribe_audio",
    description:
      "Transcribe an audio URL to text using OpenAI Whisper. Requires OPENAI_API_KEY.",
    parameters,
    handler: async ({ audioUrl, language, model }) => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return { text: "", error: "OPENAI_API_KEY not configured" };
      }
      try {
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) {
          return { text: "", error: `failed to fetch audio: ${audioRes.status}` };
        }
        const blob = await audioRes.blob();
        const form = new FormData();
        form.append("file", blob, "audio");
        form.append("model", model ?? "whisper-1");
        if (language) form.append("language", language);
        form.append("response_format", "verbose_json");

        const res = await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { authorization: `Bearer ${key}` },
            body: form,
          },
        );
        if (!res.ok) {
          const errText = await res.text();
          return { text: "", error: `whisper: ${res.status} ${errText.slice(0, 200)}` };
        }
        const data = (await res.json()) as {
          text: string;
          language?: string;
          duration?: number;
        };
        return {
          text: data.text,
          language: data.language,
          durationSeconds: data.duration,
        };
      } catch (err) {
        return {
          text: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "content",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 5,
    allowInAutonomousMode: true,
  },
};

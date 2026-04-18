/**
 * Extract durable facts about the user from a chat transcript.
 *
 * Runs async in the background after a conversation finishes — we deliberately
 * swallow every error and return an empty list so a flaky LLM call never
 * blocks the user-facing path.
 */
import { generateObject } from "@sparkflow/llm";
import type { ChatMessage } from "@sparkflow/shared";
import { z } from "zod";
import type { MemoryScope } from "./types";

const FactSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .describe("Short snake_case key identifying the fact"),
  value: z
    .string()
    .min(1)
    .max(280)
    .describe("The fact itself, phrased as a short declarative sentence"),
  scope: z
    .enum(["session", "user", "workspace", "global"])
    .describe(
      "Where the fact applies. Prefer 'user' for personal preferences.",
    ),
});

const FactsSchema = z.object({
  facts: z.array(FactSchema).max(5),
});

export interface ExtractedFact {
  key: string;
  value: string;
  scope: MemoryScope;
}

const SYSTEM = `You extract durable, user-specific facts from conversations so an AI assistant can remember them across sessions.

Rules:
- Return at most 5 facts.
- Only include facts likely to stay true for weeks or months (preferences, goals, recurring projects, stable context).
- Skip transient statements ("I'm tired right now"), anything about the assistant, and anything unverifiable.
- Prefer scope="user" for personal preferences, "workspace" for org-wide context, "global" only for truly public facts.
- Keys are short snake_case identifiers (e.g. "preferred_language", "timezone", "current_project").
- If there are no durable facts, return an empty array.`;

function renderTranscript(transcript: ChatMessage[]): string {
  return transcript
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
}

export async function extractFacts(
  transcript: ChatMessage[],
): Promise<ExtractedFact[]> {
  if (transcript.length === 0) return [];

  try {
    const result = await generateObject({
      schema: FactsSchema,
      system: SYSTEM,
      messages: [
        {
          id: "extract-facts",
          role: "user",
          content: `Extract up to 5 durable facts from this transcript:\n\n${renderTranscript(transcript)}`,
        },
      ],
      temperature: 0,
    });
    return result.object.facts.map((f: z.infer<typeof FactSchema>) => ({
      key: f.key,
      value: f.value,
      scope: f.scope,
    }));
  } catch {
    // Background job: never throw, just log a silent no-op.
    return [];
  }
}

/**
 * Meeting-summary generation via `@sparkflow/llm`'s structured-output helper.
 *
 * We request one object with everything the UI needs:
 *   - summary       — 2-5 paragraph executive summary.
 *   - actionItems   — concrete to-dos with optional assignee/due date.
 *   - decisions     — decisions reached plus short rationale.
 *   - participants  — inferred from the transcript.
 *   - topics        — 3-8 topic tags.
 */

import { z } from "zod";
import { generateObject } from "@sparkflow/llm";
import type { MeetingSummary } from "./types";

export type SummarizeArgs = {
  transcript: string;
  /** Extra context to bias the summariser, e.g. "Weekly eng sync". */
  context?: string;
};

const schema = z.object({
  summary: z.string().min(1),
  actionItems: z.array(
    z.object({
      text: z.string().min(1),
      assignee: z.string().optional(),
      dueDate: z.string().optional(),
    }),
  ),
  decisions: z.array(
    z.object({
      text: z.string().min(1),
      rationale: z.string().optional(),
    }),
  ),
  participants: z.array(z.string().min(1)),
  topics: z.array(z.string().min(1)),
});

const SYSTEM = `You are an expert meeting-notes writer.
Given a transcript, produce a faithful structured summary.

Rules:
- The summary should be 2-5 paragraphs. Focus on outcomes, not chronology.
- Action items must be concrete ("Send revised mock to Alex by Fri"), not vague.
- Only include decisions that were actually made, not proposals that were deferred.
- Infer participants from speaker labels and name mentions. Deduplicate.
- Topics should be 3-8 short tags, lowercase, no trailing punctuation.
- Never invent facts. If something is unclear, omit it rather than guess.
`;

export async function summarizeMeeting(args: SummarizeArgs): Promise<MeetingSummary> {
  const contextBlock = args.context ? `\n\nContext: ${args.context}` : "";
  const { object } = await generateObject({
    schema,
    system: SYSTEM,
    messages: [
      {
        id: "user-1",
        role: "user",
        content: `Summarise this meeting transcript.${contextBlock}\n\nTranscript:\n${args.transcript}`,
      },
    ],
    temperature: 0.2,
    // Large transcripts: cap output so we don't stall on a 10k-word ramble.
    maxTokens: 2000,
  });
  return object;
}

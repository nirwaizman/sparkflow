/**
 * Optional LLM enrichment pass.
 *
 * Given a contact, asks the model to guess `industry` and `title` from
 * whatever identifying fields are available (name + company). Returns a
 * partial patch — callers merge it into the stored contact.
 *
 * The prompt is intentionally conservative: if confidence is low the
 * model is told to return `null`. We never overwrite an existing value
 * the user set unless `overwrite: true`.
 *
 * TODO(quality): move to `generateObject` with a zod schema once we wire
 * structured output for this task — the current path goes through plain
 * `generate` + JSON.parse to keep the dep surface small.
 */

import { generate } from "@sparkflow/llm";
import type { Contact } from "./types";

export type EnrichmentPatch = {
  industry: string | null;
  title: string | null;
};

export type EnrichOptions = {
  /** If true, fill fields even when they already have a value. Default false. */
  overwrite?: boolean;
  /** Override the LLM model (defaults to the gateway's default model). */
  model?: string;
};

const SYSTEM = [
  "You are a CRM assistant. Given a contact, infer the person's likely",
  "job title and industry from the supplied name and company.",
  "Return strict JSON of shape {\"industry\": string|null, \"title\": string|null}.",
  "Use null when you are not confident — never guess a title if you are unsure.",
].join(" ");

function buildUserPrompt(c: Contact): string {
  const lines: string[] = [];
  lines.push(`Name: ${c.name}`);
  if (c.company) lines.push(`Company: ${c.company}`);
  if (c.email) lines.push(`Email: ${c.email}`);
  if (c.title) lines.push(`Current title guess: ${c.title}`);
  if (c.industry) lines.push(`Current industry guess: ${c.industry}`);
  return lines.join("\n");
}

function parseEnrichmentJson(raw: string): EnrichmentPatch {
  // Model might wrap the object in fences or extra prose. Extract the
  // first balanced `{...}` block we find; if parsing fails, return nulls.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { industry: null, title: null };
  try {
    const obj = JSON.parse(match[0]) as {
      industry?: unknown;
      title?: unknown;
    };
    const industry =
      typeof obj.industry === "string" && obj.industry.trim().length > 0
        ? obj.industry.trim()
        : null;
    const title =
      typeof obj.title === "string" && obj.title.trim().length > 0
        ? obj.title.trim()
        : null;
    return { industry, title };
  } catch {
    return { industry: null, title: null };
  }
}

/**
 * Runs a single-shot enrichment call against the configured LLM. The
 * returned patch only contains fields the caller actually wants to
 * update — if `overwrite` is false (default), fields that already have a
 * value on the contact are dropped from the patch.
 */
export async function enrichContact(
  contact: Contact,
  opts: EnrichOptions = {},
): Promise<Partial<EnrichmentPatch>> {
  const result = await generate({
    model: opts.model,
    system: SYSTEM,
    messages: [
      {
        id: `enrich-${contact.id}`,
        role: "user",
        content: buildUserPrompt(contact),
      },
    ],
    temperature: 0.2,
    maxTokens: 200,
  });
  const parsed = parseEnrichmentJson(result.content);

  const patch: Partial<EnrichmentPatch> = {};
  if (parsed.industry !== null && (opts.overwrite || !contact.industry)) {
    patch.industry = parsed.industry;
  }
  if (parsed.title !== null && (opts.overwrite || !contact.title)) {
    patch.title = parsed.title;
  }
  return patch;
}

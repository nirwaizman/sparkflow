/**
 * POST /api/docs/generate
 *
 * Long-form markdown generation. Uses `generate()` from @sparkflow/llm
 * with a specialized long-form system prompt. Returns the markdown
 * plus a word count and a flat list of H2/H3 section headings so the
 * client can show a mini-TOC.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import { generate, defaultModel, SYSTEM_PROMPT } from "@sparkflow/llm";
import { captureError, incr, logger, withLlmTrace } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  topic: z.string().min(1).max(2000),
  outline: z.string().max(8000).optional(),
  targetLength: z.enum(["short", "medium", "long"]).optional().default("medium"),
  language: z.enum(["he", "en", "auto"]).optional().default("auto"),
});

const LONGFORM_SUFFIX = `

You are now in long-form document mode. Produce a polished markdown document that is:
- Structured with H1 title, then H2/H3 subheadings.
- Includes practical examples, concrete details, and bullet/numbered lists where helpful.
- Uses fenced code blocks when showing code or structured examples.
- Reserves a final "## References" section with numbered placeholder citations like [1], [2] that the user can fill in.
- No preamble ("Here is your document…") — start directly with the H1.`;

function lengthGuidance(level: "short" | "medium" | "long"): string {
  switch (level) {
    case "short":
      return "Target 400-700 words across 2-3 H2 sections.";
    case "long":
      return "Target 1800-2800 words across 5-8 H2 sections with H3 subsections where useful.";
    case "medium":
    default:
      return "Target 900-1400 words across 3-5 H2 sections.";
  }
}

function languageGuidance(lang: "he" | "en" | "auto"): string {
  switch (lang) {
    case "he":
      return "Write the document in Hebrew.";
    case "en":
      return "Write the document in English.";
    case "auto":
    default:
      return "Write in the same language as the user's topic.";
  }
}

function extractSections(markdown: string): string[] {
  const out: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (m && m[2]) out.push(m[2].trim());
  }
  return out;
}

function wordCount(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\-[]()!]/g, " ");
  const m = stripped.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const json = await request.json();
    const parsed = bodySchema.parse(json);

    const system =
      SYSTEM_PROMPT +
      LONGFORM_SUFFIX +
      `\n\n${lengthGuidance(parsed.targetLength)}` +
      `\n${languageGuidance(parsed.language)}`;

    const userContent = parsed.outline
      ? `Topic:\n${parsed.topic}\n\nDesired outline (follow it; expand thoughtfully):\n${parsed.outline}`
      : `Topic:\n${parsed.topic}`;

    const model = defaultModel();

    const result = await withLlmTrace(
      "docs",
      {
        model,
        input: parsed.topic,
        tags: [
          "docs",
          `length:${parsed.targetLength}`,
          `lang:${parsed.language}`,
        ],
      },
      () =>
        generate({
          model,
          system,
          messages: [
            { id: crypto.randomUUID(), role: "user", content: userContent },
          ],
          temperature: 0.6,
          maxTokens: parsed.targetLength === "long" ? 4000 : 2400,
        }),
    );

    const markdown = result.content ?? "";
    const sections = extractSections(markdown);
    const words = wordCount(markdown);

    incr("docs.generated", {
      length: parsed.targetLength,
      lang: parsed.language,
    });

    return NextResponse.json({
      markdown,
      wordCount: words,
      sections,
      meta: {
        provider: result.provider,
        model: result.model,
        usage: result.usage,
      },
    });
  } catch (err) {
    captureError(err, { route: "api/docs/generate" });
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "api.docs.generate.failed",
    );
    incr("docs.error");
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

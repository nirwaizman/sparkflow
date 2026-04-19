/**
 * POST /api/slides/generate
 *
 * Generates a structured slide deck via `generateObject` with a zod schema.
 * The deck is returned as JSON for the client to preview / edit / render.
 *
 * Auth: `requireSession` with an explicit `x-guest-mode: 1` bypass so the
 * marketing demo and smoke tests keep working without a real session.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "@sparkflow/llm";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const slideLayout = z.enum(["title", "content", "two-column", "quote", "closing"]);

export const slideDeckSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  slides: z
    .array(
      z.object({
        title: z.string(),
        bullets: z.array(z.string()),
        speakerNotes: z.string().optional(),
        layout: slideLayout,
      }),
    )
    .min(3)
    .max(30),
});

export type SlideDeck = z.infer<typeof slideDeckSchema>;

const requestSchema = z.object({
  topic: z.string().min(1),
  audience: z.string().optional(),
  tone: z.string().optional(),
  numSlides: z.number().int().min(3).max(30).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      await requireSession();
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const numSlides = parsed.numSlides ?? 8;

    const system = [
      "You are an expert presentation designer.",
      "Produce a structured slide deck that matches the provided JSON schema exactly.",
      "Rules:",
      "- The first slide MUST use layout 'title' and contain the deck title.",
      "- The last slide MUST use layout 'closing'.",
      "- Every content slide has 3–6 concise bullets (markdown allowed, no headings).",
      "- speakerNotes is 1–3 sentences when present.",
      "- Use 'quote' layout sparingly (at most one slide).",
      "- Match the requested tone and audience.",
    ].join("\n");

    const user = [
      `Topic: ${parsed.topic}`,
      parsed.audience ? `Audience: ${parsed.audience}` : undefined,
      parsed.tone ? `Tone: ${parsed.tone}` : undefined,
      `Number of slides: ${numSlides}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await generateObject({
      schema: slideDeckSchema,
      system,
      messages: [{ id: crypto.randomUUID(), role: "user", content: user }],
      temperature: 0.5,
    });

    return NextResponse.json({ deck: result.object, usage: result.usage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status) || 500
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/compliance/moderate
 *
 * Public helper — returns the OpenAI moderation verdict for a piece of
 * text. The caller does NOT need to be authenticated; moderation is
 * useful at signup / pre-auth flows too. Request budget is small (text
 * must be <= 32KB) to keep abuse surface minimal.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { moderateText } from "@sparkflow/compliance";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(1).max(32_000),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid_body" },
      { status: 400 },
    );
  }

  try {
    const result = await moderateText(parsed.text);
    return NextResponse.json(result);
  } catch (err) {
    // moderateText fails-open on its own — this catch is defence in depth.
    captureError(err, { route: "api/compliance/moderate.POST" });
    return NextResponse.json(
      { flagged: false, categories: {}, scores: {}, error: "internal_error" },
      { status: 200 },
    );
  }
}

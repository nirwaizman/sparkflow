/**
 * POST /api/collab/share
 *
 * Create a share link for a resource owned by the caller's active org.
 * The caller must be authenticated — the link itself is a read-only
 * capability handed out to third parties, but minting one is an
 * authenticated action scoped to the session's org.
 *
 * Request body:
 *   {
 *     resourceType: "conversation" | "workflow" | "artifact",
 *     resourceId:   string (uuid),
 *     visibility?:  "public" | "unlisted",           // defaults to "unlisted"
 *     expiresAt?:   string (ISO-8601) | null,
 *   }
 *
 * Response:
 *   { slug, url, link: SharedLink }
 *
 * `url` is a convenience so the UI can copy-to-clipboard without knowing
 * the share route shape. It respects `NEXT_PUBLIC_APP_URL` when set,
 * else falls back to the request's origin.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import { createShareLink } from "@sparkflow/realtime";

export const runtime = "nodejs";

const bodySchema = z.object({
  resourceType: z.enum(["conversation", "workflow", "artifact"]),
  resourceId: z.string().uuid(),
  visibility: z.enum(["public", "unlisted"]).optional(),
  expiresAt: z
    .union([z.string().datetime({ offset: true }), z.null()])
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  const expiresAt =
    parsed.expiresAt == null ? null : new Date(parsed.expiresAt);

  const link = await createShareLink({
    organizationId: session.organizationId,
    createdBy: session.user.id,
    resourceType: parsed.resourceType,
    resourceId: parsed.resourceId,
    visibility: parsed.visibility ?? "unlisted",
    expiresAt,
  });

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const url = `${origin.replace(/\/$/, "")}/share/${link.slug}`;

  return NextResponse.json({ slug: link.slug, url, link });
}

/**
 * /api/keys — manage the caller's API keys.
 *
 * GET  → list keys for the caller's active org. Returns metadata only;
 *        raw keys are never retrievable after creation.
 * POST → mint a new key. The raw `plain` value is returned exactly
 *        once; the UI must surface a "copy now, we won't show again"
 *        flow.
 *
 * All mutations go through `requireSession()` so a stolen API key
 * cannot mint more keys on the user's behalf.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireSession, logAudit } from "@sparkflow/auth";
import { getDb, apiKeys } from "@sparkflow/db";
import { generateApiKey } from "@sparkflow/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(64)).max(32).optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const db = getDb();
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, session.organizationId))
      .orderBy(desc(apiKeys.createdAt));
    return NextResponse.json({ keys: rows });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { plain, prefix, hash } = generateApiKey();

  const db = getDb();
  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId: session.organizationId,
      userId: session.user.id,
      name: parsed.data.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: parsed.data.scopes ?? [],
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
    });

  if (!row) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await logAudit(
    {
      action: "api_key.created",
      targetType: "api_key",
      targetId: row.id,
      metadata: { name: row.name, prefix: row.keyPrefix },
    },
    session,
  );

  // `plain` is the raw key — we echo it ONCE and never again. The
  // client must instruct the user to copy it immediately.
  return NextResponse.json({ key: { ...row, plain } }, { status: 201 });
}

// Guard unused imports for TS strict mode.
void and;
void isNull;

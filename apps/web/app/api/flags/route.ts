/**
 * Feature-flag admin CRUD (list / upsert).
 *
 * GET  /api/flags          — list every flag row in the system. Admin-only.
 * POST /api/flags          — create a new flag row or upsert an existing
 *                            one (matched by `(organizationId, key)` —
 *                            pass `id` to update by primary key instead).
 *
 * Authorisation: requires a session whose role is `admin` or `owner`.
 * This is stricter than the legacy admin-app route (which guards by
 * ADMIN_EMAILS at the middleware layer) so that organisation admins can
 * self-serve without being added to the ops allow-list.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { AuthError, logAudit, requireRole, requireSession } from "@sparkflow/auth";
import { getDb, featureFlags } from "@sparkflow/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(120),
  organizationId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(false),
  rolloutPercent: z.number().int().min(0).max(100).default(0),
  payload: z.unknown().optional(),
});

function toErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: "invalid_body", issues: err.issues },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "server_error" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, "admin");
    const db = getDb();
    const rows = await db
      .select()
      .from(featureFlags)
      .orderBy(asc(featureFlags.key));
    return NextResponse.json({ flags: rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, "admin");
    const body = upsertSchema.parse(await req.json());
    const db = getDb();

    // Resolve the row we want to touch. Priority: explicit id > matching
    // (orgId, key) pair > fresh insert.
    const orgId = body.organizationId ?? null;
    let existing = body.id
      ? (
          await db
            .select()
            .from(featureFlags)
            .where(eq(featureFlags.id, body.id))
            .limit(1)
        )[0]
      : undefined;

    if (!existing) {
      existing = (
        await db
          .select()
          .from(featureFlags)
          .where(
            and(
              eq(featureFlags.key, body.key),
              orgId === null
                ? isNull(featureFlags.organizationId)
                : eq(featureFlags.organizationId, orgId),
            ),
          )
          .limit(1)
      )[0];
    }

    let row;
    if (existing) {
      [row] = await db
        .update(featureFlags)
        .set({
          key: body.key,
          organizationId: orgId,
          enabled: body.enabled,
          rolloutPercent: body.rolloutPercent,
          payload: body.payload ?? null,
          updatedAt: new Date(),
        })
        .where(eq(featureFlags.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(featureFlags)
        .values({
          key: body.key,
          organizationId: orgId,
          enabled: body.enabled,
          rolloutPercent: body.rolloutPercent,
          payload: body.payload ?? null,
        })
        .returning();
    }

    if (!row) {
      return NextResponse.json({ error: "write_failed" }, { status: 500 });
    }

    await logAudit(
      {
        action: existing ? "feature_flag.update" : "feature_flag.create",
        targetType: "feature_flag",
        targetId: row.id,
        metadata: {
          key: row.key,
          enabled: row.enabled,
          rolloutPercent: row.rolloutPercent,
          scope: row.organizationId ? "org" : "global",
        },
      },
      session,
    );

    return NextResponse.json({ flag: row }, { status: existing ? 200 : 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

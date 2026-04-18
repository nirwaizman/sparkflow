/**
 * Feature-flag CRUD for the admin console.
 *
 * POST  — create a new flag row (org-scoped or global when
 *         organizationId is null).
 * PATCH — toggle `enabled` and/or adjust `rolloutPercent` by row id.
 *
 * Admin allow-listing already happened in the app middleware; this
 * route only re-verifies that *some* session is attached.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, featureFlags } from "@sparkflow/db";
import { AuthError, logAudit, requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const createSchema = z.object({
  key: z.string().min(1).max(120),
  organizationId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(false),
  rolloutPercent: z.number().int().min(0).max(100).default(0),
  payload: z.unknown().optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  payload: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json());
    const db = getDb();
    const [row] = await db
      .insert(featureFlags)
      .values({
        key: body.key,
        organizationId: body.organizationId ?? null,
        enabled: body.enabled,
        rolloutPercent: body.rolloutPercent,
        payload: body.payload ?? null,
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }
    await logAudit(
      {
        action: "feature_flag.create",
        targetType: "feature_flag",
        targetId: row.id,
        metadata: { key: row.key },
      },
      session,
    );
    return NextResponse.json({ flag: row }, { status: 201 });
  } catch (err) {
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
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = patchSchema.parse(await req.json());
    const db = getDb();
    const updates: Partial<{
      enabled: boolean;
      rolloutPercent: number;
      payload: unknown;
      updatedAt: Date;
    }> = { updatedAt: new Date() };
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.rolloutPercent !== undefined)
      updates.rolloutPercent = body.rolloutPercent;
    if (body.payload !== undefined) updates.payload = body.payload;

    const [row] = await db
      .update(featureFlags)
      .set(updates)
      .where(eq(featureFlags.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await logAudit(
      {
        action: "feature_flag.update",
        targetType: "feature_flag",
        targetId: row.id,
        metadata: {
          enabled: row.enabled,
          rolloutPercent: row.rolloutPercent,
        },
      },
      session,
    );
    return NextResponse.json({ flag: row });
  } catch (err) {
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
}

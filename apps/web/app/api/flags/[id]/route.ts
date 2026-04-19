/**
 * DELETE /api/flags/:id — admin-only removal of a flag row.
 *
 * No soft-delete: flags are cheap to recreate and a lingering row could
 * keep shipping traffic at a stale rollout. Audit log keeps the paper
 * trail.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AuthError, logAudit, requireRole, requireSession } from "@sparkflow/auth";
import { getDb, featureFlags } from "@sparkflow/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    requireRole(session, "admin");

    const { id } = await context.params;
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .delete(featureFlags)
      .where(eq(featureFlags.id, parsed.data))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await logAudit(
      {
        action: "feature_flag.delete",
        targetType: "feature_flag",
        targetId: row.id,
        metadata: {
          key: row.key,
          scope: row.organizationId ? "org" : "global",
        },
      },
      session,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

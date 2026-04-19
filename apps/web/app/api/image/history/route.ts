/**
 * GET /api/image/history
 *
 * Returns the last 50 images generated for the caller's org, with fresh
 * signed URLs. Source of truth is the `files` table filtered by
 * `mime LIKE 'image/%'`.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, like } from "drizzle-orm";
import { requireSession } from "@sparkflow/auth";
import { getDb, files } from "@sparkflow/db";
import { captureError, logger } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGES_BUCKET = "images";

async function signImagesBucket(path: string, expiresIn = 3600): Promise<string> {
  const { createClient } = await import("@supabase/supabase-js");
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Supabase env not configured");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.storage
    .from(IMAGES_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(`images.sign failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

export async function GET() {
  try {
    const session = await requireSession();
    const db = getDb();

    const rows = await db
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        sizeBytes: files.sizeBytes,
        storagePath: files.storagePath,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(
        and(
          eq(files.organizationId, session.organizationId),
          like(files.mime, "image/%"),
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(50);

    const signed = await Promise.all(
      rows.map(async (row) => {
        let url: string | null = null;
        try {
          url = await signImagesBucket(row.storagePath);
        } catch (err) {
          logger.error(
            {
              err: err instanceof Error ? err.message : String(err),
              path: row.storagePath,
            },
            "api.image.history.sign_failed",
          );
        }
        return {
          id: row.id,
          name: row.name,
          mime: row.mime,
          sizeBytes: row.sizeBytes,
          storagePath: row.storagePath,
          createdAt: row.createdAt,
          url,
        };
      }),
    );

    return NextResponse.json({ images: signed });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/image/history" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

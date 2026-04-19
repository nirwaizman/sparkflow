/**
 * POST /api/compliance/export
 *
 * Kicks off a GDPR/DSAR data export for the authenticated user inside
 * their active org. Returns `{ downloadUrl }` where `downloadUrl` is a
 * `data:` URL pointing at the generated ZIP. This keeps the endpoint
 * stateless — there is no intermediate S3 object or signed link to
 * manage. For production scale we would swap this for a signed upload +
 * expiring URL; see TODO below.
 *
 * TODO(compliance): for orgs with large history, stream the ZIP to
 * object storage (Supabase Storage) and return a short-lived signed URL
 * instead of a data URL.
 */
import { NextResponse } from "next/server";
import { AuthError, getSession, logAudit } from "@sparkflow/auth";
import { exportUserData } from "@sparkflow/compliance";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { zipBuffer, manifest } = await exportUserData(
      session.user.id,
      session.organizationId,
    );

    const base64 = zipBuffer.toString("base64");
    const downloadUrl = `data:application/zip;base64,${base64}`;

    await logAudit(
      {
        action: "compliance.export",
        targetType: "user",
        targetId: session.user.id,
        metadata: { rows: manifest.entries },
      },
      session,
    );

    return NextResponse.json({ downloadUrl, manifest });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    captureError(err, { route: "api/compliance/export.POST" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

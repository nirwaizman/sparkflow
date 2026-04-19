/**
 * GET /api/video/jobs/[id]
 *
 * Poll endpoint for async video generation. On each call we:
 *   1. Load the in-memory job record.
 *   2. If terminal (succeeded/failed), return as-is (re-signing the URL
 *      if we have a storagePath so clients get a fresh signed URL).
 *   3. Otherwise call the provider's `poll()` and persist the new state.
 *
 * TODO(ai-media-db): read/write jobs from the `media_jobs` table.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { captureError } from "@sparkflow/observability";
import { VIDEO_PROVIDERS } from "@/lib/media/providers";
import { getJob, updateJob } from "@/lib/media/jobs";
import { signMedia } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    let session: Awaited<ReturnType<typeof requireSession>>;
    try {
      session = await requireSession();
    } catch {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const job = getJob(id);
    if (!job) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (job.organizationId && job.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (job.status === "processing") {
      const provider = VIDEO_PROVIDERS.find((p) => p.id === job.providerId);
      if (!provider?.poll) {
        return NextResponse.json({
          jobId: job.id,
          status: "failed",
          error: "no_poll_for_provider",
        });
      }
      try {
        const next = await provider.poll(job.providerJobId, job.organizationId ?? undefined);
        updateJob(job.id, {
          status: next.status,
          storagePath: next.storagePath ?? job.storagePath,
          signedUrl: next.signedUrl ?? job.signedUrl,
          error: next.error,
        });
      } catch (err) {
        updateJob(job.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "poll_failed",
        });
      }
    }

    const latest = getJob(id)!;
    let signedUrl = latest.signedUrl;
    if (latest.status === "succeeded" && latest.storagePath) {
      try {
        signedUrl = await signMedia("videos", latest.storagePath);
      } catch {
        /* fall back to previously stored URL */
      }
    }
    return NextResponse.json({
      jobId: latest.id,
      status: latest.status,
      provider: latest.providerId,
      url: signedUrl ?? null,
      storagePath: latest.storagePath ?? null,
      error: latest.error ?? null,
    });
  } catch (err) {
    captureError(err, { route: "api/video/jobs/[id]" });
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

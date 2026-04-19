/**
 * POST /api/image/generate
 *
 * Calls OpenAI `gpt-image-1` and persists each returned image into the
 * Supabase Storage `images` bucket at `{org}/{uuid}.png`. Returns signed
 * URLs plus the storage path so the client can download + share.
 *
 * Honors the `x-guest-mode: 1` bypass for parity with /api/chat. Guests
 * still get generated images but they are NOT persisted to storage
 * (no org to scope them under).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";
import { withLlmTrace, incr, captureError, logger } from "@sparkflow/observability";
import { getDb, files } from "@sparkflow/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGES_BUCKET = "images";

const bodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z
    .enum(["1024x1024", "1024x1792", "1792x1024"])
    .optional()
    .default("1024x1024"),
  n: z.number().int().min(1).max(4).optional().default(1),
  style: z.enum(["vivid", "natural"]).optional(),
  quality: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

interface OpenAiImageItem {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

interface OpenAiImageResponse {
  data: OpenAiImageItem[];
}

async function callOpenAiImages(args: {
  prompt: string;
  size: string;
  n: number;
  style?: string;
  quality: string;
}): Promise<OpenAiImageResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const payload: Record<string, unknown> = {
    model: "gpt-image-1",
    prompt: args.prompt,
    size: args.size,
    n: args.n,
    quality: args.quality,
  };
  if (args.style) payload.style = args.style;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openai.images ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as OpenAiImageResponse;
}

function uuid(): string {
  return crypto.randomUUID();
}

async function uploadImagesBucket(args: {
  key: string;
  body: Buffer;
}): Promise<string> {
  // We can't reuse `uploadToStorage` directly because it pins the
  // bucket name from env. Inline the minimal client here; the helper
  // lives in lib/files/storage.ts for the `files` bucket only.
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
    .upload(args.key, args.body, { contentType: "image/png", upsert: false });
  if (error || !data) {
    throw new Error(`images.upload failed: ${error?.message ?? "unknown"}`);
  }
  return data.path;
}

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

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    let session: Awaited<ReturnType<typeof requireSession>> | null = null;
    if (!guestMode) {
      try {
        session = await requireSession();
      } catch {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const json = await request.json();
    const parsed = bodySchema.parse(json);

    const result = await withLlmTrace(
      "image",
      {
        model: "gpt-image-1",
        input: parsed.prompt,
        tags: ["image", `size:${parsed.size}`, `quality:${parsed.quality}`],
      },
      () =>
        callOpenAiImages({
          prompt: parsed.prompt,
          size: parsed.size,
          n: parsed.n,
          style: parsed.style,
          quality: parsed.quality,
        }),
    );

    const out: Array<{ url: string; storagePath: string | null; revisedPrompt?: string }> = [];

    for (const item of result.data ?? []) {
      const revisedPrompt = item.revised_prompt;

      if (item.b64_json) {
        const buffer = Buffer.from(item.b64_json, "base64");

        if (session) {
          const key = `${session.organizationId}/${uuid()}.png`;
          const storagePath = await uploadImagesBucket({ key, body: buffer });
          const signed = await signImagesBucket(storagePath);

          // Record in files table so the gallery (/api/image/history) can
          // read it back. We stash the image bucket's path as the
          // storagePath; the `mime` prefix filter in the history route
          // scopes to images only.
          try {
            const db = getDb();
            await db.insert(files).values({
              organizationId: session.organizationId,
              userId: session.user.id,
              name: `image-${new Date().toISOString()}.png`,
              mime: "image/png",
              sizeBytes: buffer.byteLength,
              storagePath,
              sha256: "", // images aren't dedup'd on sha here
              status: "ready",
            });
          } catch (err) {
            // Non-fatal: user still gets the signed URL below.
            logger.error(
              { err: err instanceof Error ? err.message : String(err) },
              "api.image.generate.files_insert_failed",
            );
          }

          out.push({ url: signed, storagePath, revisedPrompt });
        } else {
          // Guest: return an inline data URL, nothing persisted.
          out.push({
            url: `data:image/png;base64,${item.b64_json}`,
            storagePath: null,
            revisedPrompt,
          });
        }
      } else if (item.url) {
        out.push({ url: item.url, storagePath: null, revisedPrompt });
      }
    }

    incr("image.generated", { size: parsed.size, quality: parsed.quality });

    return NextResponse.json({ images: out });
  } catch (err) {
    captureError(err, { route: "api/image/generate" });
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "api.image.generate.failed",
    );
    incr("image.error");
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

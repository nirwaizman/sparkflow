/**
 * Supabase Storage helper for AI media (images/video/audio).
 *
 * Uses the service-role key so we can create buckets on demand and upload
 * binary payloads from server routes. Intentionally does NOT write to the
 * `files` drizzle table — each media route owns its own persistence model
 * (the image route uses `files`, video/music use an in-memory job store
 * until a DB-backed `media_jobs` table lands).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MediaBucket = "images" | "videos" | "audio";

export interface UploadArgs {
  bucket: MediaBucket;
  /** Path inside the bucket, e.g. `org_123/abcd.mp4` */
  key: string;
  contentType: string;
  body: Buffer | Uint8Array | Blob | ArrayBuffer;
  /** Signed URL TTL in seconds. Default 1h. */
  signExpiresIn?: number;
  /** If true (default), `ensureBucket` will be called before upload. */
  ensure?: boolean;
}

export interface UploadResult {
  path: string;
  signedUrl: string;
}

let cachedAdmin: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

/**
 * Ensure the bucket exists. Idempotent: catches "already exists" errors.
 * Buckets are kept private by default; callers get signed URLs.
 */
export async function ensureBucket(bucket: MediaBucket): Promise<void> {
  const client = getAdminClient();
  // Cheap existence check first — listBuckets is one round trip and avoids
  // noisy "bucket already exists" errors in logs.
  try {
    const { data, error } = await client.storage.listBuckets();
    if (!error && data?.some((b) => b.name === bucket)) return;
  } catch {
    // fall through to create
  }
  const { error: createErr } = await client.storage.createBucket(bucket, {
    public: false,
  });
  if (createErr) {
    const msg = createErr.message ?? "";
    // Race: another concurrent request created it. Swallow.
    if (!/exists/i.test(msg)) {
      throw new Error(`storage.createBucket(${bucket}) failed: ${msg}`);
    }
  }
}

export async function uploadMedia(args: UploadArgs): Promise<UploadResult> {
  const { bucket, key, contentType, body, signExpiresIn = 3600 } = args;
  const client = getAdminClient();

  if (args.ensure !== false) {
    await ensureBucket(bucket);
  }

  // Supabase JS expects Blob|File|ArrayBuffer. Buffer works in Node too but
  // we normalize to Uint8Array to make the types happy across runtimes.
  let payload: Blob | ArrayBuffer | Uint8Array;
  if (body instanceof Blob) payload = body;
  else if (body instanceof ArrayBuffer) payload = body;
  else if (body instanceof Uint8Array) payload = body;
  else payload = new Uint8Array(body as Buffer);

  const { data, error } = await client.storage
    .from(bucket)
    .upload(key, payload, { contentType, upsert: false });
  if (error || !data) {
    throw new Error(
      `storage.upload(${bucket}/${key}) failed: ${error?.message ?? "unknown"}`,
    );
  }

  const { data: signed, error: signErr } = await client.storage
    .from(bucket)
    .createSignedUrl(data.path, signExpiresIn);
  if (signErr || !signed) {
    throw new Error(
      `storage.sign(${bucket}/${data.path}) failed: ${signErr?.message ?? "unknown"}`,
    );
  }

  return { path: data.path, signedUrl: signed.signedUrl };
}

/**
 * Download a remote URL (e.g. a provider-hosted asset) and rehost it into
 * one of our buckets. Returns the signed URL.
 */
export async function fetchAndUpload(args: {
  bucket: MediaBucket;
  key: string;
  sourceUrl: string;
  contentType?: string;
  signExpiresIn?: number;
}): Promise<UploadResult> {
  const res = await fetch(args.sourceUrl);
  if (!res.ok) {
    throw new Error(`fetch(${args.sourceUrl}) -> ${res.status}`);
  }
  const contentType =
    args.contentType ?? res.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  return uploadMedia({
    bucket: args.bucket,
    key: args.key,
    contentType,
    body: buf,
    signExpiresIn: args.signExpiresIn,
  });
}

/** Re-sign an existing storage path. Useful for job polling endpoints. */
export async function signMedia(
  bucket: MediaBucket,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getAdminClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(`storage.sign(${bucket}/${path}) failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

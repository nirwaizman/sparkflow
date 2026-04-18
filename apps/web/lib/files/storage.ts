/**
 * Supabase Storage helper (service-role).
 *
 * Uses the service-role key so server-side ingest + download paths can
 * bypass RLS on the storage bucket. Do NOT import this file from
 * anything that bundles to the client — the key is server-only.
 *
 * Bucket name is configurable via `SUPABASE_STORAGE_BUCKET` (default
 * `files`). The bucket should already exist and be private; signed URLs
 * from `getSignedUrl()` are what we hand to clients.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertEnv, optionalEnv } from "@sparkflow/shared";

let _client: SupabaseClient | null = null;

function serviceClient(): SupabaseClient {
  if (_client) return _client;
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? assertEnv("SUPABASE_URL");
  const key = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function storageBucket(): string {
  return optionalEnv("SUPABASE_STORAGE_BUCKET") ?? "files";
}

export interface UploadArgs {
  key: string;
  contentType: string;
  body: Buffer;
}

export interface UploadResult {
  path: string;
}

export async function uploadToStorage(args: UploadArgs): Promise<UploadResult> {
  const { key, contentType, body } = args;
  const bucket = storageBucket();
  const { data, error } = await serviceClient().storage
    .from(bucket)
    .upload(key, body, {
      contentType,
      upsert: false,
    });
  if (error || !data) {
    throw new Error(`storage.upload failed: ${error?.message ?? "unknown"}`);
  }
  return { path: data.path };
}

export async function downloadFromStorage(path: string): Promise<Buffer> {
  const bucket = storageBucket();
  const { data, error } = await serviceClient().storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`storage.download failed: ${error?.message ?? "unknown"}`);
  }
  const arrayBuf = await data.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function getSignedUrl(path: string, expiresIn = 600): Promise<string> {
  const bucket = storageBucket();
  const { data, error } = await serviceClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(`storage.createSignedUrl failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

export async function deleteFromStorage(path: string): Promise<void> {
  const bucket = storageBucket();
  const { error } = await serviceClient().storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`storage.remove failed: ${error.message}`);
  }
}

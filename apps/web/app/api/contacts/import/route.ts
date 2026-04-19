/**
 * /api/contacts/import — multipart CSV upload.
 *
 * Accepts a form field `file` (preferred) or a JSON body `{csv: string}`
 * as a fallback for clients that can't send multipart. Parses the CSV
 * with @sparkflow/crm, bulk-upserts valid rows (dedup by email) and
 * returns `{created, updated, errors}` so the UI can show row-level
 * failures alongside successes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@sparkflow/auth";
import { bulkUpsertContacts, parseContactsCsv } from "@sparkflow/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB

async function readCsv(req: NextRequest): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (file && typeof file !== "string") {
      if (file.size > MAX_CSV_BYTES) return null;
      return await file.text();
    }
    return null;
  }
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { csv?: unknown } | null;
    if (!body || typeof body.csv !== "string") return null;
    if (body.csv.length > MAX_CSV_BYTES) return null;
    return body.csv;
  }
  // Plain text fallback.
  const raw = await req.text();
  if (!raw || raw.length > MAX_CSV_BYTES) return null;
  return raw;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await readCsv(req);
  if (raw === null) {
    return NextResponse.json(
      { error: "invalid_upload", message: "expected CSV file or {csv} body" },
      { status: 400 },
    );
  }

  const { rows, errors } = parseContactsCsv(raw);
  const { created, updated } = await bulkUpsertContacts({
    organizationId: session.organizationId,
    inputs: rows,
  });

  return NextResponse.json({
    created: created.length,
    updated: updated.length,
    errors,
    contacts: [...created, ...updated],
  });
}

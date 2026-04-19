/**
 * /api/contacts — list + create (and bulk upsert) contacts for the caller's active org.
 *
 * GET  → `{contacts}` filtered by `?q=...&tag=...&limit=...`.
 * POST → accepts either a single contact object or `{contacts: [...]}`
 *        for bulk upsert (dedup by email). Returns `{created, updated}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  bulkUpsertContacts,
  createContact,
  listContacts,
} from "@sparkflow/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contactInputSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  industry: z.string().max(200).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

const postSchema = z.union([
  contactInputSchema,
  z.object({ contacts: z.array(contactInputSchema).min(1).max(5_000) }),
]);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const contacts = await listContacts({
    organizationId: session.organizationId,
    q,
    tag,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if ("contacts" in parsed.data) {
    const res = await bulkUpsertContacts({
      organizationId: session.organizationId,
      inputs: parsed.data.contacts,
    });
    return NextResponse.json(res);
  }

  const contact = await createContact({
    organizationId: session.organizationId,
    input: parsed.data,
  });
  return NextResponse.json({ contact });
}

/**
 * /api/contacts/[id] — read, patch, delete a single contact (org-scoped).
 *
 * GET    → `{contact, activity}` — contact plus its stubbed timeline.
 * PATCH  → updates any of name/email/phone/company/title/industry/notes/tags.
 * DELETE → removes the contact and its activity rows.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  deleteContact,
  getContact,
  listActivity,
  updateContact,
} from "@sparkflow/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  industry: z.string().max(200).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const contact = await getContact(session.organizationId, id);
  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const activity = await listActivity(session.organizationId, id);
  return NextResponse.json({ contact, activity });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const contact = await updateContact({
    organizationId: session.organizationId,
    id,
    patch: parsed.data,
  });
  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ contact });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const ok = await deleteContact(session.organizationId, id);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * /api/contacts/enrich — batch LLM enrichment.
 *
 * Accepts `{ids: string[], overwrite?: boolean}`. For each contact the
 * caller owns in the active org, we ask the LLM to guess title/industry
 * and persist any returned fields. Returns the updated contacts.
 *
 * TODO(rate-limit): add a per-org quota. The enrichment endpoint is the
 * only CRM route that incurs LLM cost.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  enrichContact,
  getContact,
  updateContact,
  type Contact,
} from "@sparkflow/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  overwrite: z.boolean().optional(),
  model: z.string().min(1).max(100).optional(),
});

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

  const updatedContacts: Contact[] = [];
  const failures: { id: string; message: string }[] = [];
  for (const id of parsed.data.ids) {
    const existing = await getContact(session.organizationId, id);
    if (!existing) {
      failures.push({ id, message: "not_found" });
      continue;
    }
    try {
      const patch = await enrichContact(existing, {
        overwrite: parsed.data.overwrite,
        model: parsed.data.model,
      });
      if (Object.keys(patch).length === 0) {
        updatedContacts.push(existing);
        continue;
      }
      const next = await updateContact({
        organizationId: session.organizationId,
        id,
        patch,
      });
      if (next) updatedContacts.push(next);
    } catch (err) {
      failures.push({
        id,
        message: err instanceof Error ? err.message : "enrichment_failed",
      });
    }
  }

  return NextResponse.json({ contacts: updatedContacts, failures });
}

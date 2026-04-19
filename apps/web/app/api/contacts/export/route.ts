/**
 * /api/contacts/export — dumps every contact in the caller's active org
 * as a CSV download. Honours the same `?q=` / `?tag=` filters as the
 * list endpoint so users can export a filtered view.
 */
import { type NextRequest } from "next/server";
import { getSession } from "@sparkflow/auth";
import { contactsToCsv, listContacts } from "@sparkflow/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;

  const contacts = await listContacts({
    organizationId: session.organizationId,
    q,
    tag,
    limit: 100_000,
  });
  const csv = contactsToCsv(contacts);

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contacts-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}

/**
 * GET /api/meetings/:id/export?format=md|pdf
 *
 * Renders the already-processed meeting notes to Markdown or PDF.
 * Returns 409 if processing has not finished.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { captureError } from "@sparkflow/observability";
import { exportMarkdown, exportPdf, getMeeting } from "@sparkflow/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const format = (req.nextUrl.searchParams.get("format") ?? "md").toLowerCase();
    if (format !== "md" && format !== "pdf") {
      return NextResponse.json({ error: "invalid_format" }, { status: 400 });
    }

    const row = await getMeeting(id, session.organizationId);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!row.notes || row.status !== "ready") {
      return NextResponse.json({ error: "not_ready", status: row.status }, { status: 409 });
    }

    const safeTitle = row.title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "meeting";

    if (format === "md") {
      const md = exportMarkdown(row.notes);
      return new NextResponse(md, {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${safeTitle}.md"`,
        },
      });
    }

    const pdf = await exportPdf(row.notes);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeTitle}.pdf"`,
        "content-length": String(pdf.length),
      },
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/meetings/[id]/export.GET" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

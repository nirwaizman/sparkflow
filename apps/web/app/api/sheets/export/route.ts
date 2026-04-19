/**
 * POST /api/sheets/export
 *
 * Exports a `Sheet` as either xlsx (via exceljs) or csv (RFC 4180).
 * - xlsx applies per-column number formats, bolds the header row, and
 *   freezes the first row.
 * - csv handles embedded quotes, newlines, and commas correctly.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

/**
 * Client-facing shape: rows are objects keyed by column name (post-normalisation
 * from the LLM output in /api/sheets/generate). Values may be any scalar.
 */
const runtimeSheetSchema = z.object({
  title: z.string(),
  columns: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["text", "number", "currency", "date", "boolean"]),
      }),
    )
    .min(1),
  rows: z
    .array(
      z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    )
    .min(0),
});

type Sheet = z.infer<typeof runtimeSheetSchema>;

const requestSchema = z.object({
  sheet: runtimeSheetSchema,
  format: z.enum(["xlsx", "csv"]),
});

type CellValue = string | number | boolean;

/** Turn any cell value into a CSV field per RFC 4180. */
function csvField(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value);
  // Quote if the field contains a quote, comma, CR, or LF.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(sheet: Sheet): string {
  const header = sheet.columns.map((c) => csvField(c.name)).join(",");
  const lines = sheet.rows.map((row) =>
    sheet.columns
      .map((c) => csvField(row[c.name] as CellValue | undefined))
      .join(","),
  );
  // RFC 4180 uses CRLF.
  return [header, ...lines].join("\r\n") + "\r\n";
}

function excelFormatFor(type: Sheet["columns"][number]["type"]): string | undefined {
  switch (type) {
    case "currency":
      return '"$"#,##0.00';
    case "number":
      return "#,##0.##";
    case "date":
      return "yyyy-mm-dd";
    default:
      return undefined;
  }
}

async function toXlsxBuffer(sheet: Sheet): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SparkFlow AI Sheets";
  workbook.created = new Date();
  const ws = workbook.addWorksheet(sheet.title.slice(0, 31) || "Sheet1");

  ws.columns = sheet.columns.map((c) => ({
    header: c.name,
    key: c.name,
    width: Math.max(12, Math.min(40, c.name.length + 6)),
    style: {
      numFmt: excelFormatFor(c.type),
    },
  }));

  // Bold header row.
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  // Freeze the first row.
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of sheet.rows) {
    const out: Record<string, unknown> = {};
    for (const col of sheet.columns) {
      const raw = row[col.name];
      if (col.type === "date" && typeof raw === "string") {
        const d = new Date(raw);
        out[col.name] = Number.isNaN(d.getTime()) ? raw : d;
      } else {
        out[col.name] = raw ?? null;
      }
    }
    ws.addRow(out);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function safeFilename(s: string, ext: string): string {
  const base =
    s.replace(/[^\w\s-]+/g, "").replace(/\s+/g, "-").slice(0, 60) || "sheet";
  return `${base}.${ext}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    if (parsed.format === "csv") {
      const csv = toCsv(parsed.sheet);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${safeFilename(parsed.sheet.title, "csv")}"`,
          "cache-control": "no-store",
        },
      });
    }

    const buffer = await toXlsxBuffer(parsed.sheet);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${safeFilename(parsed.sheet.title, "xlsx")}"`,
        "cache-control": "no-store",
        "content-length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

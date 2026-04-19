/**
 * POST /api/sheets/generate
 *
 * Generates a structured spreadsheet (title + typed columns + rows) via
 * `generateObject` with a zod schema. The client feeds the returned JSON
 * to a grid for editing and to the export route for xlsx/csv download.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "@sparkflow/llm";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

export const columnTypeSchema = z.enum([
  "text",
  "number",
  "currency",
  "date",
  "boolean",
]);

export const sheetSchema = z.object({
  title: z.string(),
  columns: z
    .array(
      z.object({
        name: z.string(),
        type: columnTypeSchema,
      }),
    )
    .min(2)
    .max(20),
  // Rows are arrays aligned with `columns` order — this avoids OpenAI's
  // strict-mode limitation where `oneOf` / unions inside records are rejected.
  // Values come back as strings; the client parses per-column type.
  rows: z.array(z.array(z.string())).min(1).max(500),
});

export type Sheet = z.infer<typeof sheetSchema>;

const requestSchema = z.object({
  topic: z.string().min(1),
  columns: z.array(z.string()).optional(),
  rows: z.number().int().min(1).max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      await requireSession();
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const rowCount = parsed.rows ?? 25;

    const system = [
      "You are a data analyst who produces realistic structured datasets.",
      "Return data matching the provided JSON schema exactly.",
      "Rules:",
      "- `rows` is an array of arrays. Each inner array has exactly N strings, where N = columns.length, in the same column order.",
      "- For `number` / `currency` columns, put the numeric value as a string (no $ or thousand separators): e.g. '1234.5'.",
      "- For `date` columns use ISO strings 'YYYY-MM-DD'.",
      "- For `boolean` columns use the literal strings 'true' or 'false'.",
      "- Keep the data plausible; no real personal data.",
    ].join("\n");

    const columnHint =
      parsed.columns && parsed.columns.length > 0
        ? `Suggested columns (extend or rename as needed, infer sensible types): ${parsed.columns.join(", ")}`
        : "Pick 4–8 columns that fit the topic.";

    const user = [
      `Topic: ${parsed.topic}`,
      columnHint,
      `Row count: ${rowCount}`,
    ].join("\n");

    const result = await generateObject({
      schema: sheetSchema,
      system,
      messages: [{ id: crypto.randomUUID(), role: "user", content: user }],
      temperature: 0.4,
    });

    // Convert array-rows → object-rows (keyed by column name) so that
    // export + UI consumers stay unchanged.
    const raw = result.object as {
      title: string;
      columns: { name: string; type: string }[];
      rows: string[][];
    };
    const objectRows = raw.rows.map((arr) => {
      const out: Record<string, string | number | boolean> = {};
      raw.columns.forEach((col, i) => {
        const v = arr[i] ?? "";
        if (col.type === "number" || col.type === "currency") {
          const n = Number(v);
          out[col.name] = Number.isFinite(n) ? n : v;
        } else if (col.type === "boolean") {
          out[col.name] = v === "true" || v === "TRUE" || v === "1";
        } else {
          out[col.name] = v;
        }
      });
      return out;
    });

    return NextResponse.json({
      sheet: { title: raw.title, columns: raw.columns, rows: objectRows },
      usage: result.usage,
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
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status) || 500
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

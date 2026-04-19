/**
 * CSV import + export.
 *
 * Uses `papaparse` for robust parsing. We expose:
 *   - `parseContactsCsv(raw)`  → validated ContactInput[] + row-level errors
 *   - `contactsToCsv(rows)`    → string suitable for `text/csv` downloads
 *
 * Required columns: `name`. Optional: `email`, `phone`, `company`,
 * `title`, `industry`, `notes`, `tags`. Tags are comma- or
 * semicolon-separated inside the cell (e.g. `"lead;priority"`).
 */

import Papa from "papaparse";
import type { Contact, ContactInput } from "./types";

export type CsvRowError = {
  /** 1-based index matching the CSV row the user sees (header excluded). */
  row: number;
  message: string;
};

export type ParseResult = {
  rows: ContactInput[];
  errors: CsvRowError[];
};

const TAG_SPLIT_RE = /[,;]/g;

function normaliseKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(TAG_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parses a CSV string into validated contact inputs.
 *
 * Behaviour:
 *   - Unknown columns are ignored.
 *   - Rows missing `name` are recorded in `errors`, not `rows`.
 *   - Emails are checked with a simple `x@y.z` shape — full RFC-5322
 *     validation is out of scope for bulk import.
 */
export function parseContactsCsv(raw: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normaliseKey,
  });

  const rows: ContactInput[] = [];
  const errors: CsvRowError[] = [];

  for (const err of parsed.errors ?? []) {
    errors.push({
      // papaparse row is 0-based over data rows; surface 1-based to the user.
      row: (err.row ?? 0) + 1,
      message: err.message,
    });
  }

  const data = parsed.data ?? [];
  for (let i = 0; i < data.length; i += 1) {
    const rec = data[i];
    if (!rec) continue;
    const rowNum = i + 1;
    const name = (rec.name ?? "").trim();
    if (!name) {
      errors.push({ row: rowNum, message: "missing required column 'name'" });
      continue;
    }
    const email = (rec.email ?? "").trim() || undefined;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: rowNum, message: `invalid email: ${email}` });
      continue;
    }
    rows.push({
      name,
      email: email ?? null,
      phone: (rec.phone ?? "").trim() || null,
      company: (rec.company ?? "").trim() || null,
      title: (rec.title ?? "").trim() || null,
      industry: (rec.industry ?? "").trim() || null,
      notes: (rec.notes ?? "").trim() || null,
      tags: splitTags(rec.tags),
    });
  }

  return { rows, errors };
}

const EXPORT_HEADERS: ReadonlyArray<keyof Contact | "tags_joined"> = [
  "id",
  "name",
  "email",
  "phone",
  "company",
  "title",
  "industry",
  "notes",
  "tags_joined",
  "createdAt",
  "updatedAt",
];

/**
 * Serialises contacts to CSV. Tags are joined with `;` so the output is
 * round-trippable through `parseContactsCsv`.
 */
export function contactsToCsv(rows: ReadonlyArray<Contact>): string {
  const data = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    company: c.company ?? "",
    title: c.title ?? "",
    industry: c.industry ?? "",
    notes: c.notes ?? "",
    tags_joined: c.tags.join(";"),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
  return Papa.unparse(data, { columns: EXPORT_HEADERS as string[] });
}

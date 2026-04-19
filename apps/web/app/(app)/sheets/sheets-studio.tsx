"use client";

/**
 * Client-side sheets studio.
 *
 * - Form: topic, suggested columns (tag input), row count (10/50/100).
 * - Generate: POST /api/sheets/generate → local `sheet` state.
 * - Preview: HTML table with sticky header + inline cell editing.
 * - Add row / Add column buttons.
 * - "Unsaved" pill while the sheet has been edited since generation/export.
 * - Export .xlsx + .csv via POST /api/sheets/export.
 */
import {
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Input, Label } from "@sparkflow/ui";
import { downloadBlob } from "@/lib/download";

type ColumnType = "text" | "number" | "currency" | "date" | "boolean";

type Column = { name: string; type: ColumnType };
type CellValue = string | number | boolean;
type Row = Record<string, CellValue>;

type Sheet = {
  title: string;
  columns: Column[];
  rows: Row[];
};

const ROW_PRESETS = [10, 50, 100] as const;

function defaultValueFor(type: ColumnType): CellValue {
  switch (type) {
    case "number":
    case "currency":
      return 0;
    case "boolean":
      return false;
    default:
      return "";
  }
}

function formatCell(value: CellValue | undefined, type: ColumnType): string {
  if (value === undefined || value === null) return "";
  if (type === "boolean") return value ? "true" : "false";
  if (type === "currency" && typeof value === "number") {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

function parseCell(input: string, type: ColumnType): CellValue {
  switch (type) {
    case "number":
    case "currency": {
      const cleaned = input.replace(/[$,\s]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return /^(true|yes|1)$/i.test(input.trim());
    default:
      return input;
  }
}

export function SheetsStudio() {
  const [topic, setTopic] = useState("");
  const [columnTag, setColumnTag] = useState("");
  const [columnSuggestions, setColumnSuggestions] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState<(typeof ROW_PRESETS)[number]>(50);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [isGenerating, setGenerating] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Which cell is actively being edited. `column` is the column name, not index,
  // so renames to columns stay coherent.
  const [editing, setEditing] = useState<
    { row: number; column: string } | null
  >(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const canGenerate = topic.trim().length > 0 && !isGenerating;
  const canExport = sheet !== null && !isExporting;

  const addColumnTag = useCallback(() => {
    const trimmed = columnTag.trim();
    if (!trimmed) return;
    setColumnSuggestions((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed],
    );
    setColumnTag("");
  }, [columnTag]);

  const removeColumnTag = useCallback((tag: string) => {
    setColumnSuggestions((prev) => prev.filter((t) => t !== tag));
  }, []);

  const onTagKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addColumnTag();
      } else if (e.key === "Backspace" && columnTag === "") {
        setColumnSuggestions((prev) => prev.slice(0, -1));
      }
    },
    [addColumnTag, columnTag],
  );

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-guest-mode": "1",
        },
        body: JSON.stringify({
          topic,
          columns: columnSuggestions.length ? columnSuggestions : undefined,
          rows: rowCount,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Generate failed (${res.status}): ${txt}`);
      }
      const json = (await res.json()) as { sheet: Sheet };
      setSheet(json.sheet);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [topic, columnSuggestions, rowCount]);

  const exportAs = useCallback(
    async (format: "xlsx" | "csv") => {
      if (!sheet) return;
      setExporting(true);
      setError(null);
      try {
        const res = await fetch("/api/sheets/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sheet, format }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Export failed (${res.status}): ${txt}`);
        }
        const blob = await res.blob();
        const name =
          sheet.title.replace(/[^\w\s-]+/g, "").replace(/\s+/g, "-").slice(0, 60) ||
          "sheet";
        downloadBlob(blob, `${name}.${format}`);
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setExporting(false);
      }
    },
    [sheet],
  );

  const updateCell = useCallback(
    (rowIndex: number, columnName: string, rawInput: string) => {
      setSheet((s) => {
        if (!s) return s;
        const col = s.columns.find((c) => c.name === columnName);
        if (!col) return s;
        const value = parseCell(rawInput, col.type);
        const rows = s.rows.slice();
        const current = rows[rowIndex];
        if (!current) return s;
        rows[rowIndex] = { ...current, [columnName]: value };
        return { ...s, rows };
      });
      setDirty(true);
    },
    [],
  );

  const addRow = useCallback(() => {
    setSheet((s) => {
      if (!s) return s;
      const blank: Row = {};
      for (const col of s.columns) {
        blank[col.name] = defaultValueFor(col.type);
      }
      return { ...s, rows: [...s.rows, blank] };
    });
    setDirty(true);
  }, []);

  const addColumn = useCallback(() => {
    setSheet((s) => {
      if (!s) return s;
      const name = `column_${s.columns.length + 1}`;
      const columns = [...s.columns, { name, type: "text" as ColumnType }];
      const rows = s.rows.map((r) => ({ ...r, [name]: "" }));
      return { ...s, columns, rows };
    });
    setDirty(true);
  }, []);

  const columnIndex = useMemo(() => {
    const map = new Map<string, Column>();
    sheet?.columns.forEach((c) => map.set(c.name, c));
    return map;
  }, [sheet]);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sheets-topic">Topic</Label>
            <Input
              id="sheets-topic"
              placeholder="e.g. SaaS pricing benchmarks for dev tools"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sheets-cols">Suggested columns</Label>
            <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 min-h-10">
              {columnSuggestions.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeColumnTag(tag)}
                    className="text-neutral-500 hover:text-neutral-800"
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="sheets-cols"
                value={columnTag}
                onChange={(e) => setColumnTag(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={addColumnTag}
                placeholder="Add a column… (Enter or ,)"
                className="flex-1 min-w-40 bg-transparent outline-none text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rows</Label>
            <div className="flex gap-2">
              {ROW_PRESETS.map((n) => (
                <Button
                  key={n}
                  variant={rowCount === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRowCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={generate} disabled={!canGenerate}>
            {isGenerating ? "Generating…" : "Generate"}
          </Button>
          {sheet ? (
            <>
              <Button
                variant="outline"
                onClick={() => exportAs("xlsx")}
                disabled={!canExport}
              >
                Export .xlsx
              </Button>
              <Button
                variant="outline"
                onClick={() => exportAs("csv")}
                disabled={!canExport}
              >
                Export .csv
              </Button>
            </>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {sheet ? (
        <section>
          <header className="mb-3 flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{sheet.title}</h2>
              {dirty ? (
                <span
                  className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  title="You have unsaved changes."
                >
                  unsaved
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addRow}>
                + Row
              </Button>
              <Button variant="outline" size="sm" onClick={addColumn}>
                + Column
              </Button>
            </div>
          </header>
          <div className="relative max-h-[70vh] overflow-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-[hsl(var(--bg))] shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr>
                  {sheet.columns.map((col) => (
                    <th
                      key={col.name}
                      scope="col"
                      className="px-3 py-2 text-start font-semibold whitespace-nowrap"
                    >
                      <span>{col.name}</span>
                      <span className="ms-2 text-[10px] uppercase tracking-wide text-neutral-400">
                        {col.type}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="border-t border-[hsl(var(--border))]"
                  >
                    {sheet.columns.map((col) => {
                      const isEditing =
                        editing?.row === rIdx && editing?.column === col.name;
                      const value = row[col.name];
                      return (
                        <td
                          key={col.name}
                          className="px-3 py-1.5 align-top whitespace-nowrap"
                          onClick={() => {
                            if (!isEditing) {
                              setEditing({ row: rIdx, column: col.name });
                              // Focus runs after paint.
                              setTimeout(
                                () => editInputRef.current?.focus(),
                                0,
                              );
                            }
                          }}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              defaultValue={formatCell(value, col.type)}
                              className="w-full rounded border px-1.5 py-0.5 bg-[hsl(var(--bg))] text-sm"
                              onBlur={(e) => {
                                updateCell(rIdx, col.name, e.target.value);
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateCell(
                                    rIdx,
                                    col.name,
                                    (e.target as HTMLInputElement).value,
                                  );
                                  setEditing(null);
                                } else if (e.key === "Escape") {
                                  setEditing(null);
                                }
                              }}
                            />
                          ) : (
                            <span className="cursor-text">
                              {formatCell(value, col.type) || (
                                <span className="text-neutral-400">—</span>
                              )}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {sheet.rows.length} rows · {sheet.columns.length} columns
            {columnIndex.size !== sheet.columns.length ? " · duplicate column names" : ""}
          </p>
        </section>
      ) : null}
    </div>
  );
}

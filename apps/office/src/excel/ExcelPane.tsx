import * as React from "react";
/// <reference types="office-js" />
// TODO: drop the triple-slash reference above once @types/office-js is
// installed via pnpm and picked up through the normal types resolution.

import { useState } from "react";
import { callBackend } from "../lib/backend";

type ActionId = "analyze" | "formula" | "chart" | "filldown";

interface ActionState {
  busy: ActionId | null;
  message: string | null;
  error: string | null;
}

/**
 * Read the active selection's values as a 2D array. Returns an empty array if
 * nothing is selected or the range is unbounded.
 */
async function getSelectionValues(): Promise<unknown[][]> {
  return Excel.run(async (ctx) => {
    const range = ctx.workbook.getSelectedRange();
    range.load(["values", "address"]);
    await ctx.sync();
    return (range.values as unknown[][]) ?? [];
  });
}

/** Write a single formula into the active cell. */
async function writeFormulaToActiveCell(formula: string): Promise<void> {
  await Excel.run(async (ctx) => {
    const cell = ctx.workbook.getActiveCell();
    cell.formulas = [[formula]];
    await ctx.sync();
  });
}

/** Paste a 2D array of values starting at the top-left of the selection. */
async function fillSelectionWith(values: unknown[][]): Promise<void> {
  await Excel.run(async (ctx) => {
    const sel = ctx.workbook.getSelectedRange();
    sel.load(["rowIndex", "columnIndex", "worksheet"]);
    await ctx.sync();
    const sheet = sel.worksheet;
    const target = sheet.getRangeByIndexes(
      sel.rowIndex,
      sel.columnIndex,
      values.length,
      values[0]?.length ?? 1,
    );
    target.values = values;
    await ctx.sync();
  });
}

export default function ExcelPane(): React.ReactElement {
  const [state, setState] = useState<ActionState>({ busy: null, message: null, error: null });
  const [prompt, setPrompt] = useState("");

  async function run(action: ActionId): Promise<void> {
    setState({ busy: action, message: null, error: null });
    try {
      const values = await getSelectionValues();
      const res = await callBackend<{
        text?: string;
        formula?: string;
        values?: unknown[][];
        chart?: { type: string; reason: string };
      }>({
        path: `excel/${action}`,
        body: { values, prompt },
      });

      if (!res.ok) {
        setState({ busy: null, message: null, error: res.error ?? "Request failed" });
        return;
      }

      let message = "Done";
      if (action === "analyze") {
        message = res.data?.text ?? "Analysis complete";
      } else if (action === "formula" && res.data?.formula) {
        await writeFormulaToActiveCell(res.data.formula);
        message = `Inserted: ${res.data.formula}`;
      } else if (action === "chart" && res.data?.chart) {
        message = `Suggested chart: ${res.data.chart.type} — ${res.data.chart.reason}`;
      } else if (action === "filldown" && res.data?.values) {
        await fillSelectionWith(res.data.values);
        message = "Filled selection";
      }

      setState({ busy: null, message, error: null });
    } catch (err) {
      setState({
        busy: null,
        message: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const disabled = state.busy !== null;

  return (
    <section>
      <h2>Excel</h2>
      <label style={{ display: "block", marginBottom: 8 }}>
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="Describe what the formula or fill should do"
        />
      </label>
      <div style={{ display: "grid", gap: 8 }}>
        <button disabled={disabled} onClick={() => run("analyze")}>
          {state.busy === "analyze" ? "Analyzing..." : "Analyze selection"}
        </button>
        <button disabled={disabled} onClick={() => run("formula")}>
          {state.busy === "formula" ? "Generating..." : "Generate formula"}
        </button>
        <button disabled={disabled} onClick={() => run("chart")}>
          {state.busy === "chart" ? "Thinking..." : "Chart suggestion"}
        </button>
        <button disabled={disabled} onClick={() => run("filldown")}>
          {state.busy === "filldown" ? "Filling..." : "Fill down with AI"}
        </button>
      </div>
      {state.message && <p style={{ color: "#2a7" }}>{state.message}</p>}
      {state.error && <p style={{ color: "#c33" }}>{state.error}</p>}
    </section>
  );
}

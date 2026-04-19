import * as React from "react";
/// <reference types="office-js" />
// TODO: drop the triple-slash reference above once @types/office-js is
// installed via pnpm and picked up through the normal types resolution.

import { useState } from "react";
import { callBackend } from "../lib/backend";

type ActionId = "draft" | "continue" | "rewrite" | "summarize";

interface ActionState {
  busy: ActionId | null;
  message: string | null;
  error: string | null;
}

/**
 * Read the current selection text from Word, or an empty string if nothing is
 * selected. Safe to call when Word is not yet ready.
 */
async function getSelectionText(): Promise<string> {
  return Word.run(async (ctx) => {
    const range = ctx.document.getSelection();
    range.load("text");
    await ctx.sync();
    return range.text ?? "";
  });
}

/** Read the full document body text. */
async function getDocumentText(): Promise<string> {
  return Word.run(async (ctx) => {
    const body = ctx.document.body;
    body.load("text");
    await ctx.sync();
    return body.text ?? "";
  });
}

/** Insert text at the current selection / cursor. */
async function insertAtSelection(text: string): Promise<void> {
  await Word.run(async (ctx) => {
    const range = ctx.document.getSelection();
    range.insertText(text, Word.InsertLocation.replace);
    await ctx.sync();
  });
}

/** Append text at the end of the document body. */
async function appendToBody(text: string): Promise<void> {
  await Word.run(async (ctx) => {
    ctx.document.body.insertText(text, Word.InsertLocation.end);
    await ctx.sync();
  });
}

export default function WordPane(): React.ReactElement {
  const [state, setState] = useState<ActionState>({ busy: null, message: null, error: null });
  const [prompt, setPrompt] = useState("");

  async function run(action: ActionId): Promise<void> {
    setState({ busy: action, message: null, error: null });
    try {
      let payload: Record<string, unknown> = {};
      if (action === "draft") {
        payload = { prompt };
      } else if (action === "continue") {
        payload = { context: await getDocumentText() };
      } else if (action === "rewrite") {
        payload = { selection: await getSelectionText(), prompt };
      } else if (action === "summarize") {
        payload = { document: await getDocumentText() };
      }

      const res = await callBackend<{ text?: string; summary?: string }>({
        path: `word/${action}`,
        body: payload,
      });

      if (!res.ok) {
        setState({ busy: null, message: null, error: res.error ?? "Request failed" });
        return;
      }

      const text = res.data?.text ?? res.data?.summary ?? "";
      if (action === "rewrite") {
        await insertAtSelection(text);
      } else if (action === "summarize") {
        await appendToBody(`\n\nSummary:\n${text}`);
      } else {
        await insertAtSelection(text);
      }

      setState({ busy: null, message: "Done", error: null });
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
      <h2>Word</h2>
      <label style={{ display: "block", marginBottom: 8 }}>
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="What should SparkFlow write?"
        />
      </label>
      <div style={{ display: "grid", gap: 8 }}>
        <button disabled={disabled} onClick={() => run("draft")}>
          {state.busy === "draft" ? "Drafting..." : "Draft"}
        </button>
        <button disabled={disabled} onClick={() => run("continue")}>
          {state.busy === "continue" ? "Continuing..." : "Continue writing"}
        </button>
        <button disabled={disabled} onClick={() => run("rewrite")}>
          {state.busy === "rewrite" ? "Rewriting..." : "Rewrite selection"}
        </button>
        <button disabled={disabled} onClick={() => run("summarize")}>
          {state.busy === "summarize" ? "Summarizing..." : "Summarize document"}
        </button>
      </div>
      {state.message && <p style={{ color: "#2a7" }}>{state.message}</p>}
      {state.error && <p style={{ color: "#c33" }}>{state.error}</p>}
    </section>
  );
}

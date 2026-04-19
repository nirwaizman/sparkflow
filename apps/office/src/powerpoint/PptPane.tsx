import * as React from "react";
/// <reference types="office-js" />
// TODO: drop the triple-slash reference above once @types/office-js is
// installed via pnpm and picked up through the normal types resolution.

import { useState } from "react";
import { callBackend } from "../lib/backend";

type ActionId = "design" | "addSlide" | "polish";

interface ActionState {
  busy: ActionId | null;
  message: string | null;
  error: string | null;
}

/** Get the selected text from PowerPoint, if any. */
async function getSelectedText(): Promise<string> {
  return new Promise((resolve) => {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.Text, (res) => {
      if (res.status === Office.AsyncResultStatus.Succeeded && typeof res.value === "string") {
        resolve(res.value);
      } else {
        resolve("");
      }
    });
  });
}

/** Insert a new slide at the end of the deck with the given OOXML. */
async function insertSlideOoxml(ooxml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Office.context.document.setSelectedDataAsync(
      ooxml,
      { coercionType: Office.CoercionType.Ooxml },
      (res) => {
        if (res.status === Office.AsyncResultStatus.Succeeded) {
          resolve();
        } else {
          reject(new Error(res.error?.message ?? "Failed to insert slide"));
        }
      },
    );
  });
}

export default function PptPane(): React.ReactElement {
  const [state, setState] = useState<ActionState>({ busy: null, message: null, error: null });
  const [topic, setTopic] = useState("");

  async function run(action: ActionId): Promise<void> {
    setState({ busy: action, message: null, error: null });
    try {
      const selection = await getSelectedText();
      const res = await callBackend<{ text?: string; ooxml?: string; notes?: string }>({
        path: `powerpoint/${action === "addSlide" ? "add-slide" : action}`,
        body: { topic, selection },
      });

      if (!res.ok) {
        setState({ busy: null, message: null, error: res.error ?? "Request failed" });
        return;
      }

      let message = "Done";
      if (action === "addSlide" && res.data?.ooxml) {
        await insertSlideOoxml(res.data.ooxml);
        message = "Slide added";
      } else if (res.data?.text) {
        message = res.data.text;
      } else if (res.data?.notes) {
        message = res.data.notes;
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
      <h2>PowerPoint</h2>
      <label style={{ display: "block", marginBottom: 8 }}>
        Topic
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
          placeholder="Slide topic / deck angle"
        />
      </label>
      <div style={{ display: "grid", gap: 8 }}>
        <button disabled={disabled} onClick={() => run("design")}>
          {state.busy === "design" ? "Designing..." : "Design this slide"}
        </button>
        <button disabled={disabled} onClick={() => run("addSlide")}>
          {state.busy === "addSlide" ? "Adding..." : "Add slide about\u2026"}
        </button>
        <button disabled={disabled} onClick={() => run("polish")}>
          {state.busy === "polish" ? "Polishing..." : "Polish deck"}
        </button>
      </div>
      {state.message && <p style={{ color: "#2a7" }}>{state.message}</p>}
      {state.error && <p style={{ color: "#c33" }}>{state.error}</p>}
    </section>
  );
}

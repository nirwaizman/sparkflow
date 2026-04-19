// Typed message contracts used between the background service worker,
// content script, popup, options page, and side panel.

export type AskSparkFlowPayload = {
  selection: string;
  pageUrl: string;
  pageTitle?: string;
};

export type ExtensionMessage =
  | { type: "GET_SELECTION" }
  | { type: "GET_SELECTION_RESULT"; selection: string }
  | {
      type: "ASK_SPARKFLOW";
      payload: AskSparkFlowPayload;
    }
  | { type: "SIDEPANEL_READY" }
  | { type: "OPEN_SIDE_PANEL" };

export const PENDING_PROMPT_KEY = "sparkflow.pendingPrompt";

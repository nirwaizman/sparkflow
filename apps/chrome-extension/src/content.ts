// Content script: exposes the current text selection to the extension.
// The background worker and popup can request the selection via
// chrome.tabs.sendMessage({ type: "GET_SELECTION" }) and receive the answer.

import type { ExtensionMessage } from "./lib/messages";

function readSelection(): string {
  const sel = window.getSelection?.();
  if (!sel) return "";
  return sel.toString().trim();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const message = msg as ExtensionMessage;
  if (message.type === "GET_SELECTION") {
    sendResponse({
      type: "GET_SELECTION_RESULT",
      selection: readSelection(),
    } satisfies ExtensionMessage);
    return false;
  }
  return false;
});

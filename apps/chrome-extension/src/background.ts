// Service worker: registers the "Ask SparkFlow about this page" context menu,
// opens the side panel with a prefilled prompt, and relays a few messages.

import {
  PENDING_PROMPT_KEY,
  type AskSparkFlowPayload,
  type ExtensionMessage,
} from "./lib/messages";

const MENU_ID = "sparkflow.ask-about-page";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Ask SparkFlow about this page",
    contexts: ["page", "selection", "link", "image"],
  });

  // Action icon click opens the side panel on the current tab.
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch {
    // Older Chrome versions may reject — safe to ignore.
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab?.id) return;

  const selection =
    (typeof info.selectionText === "string" ? info.selectionText : "").trim();
  const pageUrl = info.pageUrl || tab.url || "";
  const pageTitle = tab.title;

  const payload: AskSparkFlowPayload = {
    selection,
    pageUrl,
    pageTitle,
  };

  // Stash prompt so the side panel can read it on open.
  await chrome.storage.session
    .set({ [PENDING_PROMPT_KEY]: payload })
    .catch(async () => {
      // Some Chrome builds require local fallback.
      await chrome.storage.local.set({ [PENDING_PROMPT_KEY]: payload });
    });

  try {
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: "sidepanel.html",
      enabled: true,
    });
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.error("[SparkFlow] failed to open side panel", err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const message = msg as ExtensionMessage;
  switch (message.type) {
    case "OPEN_SIDE_PANEL": {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        chrome.sidePanel
          .open({ tabId })
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          );
        return true;
      }
      sendResponse({ ok: false, error: "no tab id" });
      return false;
    }
    default:
      return false;
  }
});

import { useEffect, useState } from "react";
import { getSettings, type BackendSettings } from "../lib/backend";
import { PENDING_PROMPT_KEY, type AskSparkFlowPayload } from "../lib/messages";

const styles: Record<string, Record<string, string | number>> = {
  wrap: { padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: 600, margin: 0 },
  model: { fontSize: 12, color: "#475569" },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  button: {
    appearance: "none",
    border: "1px solid #e2e8f0",
    background: "white",
    color: "#0f172a",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  },
  primary: {
    appearance: "none",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "white",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  footer: { borderTop: "1px solid #e2e8f0", paddingTop: 10, fontSize: 12, color: "#475569", display: "flex", justifyContent: "space-between" },
  link: { color: "#2563eb", cursor: "pointer", background: "none", border: 0, padding: 0, fontSize: 12 },
};

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSelectionFromTab(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript<[], string>({
      target: { tabId },
      func: () => (window.getSelection?.()?.toString() ?? "").trim(),
    });
    return results[0]?.result ?? "";
  } catch {
    return "";
  }
}

export function Popup() {
  const [settings, setSettings] = useState<BackendSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch((e) => setError(String(e)));
  }, []);

  async function openSidePanelWithPrompt(
    buildPayload: (tab: chrome.tabs.Tab) => Promise<AskSparkFlowPayload>
  ) {
    setError(null);
    setBusy("Opening side panel");
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab");
      const payload = await buildPayload(tab);
      await chrome.storage.session
        .set({ [PENDING_PROMPT_KEY]: payload })
        .catch(async () => {
          await chrome.storage.local.set({ [PENDING_PROMPT_KEY]: payload });
        });
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "sidepanel.html",
        enabled: true,
      });
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  function onOpenPanel() {
    void openSidePanelWithPrompt(async (tab) => ({
      selection: "",
      pageUrl: tab.url ?? "",
      pageTitle: tab.title,
    }));
  }

  function onSummarizePage() {
    void openSidePanelWithPrompt(async (tab) => ({
      selection: `__action__:summarize`,
      pageUrl: tab.url ?? "",
      pageTitle: tab.title,
    }));
  }

  function onExplainSelection() {
    void openSidePanelWithPrompt(async (tab) => {
      const selection = tab.id ? await getSelectionFromTab(tab.id) : "";
      return {
        selection: selection || "__action__:explain_page",
        pageUrl: tab.url ?? "",
        pageTitle: tab.title,
      };
    });
  }

  function onOpenOptions() {
    void chrome.runtime.openOptionsPage();
  }

  return (
    <div style={styles.wrap as never}>
      <div style={styles.header as never}>
        <h1 style={styles.title as never}>SparkFlow</h1>
        <span style={styles.model as never} title="Current default model">
          {settings?.defaultModel ?? "…"}
        </span>
      </div>

      <div style={styles.section as never}>
        <button style={styles.primary as never} onClick={onOpenPanel} disabled={busy !== null}>
          Open chat side panel
        </button>
        <button style={styles.button as never} onClick={onSummarizePage} disabled={busy !== null}>
          Summarize this page
        </button>
        <button style={styles.button as never} onClick={onExplainSelection} disabled={busy !== null}>
          Explain selection
        </button>
      </div>

      {error ? (
        <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>
      ) : null}

      <div style={styles.footer as never}>
        <span>{busy ?? (settings?.token ? "Signed in" : "Not signed in")}</span>
        <button style={styles.link as never} onClick={onOpenOptions}>
          Settings
        </button>
      </div>
    </div>
  );
}

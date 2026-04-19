import { useEffect, useRef, useState } from "react";
import {
  chatStream,
  getSettings,
  type BackendSettings,
  type ChatMessage,
} from "../lib/backend";
import { PENDING_PROMPT_KEY, type AskSparkFlowPayload } from "../lib/messages";

const styles: Record<string, Record<string, string | number>> = {
  root: { display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid #e2e8f0",
    background: "white",
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0 },
  meta: { fontSize: 11, color: "#64748b" },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    background: "#2563eb",
    color: "white",
    padding: "8px 10px",
    borderRadius: 10,
    maxWidth: "85%",
    fontSize: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    background: "white",
    color: "#0f172a",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    maxWidth: "85%",
    fontSize: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  bubbleSystem: {
    alignSelf: "center",
    color: "#64748b",
    fontSize: 11,
    fontStyle: "italic",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    padding: 10,
    borderTop: "1px solid #e2e8f0",
    background: "white",
  },
  textarea: {
    flex: 1,
    resize: "none",
    minHeight: 44,
    maxHeight: 140,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    fontSize: 13,
    fontFamily: "inherit",
  },
  send: {
    appearance: "none",
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "white",
    borderRadius: 8,
    padding: "0 14px",
    cursor: "pointer",
    fontSize: 13,
  },
  error: {
    margin: "6px 14px",
    padding: "8px 10px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: 8,
    fontSize: 12,
  },
};

function buildPromptFromPayload(payload: AskSparkFlowPayload): string {
  const { selection, pageUrl, pageTitle } = payload;
  const header = pageTitle ? `${pageTitle} — ${pageUrl}` : pageUrl;

  if (selection === "__action__:summarize") {
    return `Please summarize the page at ${header}.`;
  }
  if (selection === "__action__:explain_page") {
    return `Please explain what's on the page at ${header}.`;
  }
  if (selection && selection.trim()) {
    return `From ${header}:\n\n"""\n${selection.trim()}\n"""\n\nWhat does this mean?`;
  }
  return `I'm on ${header}. What would you like to know?`;
}

async function readPendingPayload(): Promise<AskSparkFlowPayload | null> {
  const session = (await chrome.storage.session
    .get(PENDING_PROMPT_KEY)
    .catch(() => ({}))) as Record<string, unknown>;
  const local = (await chrome.storage.local
    .get(PENDING_PROMPT_KEY)
    .catch(() => ({}))) as Record<string, unknown>;
  const value = session[PENDING_PROMPT_KEY] ?? local[PENDING_PROMPT_KEY];
  if (!value) return null;

  await chrome.storage.session.remove(PENDING_PROMPT_KEY).catch(() => undefined);
  await chrome.storage.local.remove(PENDING_PROMPT_KEY).catch(() => undefined);
  return value as AskSparkFlowPayload;
}

export function SidePanel() {
  const [settings, setSettings] = useState<BackendSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "system",
      content: "Ask SparkFlow anything about the current page, a selection, or your work.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<{ url?: string; selection?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    void readPendingPayload().then((payload) => {
      if (!payload) return;
      const prompt = buildPromptFromPayload(payload);
      setPageContext({ url: payload.pageUrl, selection: payload.selection });
      setInput(prompt);
    });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setError(null);
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const nextHistory = [...messages.filter((m) => m.role !== "system"), userMessage];
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let acc = "";
      for await (const delta of chatStream(
        {
          messages: nextHistory,
          model: settings?.defaultModel,
          context: pageContext ?? undefined,
        },
        controller.signal
      )) {
        acc += delta;
        setMessages((prev) => {
          const next = prev.slice();
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: acc };
          }
          return next;
        });
      }
    } catch (e) {
      setError(String(e));
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          next.pop();
        }
        return next;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div style={styles.root as never}>
      <div style={styles.header as never}>
        <h1 style={styles.title as never}>SparkFlow</h1>
        <span style={styles.meta as never}>
          {settings?.defaultModel ?? "…"}
          {settings && !settings.token ? " · not signed in" : ""}
        </span>
      </div>

      <div ref={listRef} style={styles.messages as never}>
        {messages.map((m, i) => {
          const key = `${m.role}-${i}`;
          if (m.role === "system") {
            return (
              <div key={key} style={styles.bubbleSystem as never}>
                {m.content}
              </div>
            );
          }
          return (
            <div
              key={key}
              style={(m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant) as never}
            >
              {m.content || (streaming && m.role === "assistant" ? "…" : "")}
            </div>
          );
        })}
      </div>

      {error ? <div style={styles.error as never}>{error}</div> : null}

      <div style={styles.inputRow as never}>
        <textarea
          style={styles.textarea as never}
          value={input}
          placeholder="Ask SparkFlow…"
          onChange={(e: { target: { value: string } }) => setInput(e.target.value)}
          onKeyDown={(e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {streaming ? (
          <button style={styles.send as never} onClick={stop}>
            Stop
          </button>
        ) : (
          <button style={styles.send as never} onClick={() => void send()}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}

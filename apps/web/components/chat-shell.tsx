"use client";

import { FormEvent, useMemo, useState } from "react";
import { ChatMessage } from "@/components/chat-message";
import type { ChatMessage as ChatMessageType } from "@sparkflow/shared";
import { uid } from "@sparkflow/shared";

const starterPrompts = [
  "בנה לי תוכנית GTM למוצר AI שמיועד למשרדי עורכי דין.",
  "השווה את מודלי ה-AI המובילים היום והמלץ על אחד ליזם סולו.",
  "כתוב דף נחיתה פרימיום למתכנן טיולים מבוסס AI.",
  "חקור את שוק עוזרי ה-AI לכתיבת פתקים וסכם את התחרות.",
];

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessageType[]>([
    {
      id: uid("assistant"),
      role: "assistant",
      content:
        "אני מוכן. תכתוב מה אתה רוצה לחקור, לבנות, להשוות או לתכנן. במצב Web אני אחפש ואציג מקורות.",
    },
  ]);
  const [input, setInput] = useState("");
  const [forceSearch, setForceSearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [plannerReason, setPlannerReason] = useState("");
  const [provider, setProvider] = useState("demo");

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  async function submit(prompt?: string) {
    const nextText = (prompt ?? input).trim();
    if (!nextText || loading) return;

    const nextUserMessage: ChatMessageType = {
      id: uid("user"),
      role: "user",
      content: nextText,
    };
    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, forceSearch }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Request failed");

      setMessages((current) => [...current, json.message]);
      setPlannerReason(json.meta?.planner?.reasoning ?? "");
      setProvider(json.meta?.provider ?? "unknown");
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: uid("assistant"),
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-white/10 bg-slate-950/60 p-6 backdrop-blur lg:border-b-0 lg:border-l">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">SparkFlow</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">AI Workspace</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Chat, חיפוש, מחקר עמוק, סוכנים ו-workflows. כרגע בשלב WP-A1 (monorepo + סקלטון).
          </p>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-100">מצב Web</span>
            <button
              type="button"
              onClick={() => setForceSearch((v) => !v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                forceSearch ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-slate-300"
              }`}
            >
              {forceSearch ? "ON" : "OFF"}
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            כשדלוק — תמיד מושך מידע מהרשת. כבוי — ה-planner מחליט.
          </p>
          <div className="mt-4 space-y-2 text-xs text-slate-400">
            <p>Provider: {provider}</p>
            <p>Planner: {plannerReason || "ממתין לבקשה ראשונה."}</p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-medium text-slate-100">פרומפטים להתחלה</p>
          <div className="mt-3 space-y-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void submit(prompt)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-right text-sm text-slate-200 transition hover:bg-slate-900/80"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Workspace</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                צ'אט, חיפוש, ותשובות עם מקורות
              </h2>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pb-6">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {loading ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                חושב, מחפש ומסכם...
              </div>
            ) : null}
          </div>

          <form
            onSubmit={onSubmit}
            className="sticky bottom-0 mt-4 rounded-[28px] border border-white/10 bg-slate-950/70 p-3 backdrop-blur"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="בקש אסטרטגיה, מחקר, כתיבה, קוד, ניתוח, או תוכנית..."
              className="min-h-28 w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white outline-none placeholder:text-slate-500"
              dir="auto"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                טיפ: חבר את OpenAI + Tavily ב-.env.local לתשובות אמיתיות.
              </p>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "עובד..." : "שלח"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

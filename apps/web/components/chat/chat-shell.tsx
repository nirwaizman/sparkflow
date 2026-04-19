"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SourceItem } from "@sparkflow/shared";
import { useChatStream } from "@/lib/use-chat-stream";
import {
  conversationListSelector,
  useChatStore,
  type StoredMessage,
} from "@/lib/chat-store";
import { AgentSteps } from "./agent-steps";
import { CitationsPanel } from "./citations-panel";
import { Composer, type ComposerMode } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { Sidebar } from "./sidebar";
import type { UiMessage } from "./message";

type Props = {
  conversationId?: string;
};

function toUiMessage(m: {
  id: string;
  role: string;
  content: string;
}): UiMessage {
  const role: UiMessage["role"] =
    m.role === "user" || m.role === "system" ? m.role : "assistant";
  return { id: m.id, role, content: m.content };
}

export function ChatShell({ conversationId }: Props) {
  const conversations = useChatStore(useShallow(conversationListSelector));
  const createConversation = useChatStore((s) => s.createConversation);
  const setActive = useChatStore((s) => s.setActive);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const addMessage = useChatStore((s) => s.addMessage);

  // Resolve the active conversation id. `new` → create a fresh one on mount.
  const [activeId, setLocalActiveId] = useState<string | undefined>(
    conversationId && conversationId !== "new" ? conversationId : undefined,
  );

  useEffect(() => {
    if (conversationId === "new" || !conversationId) {
      // Don't eagerly create — wait until the user actually sends something.
      setLocalActiveId(undefined);
      setActive(undefined);
      return;
    }
    if (!conversations.find((c) => c.id === conversationId)) {
      // Conversation doesn't exist yet — register it so the sidebar shows it.
      createConversation({ id: conversationId });
    }
    setLocalActiveId(conversationId);
    setActive(conversationId);
  }, [conversationId, conversations, createConversation, setActive]);

  const [mode, setMode] = useState<ComposerMode>("auto");
  const [model, setModel] = useState<string>("gpt-4o-mini");
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [panelSources, setPanelSources] = useState<SourceItem[]>([]);

  const activeConversation = useMemo(
    () => (activeId ? conversations.find((c) => c.id === activeId) : undefined),
    [activeId, conversations],
  );

  const initialMessages = useMemo(
    () =>
      activeConversation?.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })) ?? [],
    [activeConversation],
  );

  const {
    messages,
    input,
    setInput,
    send,
    stop,
    reload,
    status,
    planner,
    sources,
    setMessages,
  } = useChatStream({
    conversationId: activeId,
    initialMessages,
  });

  const streaming = status === "streaming";

  // Ensure a conversation exists before persisting the first message.
  function ensureConversation(firstPromptTitle: string): string {
    if (activeId) return activeId;
    const id = createConversation({
      title: firstPromptTitle.slice(0, 48) || "שיחה חדשה",
    });
    setLocalActiveId(id);
    setActive(id);
    if (typeof window !== "undefined") {
      // Soft navigation: keep URL in sync without a full reload.
      window.history.replaceState(null, "", `/chat/${id}`);
    }
    return id;
  }

  function onSend() {
    const text = input.trim();
    if (!text || streaming) return;
    const id = ensureConversation(text);
    const userMessage: StoredMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      sentAt: new Date().toISOString(),
    };
    addMessage(id, userMessage);
    if (!activeConversation || activeConversation.messages.length === 0) {
      renameConversation(id, text.slice(0, 48));
    }
    send(text);
    setInput("");
  }

  function onPick(prompt: string) {
    setInput(prompt);
  }

  function onRegenerate() {
    if (!messages.length) return;
    reload();
  }

  function onEditUserMessage(messageId: string, newContent: string) {
    // Trim history up to (and replacing) the edited user message, then re-send.
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const nextMessages = messages
      .slice(0, idx)
      .map((m) => ({ ...m }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setMessages as any)(nextMessages);
    send(newContent);
  }

  function showSources(list: SourceItem[]) {
    setPanelSources(list);
    setCitationsOpen(true);
  }

  // Surface the latest streamed sources on the assistant's turn.
  useEffect(() => {
    if (sources.length) {
      setPanelSources(sources);
    }
  }, [sources]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uiMessages: UiMessage[] = (messages as any[]).map(toUiMessage);
  // Attach current planner mode as a badge on the last assistant message.
  const last = uiMessages.length > 0 ? uiMessages[uiMessages.length - 1] : undefined;
  if (last && last.role === "assistant") {
    if (!last.mode) last.mode = planner.mode;
    if (sources.length && !last.sources) last.sources = sources;
  }

  const showEmpty = uiMessages.length === 0;

  return (
    <div className="grid h-full min-h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-[280px_1fr]">
      <div className="hidden lg:block">
        <Sidebar activeId={activeId} onPickStarter={onPick} />
      </div>
      <main className="flex h-full min-h-[calc(100vh-3.5rem)] flex-col">
        <div className="border-b border-[hsl(var(--border))] px-4 py-2">
          <AgentSteps
            planner={planner}
            tools={streaming ? ["search_web"] : []}
            streaming={streaming}
          />
        </div>
        {showEmpty ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState onPick={onPick} />
          </div>
        ) : (
          <MessageList
            messages={uiMessages}
            streaming={streaming}
            onRegenerate={onRegenerate}
            onEditUserMessage={onEditUserMessage}
            onShowSources={showSources}
          />
        )}
        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--bg))] p-3 sm:p-4">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={onSend}
            onStop={stop}
            streaming={streaming}
            mode={mode}
            onModeChange={setMode}
            model={model}
            onModelChange={setModel}
          />
        </div>
      </main>
      <CitationsPanel
        open={citationsOpen}
        onOpenChange={setCitationsOpen}
        sources={panelSources}
      />
    </div>
  );
}

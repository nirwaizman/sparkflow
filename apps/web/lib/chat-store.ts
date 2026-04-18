"use client";

/**
 * Client-side conversation store.
 *
 * Holds conversations in-memory + persisted to localStorage via Zustand
 * `persist` middleware. Once the server-side DB wiring lands (WP-B3), this
 * module will swap to fetch/hydrate from the backend — the public API stays
 * the same so consumers (sidebar, chat shell) don't change.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { ChatMessage, PlannerMode, SourceItem } from "@sparkflow/shared";

export type StoredMessage = ChatMessage & {
  /** Planner reasoning surfaced in the agent-steps timeline. */
  plannerReason?: string;
  /** Tools the planner decided to run (search_web, etc). */
  plannerTools?: string[];
  /** ISO timestamp; we keep a separate field so nanoid ids remain stable. */
  sentAt?: string;
};

export type Conversation = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
  /** Last planner mode seen for this conversation — used for the sidebar tag. */
  lastMode?: PlannerMode;
};

type ChatState = {
  conversations: Record<string, Conversation>;
  activeId?: string;
  createConversation: (initial?: Partial<Conversation>) => string;
  setActive: (id: string | undefined) => void;
  renameConversation: (id: string, title: string) => void;
  pinConversation: (id: string, pinned: boolean) => void;
  deleteConversation: (id: string) => void;
  addMessage: (
    conversationId: string,
    message: StoredMessage,
  ) => void;
  replaceMessages: (
    conversationId: string,
    messages: StoredMessage[],
  ) => void;
  attachSources: (
    conversationId: string,
    messageId: string,
    sources: SourceItem[],
  ) => void;
};

function nowIso(): string {
  return new Date().toISOString();
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      conversations: {},
      activeId: undefined,
      createConversation: (initial) => {
        const id = initial?.id ?? nanoid();
        const conversation: Conversation = {
          id,
          title: initial?.title ?? "שיחה חדשה",
          pinned: initial?.pinned ?? false,
          createdAt: initial?.createdAt ?? nowIso(),
          updatedAt: initial?.updatedAt ?? nowIso(),
          messages: initial?.messages ?? [],
          lastMode: initial?.lastMode,
        };
        set((state) => ({
          conversations: { ...state.conversations, [id]: conversation },
          activeId: id,
        }));
        return id;
      },
      setActive: (id) => set({ activeId: id }),
      renameConversation: (id, title) =>
        set((state) => {
          const existing = state.conversations[id];
          if (!existing) return state;
          return {
            conversations: {
              ...state.conversations,
              [id]: { ...existing, title, updatedAt: nowIso() },
            },
          };
        }),
      pinConversation: (id, pinned) =>
        set((state) => {
          const existing = state.conversations[id];
          if (!existing) return state;
          return {
            conversations: {
              ...state.conversations,
              [id]: { ...existing, pinned },
            },
          };
        }),
      deleteConversation: (id) =>
        set((state) => {
          const next = { ...state.conversations };
          delete next[id];
          return {
            conversations: next,
            activeId: state.activeId === id ? undefined : state.activeId,
          };
        }),
      addMessage: (conversationId, message) =>
        set((state) => {
          const existing = state.conversations[conversationId];
          if (!existing) return state;
          return {
            conversations: {
              ...state.conversations,
              [conversationId]: {
                ...existing,
                messages: [...existing.messages, message],
                updatedAt: nowIso(),
                lastMode: message.mode ?? existing.lastMode,
              },
            },
          };
        }),
      replaceMessages: (conversationId, messages) =>
        set((state) => {
          const existing = state.conversations[conversationId];
          if (!existing) return state;
          return {
            conversations: {
              ...state.conversations,
              [conversationId]: {
                ...existing,
                messages,
                updatedAt: nowIso(),
              },
            },
          };
        }),
      attachSources: (conversationId, messageId, sources) =>
        set((state) => {
          const existing = state.conversations[conversationId];
          if (!existing) return state;
          const messages = existing.messages.map((m) =>
            m.id === messageId ? { ...m, sources } : m,
          );
          return {
            conversations: {
              ...state.conversations,
              [conversationId]: { ...existing, messages },
            },
          };
        }),
    }),
    {
      name: "sparkflow-chat-store-v1",
      // Only persist the two fields we actually need across reloads; avoid
      // persisting transient state (e.g. activeId during migrations).
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
      }),
    },
  ),
);

export function conversationListSelector(state: ChatState): Conversation[] {
  return Object.values(state.conversations).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

"use client";

/**
 * Thin wrapper around `@ai-sdk/react`'s `useChat` that points at our
 * streaming endpoint and surfaces SparkFlow-specific metadata (planner
 * decision + sources) from response headers.
 *
 * TODO(D2-followup): once the server encodes sources as data-stream
 * annotations, drop the header-based channel in favour of `data` so the
 * panel can populate while the answer is still streaming.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { PlannerMode, SourceItem } from "@sparkflow/shared";

export type PlannerMeta = {
  mode: PlannerMode;
  reason: string;
  confidence: number;
  complexity: "low" | "medium" | "high";
};

type Options = {
  conversationId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
  }>;
};

const DEFAULT_PLANNER: PlannerMeta = {
  mode: "chat",
  reason: "waiting for first request",
  confidence: 0,
  complexity: "low",
};

export function useChatStream(options: Options = {}) {
  const [planner, setPlanner] = useState<PlannerMeta>(DEFAULT_PLANNER);
  const [sources, setSources] = useState<SourceItem[]>([]);

  // Pin the useChat `id` once per hook mount. `useChat` keys its SWR cache by
  // this id; if it flips from `undefined` → a real conversation id mid-stream
  // (which happens when a brand-new chat assigns its id after the first send),
  // SWR switches cache buckets and the in-flight assistant tokens keep writing
  // to the old bucket — so the UI shows the user turn but never the reply.
  // The caller's `conversationId` is still honoured for cache partitioning at
  // first mount; subsequent changes are ignored to keep the stream attached.
  const stableIdRef = useRef<string | undefined>(options.conversationId);
  const stableId = stableIdRef.current;

  const chat = useChat({
    api: "/api/chat/stream",
    id: stableId,
    initialMessages: options.initialMessages,
    onResponse: (response: Response) => {
      const mode = (response.headers.get("x-planner-mode") ??
        "chat") as PlannerMode;
      const reason = decodeURIComponent(
        response.headers.get("x-planner-reason") ?? "",
      );
      const confidence = Number(
        response.headers.get("x-planner-confidence") ?? "0",
      );
      const complexity =
        (response.headers.get("x-planner-complexity") as PlannerMeta["complexity"]) ??
        "low";
      setPlanner({ mode, reason, confidence, complexity });

      const rawSources = response.headers.get("x-sources");
      if (rawSources) {
        try {
          const parsed = JSON.parse(
            decodeURIComponent(rawSources),
          ) as SourceItem[];
          setSources(parsed);
        } catch {
          setSources([]);
        }
      } else {
        setSources([]);
      }
    },
  });

  const send = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      chat.append({ role: "user", content: text });
    },
    [chat],
  );

  const status = useMemo<
    "idle" | "streaming" | "error"
  >(() => {
    if (chat.error) return "error";
    if (chat.isLoading) return "streaming";
    return "idle";
  }, [chat.error, chat.isLoading]);

  return {
    messages: chat.messages,
    input: chat.input,
    setInput: chat.setInput,
    handleInputChange: chat.handleInputChange,
    handleSubmit: chat.handleSubmit,
    send,
    stop: chat.stop,
    reload: chat.reload,
    status,
    error: chat.error,
    planner,
    sources,
    setMessages: chat.setMessages,
  };
}

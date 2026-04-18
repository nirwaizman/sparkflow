"use client";

import { useEffect, useRef } from "react";
import type { SourceItem } from "@sparkflow/shared";
import { Message, type UiMessage } from "./message";

type Props = {
  messages: UiMessage[];
  streaming?: boolean;
  onRegenerate?: () => void;
  onEditUserMessage?: (id: string, newContent: string) => void;
  onShowSources?: (sources: SourceItem[]) => void;
};

export function MessageList({
  messages,
  streaming,
  onRegenerate,
  onEditUserMessage,
  onShowSources,
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);

  // Track whether the user has scrolled up — if so, don't yank them back.
  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    if (pinnedToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, streaming]);

  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-6 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {messages.map((message, idx) => (
          <Message
            key={message.id}
            message={message}
            isLast={idx === messages.length - 1}
            streaming={streaming && idx === messages.length - 1}
            onRegenerate={onRegenerate}
            onEditUserMessage={onEditUserMessage}
            onShowSources={onShowSources}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

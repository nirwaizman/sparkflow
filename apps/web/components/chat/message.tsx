"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Avatar, Badge, Button, Textarea } from "@sparkflow/ui";
import type { SourceItem } from "@sparkflow/shared";
import { Markdown } from "./markdown";
import { CopyButton } from "./copy-button";
import { RegenerateButton } from "./regenerate-button";

export type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: string;
  sources?: SourceItem[];
};

type Props = {
  message: UiMessage;
  isLast: boolean;
  streaming?: boolean;
  onRegenerate?: () => void;
  onEditUserMessage?: (id: string, newContent: string) => void;
  onShowSources?: (sources: SourceItem[]) => void;
};

export function Message({
  message,
  isLast,
  streaming,
  onRegenerate,
  onEditUserMessage,
  onShowSources,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === "user";

  function saveEdit() {
    if (onEditUserMessage && draft.trim().length) {
      onEditUserMessage(message.id, draft.trim());
    }
    setEditing(false);
  }

  if (isUser) {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span>You</span>
        </div>
        {editing ? (
          <div className="w-full max-w-2xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              dir="auto"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={saveEdit}>
                <Check className="h-3.5 w-3.5" /> Save & resend
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative max-w-2xl rounded-2xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm text-[hsl(var(--primary-foreground))] shadow-sm">
            <div className="whitespace-pre-wrap">{message.content}</div>
            <div className="absolute -top-2 end-2 hidden gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--popover))] px-1 py-0.5 text-[hsl(var(--fg))] group-hover:flex">
              <CopyButton value={message.content} />
              {onEditUserMessage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  aria-label="Edit message"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Assistant card
  return (
    <div className="group flex gap-3">
      <Avatar className="mt-1 h-8 w-8 shrink-0 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
        <span className="flex h-full w-full items-center justify-center text-xs font-semibold">
          SF
        </span>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="font-medium text-[hsl(var(--fg))]">SparkFlow</span>
          {message.mode ? (
            <Badge variant="outline" className="text-[10px]">
              {message.mode}
            </Badge>
          ) : null}
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
          {message.content ? (
            <Markdown content={message.content} />
          ) : streaming ? (
            <span className="inline-flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
              <span className="inline-block h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_infinite] rounded-full bg-[hsl(var(--primary))]" />
              <span className="inline-block h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_0.15s_infinite] rounded-full bg-[hsl(var(--primary))]" />
              <span className="inline-block h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_0.3s_infinite] rounded-full bg-[hsl(var(--primary))]" />
            </span>
          ) : null}

          {message.sources?.length ? (
            <div className="mt-3 border-t border-[hsl(var(--border))] pt-2">
              <button
                type="button"
                onClick={() =>
                  onShowSources?.(message.sources ?? [])
                }
                className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--fg))]"
              >
                {message.sources.length} sources — view
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton value={message.content} />
          {isLast && onRegenerate ? (
            <RegenerateButton onRegenerate={onRegenerate} disabled={streaming} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Send, Square } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Textarea,
} from "@sparkflow/ui";

export type ComposerMode = "auto" | "chat" | "search" | "research";

const MODEL_OPTIONS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
];

const MODE_OPTIONS: { id: ComposerMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Let the planner decide" },
  { id: "chat", label: "Chat", hint: "Conversational, no retrieval" },
  { id: "search", label: "Search", hint: "Fresh web context" },
  { id: "research", label: "Research", hint: "Multi-step, cited" },
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  streaming?: boolean;
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  model: string;
  onModelChange: (model: string) => void;
};

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  mode,
  onModeChange,
  model,
  onModelChange,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Auto-grow the textarea up to a sane cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  }

  const currentModeLabel =
    MODE_OPTIONS.find((m) => m.id === mode)?.label ?? "Auto";
  const currentModelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model;

  return (
    <div
      className={`mx-auto w-full max-w-3xl rounded-2xl border bg-[hsl(var(--card))] p-2 shadow-sm transition ${
        focused
          ? "border-[hsl(var(--ring))]"
          : "border-[hsl(var(--border))]"
      }`}
    >
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ask anything — research, compare, build, analyze…"
        className="min-h-[56px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
        dir="auto"
        rows={1}
      />
      <div className="flex items-center gap-2 px-1 pb-1 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" type="button">
              {currentModeLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Mode</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODE_OPTIONS.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => onModeChange(m.id)}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {m.hint}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" type="button">
              {currentModelLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Model</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODEL_OPTIONS.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => onModelChange(m.id)}
              >
                {m.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ms-auto text-xs text-[hsl(var(--muted-foreground))]">
          {streaming ? "Streaming…" : "⌘/Ctrl + Enter"}
        </span>
        {streaming && onStop ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStop}
            aria-label="Stop"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={!value.trim()}
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

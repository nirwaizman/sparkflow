"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Folder,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
} from "@sparkflow/ui";
import {
  conversationListSelector,
  useChatStore,
} from "@/lib/chat-store";

const PLACEHOLDER_FOLDERS = [
  { name: "Pinned", count: 0 },
  { name: "Research", count: 0 },
  { name: "Legal", count: 0 },
];

const STARTER_CAROUSEL = [
  "Draft a go-to-market plan",
  "Compare leading AI models",
  "Research a market",
  "Summarize the latest news",
];

export function Sidebar({
  activeId,
  onPickStarter,
}: {
  activeId?: string;
  onPickStarter?: (prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const conversations = useChatStore(useShallow(conversationListSelector));
  const pinConversation = useChatStore((s) => s.pinConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <aside className="flex h-full w-full flex-col border-e border-[hsl(var(--border))] bg-[hsl(var(--subtle))]">
      <div className="p-3">
        <Button asChild className="w-full justify-start gap-2">
          <Link href="/chat/new">
            <Plus className="h-4 w-4" />
            שיחה חדשה
          </Link>
        </Button>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש שיחות"
            className="ps-8"
            dir="auto"
          />
        </div>
      </div>

      <div className="px-3 pb-2">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Starters
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STARTER_CAROUSEL.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPickStarter?.(s)}
              className="shrink-0 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-xs text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted))]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pb-2">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Folders
        </p>
        <ul className="space-y-0.5">
          {PLACEHOLDER_FOLDERS.map((f) => (
            <li key={f.name}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[hsl(var(--fg))] hover:bg-[hsl(var(--muted))]"
              >
                <Folder className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                <span>{f.name}</span>
                <span className="ms-auto text-[10px] text-[hsl(var(--muted-foreground))]">
                  {f.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-hidden">
        <p className="px-3 pb-1 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Recent
        </p>
        <ScrollArea className="h-full px-2 pb-4">
          <ul className="space-y-0.5">
            {filtered.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                אין שיחות עדיין.
              </li>
            ) : null}
            {filtered.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li
                  key={c.id}
                  className={`group flex items-center rounded-md ${
                    isActive
                      ? "bg-[hsl(var(--muted))]"
                      : "hover:bg-[hsl(var(--muted))]"
                  }`}
                >
                  <Link
                    href={`/chat/${c.id}`}
                    className="flex-1 truncate px-2 py-1.5 text-sm"
                  >
                    {c.pinned ? (
                      <Pin className="me-1 inline h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                    ) : null}
                    {c.title}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        aria-label="Conversation options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => pinConversation(c.id, !c.pinned)}
                      >
                        <Pin className="h-3.5 w-3.5" />
                        {c.pinned ? "Unpin" : "Pin"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => deleteConversation(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>
    </aside>
  );
}

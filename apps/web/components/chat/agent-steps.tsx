"use client";

import { useState } from "react";
import { ChevronDown, Cpu, Globe, Sparkles } from "lucide-react";
import { Badge } from "@sparkflow/ui";
import type { PlannerMeta } from "@/lib/use-chat-stream";

const MODE_ICON: Record<string, React.ReactNode> = {
  search: <Globe className="h-3.5 w-3.5" />,
  research: <Sparkles className="h-3.5 w-3.5" />,
  chat: <Cpu className="h-3.5 w-3.5" />,
};

export function AgentSteps({
  planner,
  tools = [],
  streaming,
}: {
  planner: PlannerMeta;
  tools?: string[];
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const modeIcon = MODE_ICON[planner.mode] ?? <Cpu className="h-3.5 w-3.5" />;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--subtle))] text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {modeIcon}
          <span className="font-medium">
            {streaming ? "Thinking" : "Plan"} · {planner.mode}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {Math.round(planner.confidence * 100)}%
          </Badge>
          {streaming ? (
            <span className="ms-1 inline-flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
              <span className="inline-block h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_infinite] rounded-full bg-[hsl(var(--primary))]" />
              <span className="inline-block h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_0.15s_infinite] rounded-full bg-[hsl(var(--primary))]" />
              <span className="inline-block h-1.5 w-1.5 animate-[pulse-dot_1s_ease-in-out_0.3s_infinite] rounded-full bg-[hsl(var(--primary))]" />
            </span>
          ) : null}
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-[hsl(var(--border))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          <ol className="space-y-1.5">
            <li>
              <span className="font-semibold text-[hsl(var(--fg))]">classify</span>
              {" — "}
              {planner.reason || "heuristic routing"}
            </li>
            {tools.length ? (
              <li>
                <span className="font-semibold text-[hsl(var(--fg))]">tools</span>
                {" — "}
                {tools.join(", ")}
              </li>
            ) : null}
            <li>
              <span className="font-semibold text-[hsl(var(--fg))]">complexity</span>
              {" — "}
              {planner.complexity}
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}

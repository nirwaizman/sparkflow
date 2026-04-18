"use client";

import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@sparkflow/ui";
import type { SourceItem } from "@sparkflow/shared";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CitationsPanel({
  open,
  onOpenChange,
  sources,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceItem[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Sources</SheetTitle>
          <SheetDescription>
            {sources.length
              ? `${sources.length} source${sources.length === 1 ? "" : "s"} grounded this answer.`
              : "No sources yet — ask a question that triggers web search."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 overflow-y-auto pb-6">
          {sources.map((s, i) => {
            const domain = domainOf(s.url);
            const favicon =
              s.favicon ??
              (domain
                ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
                : undefined);
            return (
              <a
                key={`${s.url}-${i}`}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 transition hover:bg-[hsl(var(--muted))]"
              >
                <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  {favicon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={favicon}
                      alt=""
                      className="h-4 w-4 rounded-sm"
                      loading="lazy"
                    />
                  ) : null}
                  <span>{domain}</span>
                  <ExternalLink className="ms-auto h-3 w-3" />
                </div>
                <p className="mt-1 text-sm font-medium text-[hsl(var(--fg))]">
                  [{i + 1}] {s.title}
                </p>
                {s.snippet ? (
                  <p className="mt-1 line-clamp-3 text-xs text-[hsl(var(--muted-foreground))]">
                    {s.snippet}
                  </p>
                ) : null}
              </a>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

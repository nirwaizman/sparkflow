"use client";

/**
 * Markdown renderer for assistant messages.
 *
 * - `react-markdown` handles the tree.
 * - `remark-gfm` enables tables / task lists / strikethrough.
 * - Code blocks are syntax-highlighted via `shiki`, lazy-loaded so the
 *   first-paint JS stays small. Until shiki resolves we render the raw
 *   `<pre><code>` so the content is still visible.
 */
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "./copy-button";

type HighlighterModule = typeof import("shiki");

let highlighterPromise: Promise<unknown> | null = null;
async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = (await import("shiki")) as HighlighterModule;
      return shiki.createHighlighter({
        themes: ["github-dark"],
        langs: [
          "javascript",
          "typescript",
          "tsx",
          "jsx",
          "bash",
          "json",
          "python",
          "sql",
          "markdown",
          "css",
          "html",
        ],
      });
    })();
  }
  return highlighterPromise;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const lang = /language-([\w-]+)/.exec(className ?? "")?.[1] ?? "text";
  const raw = String(children).replace(/\n$/, "");
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const highlighter = (await getHighlighter()) as any;
        if (cancelled) return;
        const out = highlighter.codeToHtml(raw, {
          lang: highlighter.getLoadedLanguages().includes(lang) ? lang : "text",
          theme: "github-dark",
        });
        setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, lang]);

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">
        <span>{lang}</span>
        <CopyButton value={raw} label="Copy code" />
      </div>
      {html ? (
        <div
          className="overflow-x-auto p-3 text-sm [&_pre]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3 text-sm">
          <code>{raw}</code>
        </pre>
      )}
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert max-w-none text-sm leading-7 [&_a]:text-[hsl(var(--primary))] [&_a]:underline-offset-4 hover:[&_a]:underline [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...rest }) {
            const inline = !className;
            if (inline) {
              return (
                <code
                  className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-[0.85em]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-start font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b border-[hsl(var(--border))] px-3 py-2 align-top">
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

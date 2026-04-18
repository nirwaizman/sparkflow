import type { SourceItem } from "@sparkflow/shared";
import type { Chunk } from "./types";

type CitedInput = SourceItem | Chunk;

function isChunk(x: CitedInput): x is Chunk {
  return (x as Chunk).content !== undefined && (x as Chunk).id !== undefined;
}

/**
 * Render a numbered citation block like:
 *   [1] Title — https://url
 *   snippet...
 * Suitable for injection into a prompt so the model can cite by number.
 */
export function buildCitedContext(sources: CitedInput[]): string {
  if (sources.length === 0) return "";
  const lines: string[] = [];
  sources.forEach((item, i) => {
    const n = i + 1;
    if (isChunk(item)) {
      const label =
        typeof item.metadata["title"] === "string" && item.metadata["title"].length > 0
          ? (item.metadata["title"] as string)
          : `Chunk ${item.id}`;
      const url =
        typeof item.metadata["url"] === "string" ? (item.metadata["url"] as string) : "";
      lines.push(`[${n}] ${label}${url ? ` — ${url}` : ""}`);
      lines.push(item.content.trim());
    } else {
      lines.push(`[${n}] ${item.title} — ${item.url}`);
      if (item.snippet) lines.push(item.snippet.trim());
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

/**
 * Extract all [n] citation references from LLM output, in order of first
 * occurrence, deduped.
 */
export function extractCitations(text: string): number[] {
  const re = /\[(\d+)\]/g;
  const out: number[] = [];
  const seen = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Replace `[n]` refs in `text` with `[[n]](url)` markdown links pointing
 * at the 1-indexed source. Unknown indices are left untouched.
 */
export function linkCitations(text: string, sources: SourceItem[]): string {
  return text.replace(/\[(\d+)\]/g, (full, raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return full;
    const src = sources[n - 1];
    if (!src) return full;
    return `[[${n}]](${src.url})`;
  });
}

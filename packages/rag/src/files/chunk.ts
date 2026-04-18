import { uid } from "@sparkflow/shared";
import type { Chunk, ChunkingOptions } from "../types";

/**
 * Cheap token estimate: ~4 chars/token is a rough average for English text.
 * Good enough for chunk sizing; use a real tokenizer when precision matters.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function tokensToChars(tokens: number): number {
  return Math.max(1, tokens * 4);
}

export function chunkText(text: string, opts: ChunkingOptions = {}): Chunk[] {
  const targetTokens = opts.targetTokens ?? 500;
  const overlap = opts.overlap ?? 50;
  const strategy = opts.strategy ?? "fixed";

  const trimmed = text.replace(/\r\n/g, "\n");
  if (!trimmed.trim()) return [];

  if (strategy === "semantic") {
    return semanticChunks(trimmed, targetTokens, overlap);
  }
  return fixedChunks(trimmed, targetTokens, overlap);
}

function fixedChunks(text: string, targetTokens: number, overlap: number): Chunk[] {
  const size = tokensToChars(targetTokens);
  const step = Math.max(1, size - tokensToChars(overlap));
  const out: Chunk[] = [];
  for (let i = 0; i < text.length; i += step) {
    const slice = text.slice(i, i + size);
    if (!slice.trim()) continue;
    out.push({
      id: uid("chunk"),
      content: slice,
      tokens: estimateTokens(slice),
      metadata: { strategy: "fixed", offset: i },
    });
    if (i + size >= text.length) break;
  }
  return out;
}

function semanticChunks(text: string, targetTokens: number, overlap: number): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  const out: Chunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;
  let offset = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join("\n\n");
    out.push({
      id: uid("chunk"),
      content,
      tokens: estimateTokens(content),
      metadata: { strategy: "semantic", offset },
    });
    offset += content.length;
    if (overlap > 0 && buffer.length > 1) {
      const tail = buffer[buffer.length - 1] ?? "";
      const tailTokens = estimateTokens(tail);
      if (tailTokens <= overlap * 2) {
        buffer = [tail];
        bufferTokens = tailTokens;
        return;
      }
    }
    buffer = [];
    bufferTokens = 0;
  };

  for (const para of paragraphs) {
    const t = estimateTokens(para);
    if (bufferTokens + t > targetTokens && buffer.length > 0) {
      flush();
    }
    buffer.push(para);
    bufferTokens += t;
  }
  flush();

  return out;
}

import { describe, expect, it } from "vitest";
import { chunkText, estimateTokens } from "../src/files/chunk";

describe("chunkText fixed strategy", () => {
  it("returns empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("produces overlapping fixed-size windows", () => {
    const text = "a".repeat(4000); // ~1000 tokens at 4 chars/token
    const chunks = chunkText(text, { targetTokens: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk other than the last should be ~400 chars
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(400);
      expect(c.tokens).toBe(estimateTokens(c.content));
    }
    // Overlap: end of chunk[0] should intersect start of chunk[1]
    const first = chunks[0]?.content ?? "";
    const second = chunks[1]?.content ?? "";
    const overlapChars = 20 * 4;
    expect(first.slice(-overlapChars)).toBe(second.slice(0, overlapChars));
  });

  it("honors ids and metadata offset", () => {
    const text = "x".repeat(2000);
    const chunks = chunkText(text, { targetTokens: 100, overlap: 10 });
    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
    expect(chunks[0]?.metadata["offset"]).toBe(0);
    expect(chunks[0]?.metadata["strategy"]).toBe("fixed");
  });
});

describe("chunkText semantic strategy", () => {
  it("packs paragraphs up to the target", () => {
    const paras = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} `.repeat(40));
    const text = paras.join("\n\n");
    const chunks = chunkText(text, {
      strategy: "semantic",
      targetTokens: 200,
      overlap: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.metadata["strategy"]).toBe("semantic");
    }
  });
});

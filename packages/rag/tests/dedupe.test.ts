import { describe, expect, it } from "vitest";
import type { SourceItem } from "@sparkflow/shared";
import { dedupeSources, normalizeUrl } from "../src/web/dedupe";

describe("normalizeUrl", () => {
  it("lowercases host and strips trailing slash", () => {
    expect(normalizeUrl("HTTPS://Example.COM/foo/")).toBe("https://example.com/foo");
  });

  it("strips utm_ and fbclid params", () => {
    const n = normalizeUrl("https://a.com/p?utm_source=x&utm_medium=y&id=7&fbclid=zzz");
    expect(n).toBe("https://a.com/p?id=7");
  });

  it("drops hash fragments", () => {
    expect(normalizeUrl("https://a.com/page#section")).toBe("https://a.com/page");
  });

  it("falls back to trimmed lowercase for malformed urls", () => {
    expect(normalizeUrl("  NotAUrl  ")).toBe("notaurl");
  });
});

describe("dedupeSources", () => {
  it("removes url duplicates after normalization", () => {
    const sources: SourceItem[] = [
      { title: "A", url: "https://example.com/x/", snippet: "hello world one" },
      { title: "A2", url: "https://EXAMPLE.com/x?utm_source=google", snippet: "totally different snippet content here" },
      { title: "B", url: "https://other.com/y", snippet: "another unique snippet altogether" },
    ];
    const out = dedupeSources(sources);
    expect(out.map((s) => s.url)).toEqual([
      "https://example.com/x/",
      "https://other.com/y",
    ]);
  });

  it("detects near-duplicate snippets via shingle jaccard", () => {
    const snippet = "the quick brown fox jumps over the lazy dog in the park today";
    const sources: SourceItem[] = [
      { title: "A", url: "https://a.com/1", snippet },
      { title: "B", url: "https://b.com/2", snippet: snippet + " slightly extended" },
      { title: "C", url: "https://c.com/3", snippet: "completely unrelated text about cooking pasta with tomato sauce" },
    ];
    const out = dedupeSources(sources);
    expect(out).toHaveLength(2);
    expect(out[0]?.url).toBe("https://a.com/1");
    expect(out[1]?.url).toBe("https://c.com/3");
  });
});

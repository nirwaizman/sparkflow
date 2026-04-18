import { describe, expect, it } from "vitest";
import type { SourceItem } from "@sparkflow/shared";
import { diversifyByDomain } from "../src/web/dedupe";

describe("diversifyByDomain", () => {
  const make = (url: string): SourceItem => ({
    title: url,
    url,
    snippet: "",
  });

  it("caps results per domain while preserving order", () => {
    const input = [
      make("https://a.com/1"),
      make("https://a.com/2"),
      make("https://a.com/3"),
      make("https://b.com/1"),
      make("https://b.com/2"),
      make("https://c.com/1"),
    ];
    const out = diversifyByDomain(input, 2);
    expect(out.map((s) => s.url)).toEqual([
      "https://a.com/1",
      "https://a.com/2",
      "https://b.com/1",
      "https://b.com/2",
      "https://c.com/1",
    ]);
  });

  it("uses default cap of 2 when unspecified", () => {
    const input = [
      make("https://x.com/1"),
      make("https://x.com/2"),
      make("https://x.com/3"),
    ];
    expect(diversifyByDomain(input)).toHaveLength(2);
  });

  it("treats host case-insensitively", () => {
    const input = [
      make("https://Foo.com/a"),
      make("https://foo.COM/b"),
      make("https://foo.com/c"),
    ];
    expect(diversifyByDomain(input, 1)).toHaveLength(1);
  });
});

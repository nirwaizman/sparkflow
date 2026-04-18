import { describe, expect, it } from "vitest";
import type { SourceItem } from "@sparkflow/shared";
import {
  buildCitedContext,
  extractCitations,
  linkCitations,
} from "../src/citations";

const sources: SourceItem[] = [
  { title: "Alpha", url: "https://a.com", snippet: "alpha snippet" },
  { title: "Beta", url: "https://b.com", snippet: "beta snippet" },
];

describe("buildCitedContext", () => {
  it("renders numbered entries with title, url, and snippet", () => {
    const out = buildCitedContext(sources);
    expect(out).toContain("[1] Alpha — https://a.com");
    expect(out).toContain("[2] Beta — https://b.com");
    expect(out).toContain("alpha snippet");
  });

  it("returns empty string for empty input", () => {
    expect(buildCitedContext([])).toBe("");
  });
});

describe("extractCitations", () => {
  it("returns unique citation numbers in order", () => {
    const text = "Per [1], and then again [2], and once more [1] plus [3].";
    expect(extractCitations(text)).toEqual([1, 2, 3]);
  });

  it("ignores non-numeric brackets", () => {
    expect(extractCitations("nothing here [abc] or []")).toEqual([]);
  });
});

describe("linkCitations", () => {
  it("replaces known refs with markdown links", () => {
    const text = "See [1] and [2].";
    expect(linkCitations(text, sources)).toBe(
      "See [[1]](https://a.com) and [[2]](https://b.com).",
    );
  });

  it("leaves unknown indices untouched", () => {
    expect(linkCitations("[9]", sources)).toBe("[9]");
  });
});

import { describe, expect, it } from "vitest";
import { mockEmbedder } from "@sparkflow/rag";
import { InMemoryStore, MemoryEngine } from "../src/index";
import type { MemoryMatch } from "../src/index";

describe("MemoryEngine.buildContextBlock", () => {
  const engine = new MemoryEngine({
    store: new InMemoryStore(),
    embed: mockEmbedder,
  });

  it("renders a placeholder block when there are no matches", () => {
    expect(engine.buildContextBlock([])).toBe("## MEMORIES\n(none)");
  });

  it("renders a deterministic formatted block", () => {
    const fixedDate = new Date("2026-01-01T00:00:00.000Z");
    const matches: MemoryMatch[] = [
      {
        score: 0.9123,
        entry: {
          id: "mem_a",
          organizationId: "org-1",
          userId: "user-1",
          scope: "user",
          key: "preferred_language",
          value: "typescript",
          embedding: null,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        },
      },
      {
        score: 0.8,
        entry: {
          id: "mem_b",
          organizationId: "org-1",
          userId: "user-1",
          scope: "workspace",
          key: "team_style",
          value: "conventional commits",
          embedding: null,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        },
      },
    ];

    const block = engine.buildContextBlock(matches);
    expect(block).toMatchInlineSnapshot(`
      "## MEMORIES
      The following are durable facts recalled from long-term memory. They are NOT web sources and must not be cited as such.
      1. [user] preferred_language: typescript (score=0.912)
      2. [workspace] team_style: conventional commits (score=0.800)"
    `);
  });
});

import { describe, expect, it } from "vitest";
import { mockEmbedder } from "@sparkflow/rag";
import { InMemoryStore, MemoryEngine } from "../src/index";
import type { MemoryContext } from "../src/index";

const ctx: MemoryContext = {
  organizationId: "org-1",
  userId: "user-1",
};

function newEngine(): MemoryEngine {
  return new MemoryEngine({ store: new InMemoryStore(), embed: mockEmbedder });
}

describe("MemoryEngine + InMemoryStore", () => {
  it("round-trips remember and recall", async () => {
    const engine = newEngine();
    await engine.remember({
      ctx,
      scope: "user",
      key: "preferred_language",
      value: "typescript",
    });

    const matches = await engine.recall({
      ctx,
      query: "typescript",
      scope: "user",
      minScore: 0, // disable threshold for determinism
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.entry.key).toBe("preferred_language");
    expect(matches[0]?.entry.value).toBe("typescript");
  });

  it("upserts on the (org, user, scope, key) composite", async () => {
    const engine = newEngine();
    await engine.remember({
      ctx,
      scope: "user",
      key: "timezone",
      value: "UTC",
    });
    await engine.remember({
      ctx,
      scope: "user",
      key: "timezone",
      value: "America/Los_Angeles",
    });

    const entries = await engine.list({ ctx, scope: "user" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.value).toBe("America/Los_Angeles");
  });

  it("filters out low-score matches via minScore", async () => {
    const engine = newEngine();
    await engine.remember({
      ctx,
      scope: "user",
      key: "fact_1",
      value: "apples are red",
    });

    // With a very high threshold, an unrelated query should yield nothing.
    const noise = await engine.recall({
      ctx,
      query: "zzzzzzzzzzzzzzzzz",
      scope: "user",
      minScore: 0.99,
    });
    expect(noise).toHaveLength(0);

    // With no threshold the same memory is returned.
    const permissive = await engine.recall({
      ctx,
      query: "zzzzzzzzzzzzzzzzz",
      scope: "user",
      minScore: -1,
    });
    expect(permissive.length).toBeGreaterThanOrEqual(1);
  });

  it("forget removes a memory", async () => {
    const engine = newEngine();
    const entry = await engine.remember({
      ctx,
      scope: "user",
      key: "doomed",
      value: "goodbye world",
    });

    await engine.forget({ ctx, id: entry.id });

    const remaining = await engine.list({ ctx, scope: "user" });
    expect(remaining.find((e) => e.id === entry.id)).toBeUndefined();
  });

  it("isolates memories across users within the same org", async () => {
    const engine = newEngine();
    await engine.remember({
      ctx,
      scope: "user",
      key: "color",
      value: "blue",
    });

    const other: MemoryContext = {
      organizationId: "org-1",
      userId: "user-2",
    };
    const theirMatches = await engine.recall({
      ctx: other,
      query: "blue",
      scope: "user",
      minScore: -1,
    });
    expect(theirMatches).toHaveLength(0);
  });
});

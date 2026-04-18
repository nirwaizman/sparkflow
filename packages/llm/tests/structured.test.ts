import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import {
  generateObjectHelper,
  __setGenerateObjectForTests,
} from "../src/structured";

const schema = z.object({
  name: z.string(),
  count: z.number().int().min(0),
});

describe("generateObjectHelper", () => {
  afterEach(() => {
    __setGenerateObjectForTests(undefined);
  });

  it("retries once on invalid output and succeeds on the second attempt", async () => {
    let calls = 0;
    __setGenerateObjectForTests(async () => {
      calls += 1;
      if (calls === 1) {
        // Invalid: count is a string.
        return { object: { name: "x", count: "nope" } };
      }
      return {
        object: { name: "x", count: 3 },
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    });

    const result = await generateObjectHelper({
      schema,
      messages: [{ id: "1", role: "user", content: "give me one" }],
    });

    expect(calls).toBe(2);
    expect(result.object).toEqual({ name: "x", count: 3 });
  });

  it("throws if both attempts fail validation", async () => {
    let calls = 0;
    __setGenerateObjectForTests(async () => {
      calls += 1;
      return { object: { name: 1, count: "bad" } };
    });

    await expect(
      generateObjectHelper({
        schema,
        messages: [{ id: "1", role: "user", content: "give me one" }],
      }),
    ).rejects.toBeDefined();
    expect(calls).toBe(2);
  });
});

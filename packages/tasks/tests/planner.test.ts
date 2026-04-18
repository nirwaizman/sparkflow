import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { __setGenerateObjectForTests } from "@sparkflow/llm";
import { planTask } from "../src/planner";

describe("planTask", () => {
  beforeEach(() => {
    __setGenerateObjectForTests(undefined);
  });

  afterEach(() => {
    __setGenerateObjectForTests(undefined);
  });

  it("returns the plan when generateObject produces a valid object", async () => {
    __setGenerateObjectForTests(async () => ({
      object: {
        goal: "Ship it",
        steps: [
          { kind: "llm", description: "Outline the approach" },
          { kind: "tool_call", description: "Search for references" },
          { kind: "llm", description: "Synthesise the answer" },
        ],
      },
    }));

    const plan = await planTask("Ship it");
    expect(plan.goal).toBe("Ship it");
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]?.kind).toBe("llm");
  });

  it("rejects a step with an unknown kind (zod validation)", async () => {
    // First AND second call return the same invalid payload so the
    // internal single retry also fails.
    __setGenerateObjectForTests(async () => ({
      // Intentionally malformed: `kind` isn't one of the allowed values.
      object: {
        goal: "bad",
        steps: [{ kind: "not_a_kind", description: "x" }],
      },
    }));

    await expect(planTask("bad")).rejects.toThrow();
  });

  it("requires at least one step", async () => {
    __setGenerateObjectForTests(async () => ({
      object: { goal: "empty", steps: [] },
    }));

    await expect(planTask("empty")).rejects.toThrow();
  });
});

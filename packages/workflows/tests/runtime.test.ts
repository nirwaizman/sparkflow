/**
 * Runtime smoke test: a trigger → llm → output graph runs to completion
 * and the final event carries the LLM's output. The LLM is mocked via
 * `__setProviderForTests` from @sparkflow/llm.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@sparkflow/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: "run-1" }],
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }),
  }),
  workflowRuns: { id: "id" },
}));

import { runWorkflow } from "../src/runtime";
import type { WorkflowDefinition } from "../src/types";

describe("runWorkflow", () => {
  it("executes a trigger -> llm -> output graph", async () => {
    // No real provider keys are configured in tests so the gateway
    // silently falls back to the mockProvider, which returns a
    // deterministic canned response.

    const def: WorkflowDefinition = {
      id: "wf-1",
      name: "Smoke",
      version: 1,
      trigger: { kind: "manual" },
      graph: {
        entryNodeId: "n1",
        nodes: [
          { id: "n1", kind: "trigger", config: {}, next: ["n2"] },
          {
            id: "n2",
            kind: "llm",
            config: { prompt: "Say hi" },
            next: ["n3"],
          },
          { id: "n3", kind: "output", config: {} },
        ],
      },
    };

    const events: { type: string }[] = [];
    for await (const ev of runWorkflow(def, { foo: 1 }, {
      organizationId: "org-1",
    })) {
      events.push(ev);
    }

    const last = events[events.length - 1];
    expect(last?.type).toBe("finish");
    // 3 step_starts + 3 step_ends + 1 finish = 7 events
    expect(events.filter((e) => e.type === "step_start")).toHaveLength(3);
    expect(events.filter((e) => e.type === "step_end")).toHaveLength(3);
  });
});

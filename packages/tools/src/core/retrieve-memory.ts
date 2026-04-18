import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Retrieve previously-saved memories by semantic query.
 *
 * Stub — the concrete vector store + scope resolution lives in
 * `@sparkflow/memory` and will be wired here.
 */
const parameters = z.object({
  query: z.string().min(1).describe("Semantic query for memory lookup"),
  scope: z
    .enum(["session", "user", "workspace"])
    .optional()
    .describe("Memory scope to search (default: user)"),
});

type Params = z.infer<typeof parameters>;

export type MemoryHit = {
  key: string;
  value: string;
  score: number;
  scope: "session" | "user" | "workspace";
};

export const retrieveMemoryTool: ToolRegistration<Params, MemoryHit[]> = {
  tool: {
    name: "retrieve_memory",
    description:
      "Retrieve relevant memories (facts, preferences, past context) by semantic search within a scope.",
    parameters,
    handler: async ({ query, scope }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[retrieve_memory] TODO: wire to @sparkflow/memory. query=${query} scope=${scope ?? "user"}`,
      );
      return [];
    },
  },
  category: "memory",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 12,
    allowInAutonomousMode: true,
  },
};

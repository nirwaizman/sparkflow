import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Persist a memory to the user's store.
 *
 * Stub — real implementation defers to `@sparkflow/memory`.
 */
const parameters = z.object({
  key: z.string().min(1).describe("Stable identifier for the memory"),
  value: z.string().min(1).describe("Content to persist"),
  scope: z
    .enum(["session", "user", "workspace"])
    .optional()
    .describe("Memory scope (default: user)"),
});

type Params = z.infer<typeof parameters>;

export type SaveMemoryResult = { ok: boolean };

export const saveMemoryTool: ToolRegistration<Params, SaveMemoryResult> = {
  tool: {
    name: "save_memory",
    description:
      "Save a memory (key/value) into the requested scope. Overwrites prior values for the same key.",
    parameters,
    handler: async ({ key, scope }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[save_memory] TODO: wire to @sparkflow/memory. key=${key} scope=${scope ?? "user"}`,
      );
      return { ok: true };
    },
  },
  category: "memory",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 20,
    allowInAutonomousMode: false,
    // Values may contain PII — don't dump them verbatim into logs.
    redactInputs: (input: unknown) => {
      if (input && typeof input === "object" && "value" in input) {
        const anyIn = input as {
          key?: string;
          scope?: string;
          value?: string;
        };
        return {
          key: anyIn.key,
          scope: anyIn.scope,
          value: `[redacted:${anyIn.value?.length ?? 0} chars]`,
        };
      }
      return input;
    },
  },
};

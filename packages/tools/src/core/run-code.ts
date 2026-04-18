import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Execute untrusted code in a sandbox.
 *
 * Stub: real sandboxing (E2B / firecracker) lands in WP-C2. Until then
 * the handler refuses to execute and returns a clear error so callers
 * don't mistakenly trust its output.
 */
const parameters = z.object({
  language: z.enum(["python", "node"]).describe("Runtime for the snippet"),
  code: z.string().min(1).describe("Source code to execute"),
});

type Params = z.infer<typeof parameters>;

export type RunCodeResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export const runCodeTool: ToolRegistration<Params, RunCodeResult> = {
  tool: {
    name: "run_code",
    description:
      "Execute a short python or node snippet in a sandbox and return stdout/stderr/exitCode. Stub until WP-C2.",
    parameters,
    handler: async () => {
      return {
        stdout: "",
        stderr: "not implemented: E2B sandbox lands in WP-C2",
        exitCode: -1,
      };
    },
  },
  category: "code",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 4,
    allowInAutonomousMode: false,
    // Redact code bodies from logs — they can contain credentials users
    // paste in by accident.
    redactInputs: (input: unknown) => {
      if (input && typeof input === "object" && "code" in input) {
        const anyIn = input as { language?: string; code?: string };
        return {
          language: anyIn.language,
          code: `[redacted:${anyIn.code?.length ?? 0} chars]`,
        };
      }
      return input;
    },
  },
};

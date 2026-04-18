import type { ToolDefinition } from "@sparkflow/llm";
import type { ToolSafetyPolicy } from "./types";

/**
 * Wrap a tool's handler with structured start/end logging.
 *
 * - Logs invocation start with a redacted input snapshot (via
 *   `safety.redactInputs` when provided, otherwise the raw input).
 * - Logs end with duration in ms and an error summary if the handler
 *   threw.
 * - The returned `ToolDefinition` preserves the original shape (name,
 *   description, parameters) so it remains a drop-in replacement.
 *
 * TODO(langfuse): emit a proper trace/span to Langfuse once the
 * observability package lands (WP-D?). Today this is just console.log so
 * tests and local dev stay dependency-free.
 */
export function wrapWithLogging<TParams, TResult>(
  tool: ToolDefinition<TParams, TResult>,
  safety?: ToolSafetyPolicy,
): ToolDefinition<TParams, TResult> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    handler: async (args: TParams): Promise<TResult> => {
      const start = Date.now();
      const redacted = safety?.redactInputs
        ? safety.redactInputs(args)
        : args;
      // eslint-disable-next-line no-console
      console.log(
        `[tool:start] name=${tool.name} input=${safeStringify(redacted)}`,
      );
      try {
        const result = await tool.handler(args);
        // eslint-disable-next-line no-console
        console.log(
          `[tool:end] name=${tool.name} durationMs=${Date.now() - start}`,
        );
        return result;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(
          `[tool:error] name=${tool.name} durationMs=${Date.now() - start} error=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw err;
      }
    },
  };
}

/** Stringify with a length cap so logs never balloon on large inputs. */
function safeStringify(value: unknown, maxLen = 512): string {
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = "[unserialisable]";
  }
  if (s === undefined) s = "undefined";
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

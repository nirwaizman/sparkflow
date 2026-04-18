/**
 * Helpers for authoring and executing model tool calls.
 */

import type { ChatMessage } from "@sparkflow/shared";
import { uid } from "@sparkflow/shared";
import type { z } from "zod";
import type { ToolCall, ToolDefinition } from "./types";

/**
 * Factory that preserves parameter inference: callers write
 * `defineTool({ name: "x", description, parameters: z.object({...}), handler })`
 * and get a fully-typed ToolDefinition back.
 */
export function defineTool<TSchema extends z.ZodTypeAny, TResult>(config: {
  name: string;
  description: string;
  parameters: TSchema;
  handler: (args: z.infer<TSchema>) => Promise<TResult> | TResult;
}): ToolDefinition<z.infer<TSchema>, TResult> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    handler: config.handler,
  };
}

/**
 * Run every tool call in parallel via `Promise.allSettled`. Each result is
 * converted into a `ChatMessage` with `role: "tool"` suitable for feeding into
 * the next generation turn.
 *
 * Missing tools and handler failures are reported as JSON objects on the
 * message content so the model can reason about the failure rather than
 * silently losing context.
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  tools: Record<string, ToolDefinition>,
): Promise<ChatMessage[]> {
  const tasks = toolCalls.map(async (call) => {
    const def = tools[call.name];
    if (!def) {
      return {
        id: call.id,
        role: "tool" as const,
        content: JSON.stringify({
          error: `Unknown tool "${call.name}"`,
          toolCallId: call.id,
        }),
      };
    }
    try {
      const parsed = def.parameters.parse(call.args);
      const result = await def.handler(parsed);
      return {
        id: call.id,
        role: "tool" as const,
        content: typeof result === "string" ? result : JSON.stringify(result),
      };
    } catch (err) {
      return {
        id: call.id,
        role: "tool" as const,
        content: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          toolCallId: call.id,
          toolName: call.name,
        }),
      };
    }
  });

  const settled = await Promise.allSettled(tasks);
  return settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const call = toolCalls[i];
    return {
      id: call?.id ?? uid("tool"),
      role: "tool" as const,
      content: JSON.stringify({
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      }),
    };
  });
}

/**
 * Shared helpers used by every real-provider adapter.
 *
 * Adapters convert SparkFlow's `ChatMessage` domain type into the AI SDK's
 * `CoreMessage` shape, materialise typed errors from SDK failures, and build
 * `UsageRecord`s using the central pricing table. Keeping this logic in one
 * module keeps every provider identical in behaviour.
 */

import type { ChatMessage, UsageRecord } from "@sparkflow/shared";
import type { CoreMessage, ToolSet } from "ai";
import { tool as defineAiTool } from "ai";
import { ProviderUnavailableError, isTransientStatus } from "../errors";
import { estimateCost } from "../pricing";
import type { LlmProviderName, ToolChoice, ToolDefinition } from "../types";

/**
 * Map our domain message list onto the AI SDK's CoreMessage shape.
 * `tool` roles round-trip as tool-result messages.
 */
export function toCoreMessages(
  messages: ChatMessage[],
  system?: string,
): CoreMessage[] {
  const mapped: CoreMessage[] = [];
  if (system) {
    mapped.push({ role: "system", content: system });
  }
  for (const m of messages) {
    if (m.role === "tool") {
      mapped.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: m.id,
            toolName: m.id,
            result: m.content,
          },
        ],
      });
      continue;
    }
    if (m.role === "system") {
      mapped.push({ role: "system", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      mapped.push({ role: "assistant", content: m.content });
      continue;
    }
    mapped.push({ role: "user", content: m.content });
  }
  return mapped;
}

/**
 * Translate arbitrary thrown values from the AI SDK into
 * `ProviderUnavailableError` when the underlying issue looks transient
 * (5xx/429), so the gateway can fall back. Other errors are rethrown.
 */
export function rethrowAsProviderError(
  provider: LlmProviderName,
  err: unknown,
): never {
  // AI SDK errors commonly expose `.statusCode` or `.status`; support both.
  const status =
    (err as { statusCode?: number }).statusCode ??
    (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : String(err);

  if (isTransientStatus(status)) {
    throw new ProviderUnavailableError(provider, message, { status, cause: err });
  }
  throw err;
}

/**
 * Build a UsageRecord using the central pricing table plus latency measured
 * by the adapter.
 */
export function buildUsage(params: {
  provider: LlmProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  startedAt: number;
}): UsageRecord {
  const { provider, model, inputTokens, outputTokens, startedAt } = params;
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCost(provider, model, inputTokens, outputTokens),
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Convert our `ToolDefinition` record into the AI SDK tools shape.
 * Shape intentionally kept loose — the SDK infers types from `parameters`.
 */
export function toSdkTools(
  tools: Record<string, ToolDefinition> | undefined,
): ToolSet | undefined {
  if (!tools) return undefined;
  const out: ToolSet = {};
  for (const [key, def] of Object.entries(tools)) {
    out[key] = defineAiTool({
      description: def.description,
      parameters: def.parameters,
      execute: async (args: unknown) => def.handler(args as never),
    });
  }
  return out;
}

/**
 * Convert our domain `ToolChoice` into the AI SDK's shape, which uses
 * `{ type: "tool", toolName }` for named forcing.
 */
export function toSdkToolChoice(
  choice: ToolChoice | undefined,
):
  | "auto"
  | "required"
  | "none"
  | { type: "tool"; toolName: string }
  | undefined {
  if (!choice) return undefined;
  if (typeof choice === "string") return choice;
  return { type: "tool", toolName: choice.toolName };
}

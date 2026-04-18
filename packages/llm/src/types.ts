import type { ChatMessage, UsageRecord } from "@sparkflow/shared";
import type { z } from "zod";

export type LlmProviderName = "openai" | "anthropic" | "google" | "groq";

/**
 * Provider identifier used in logs and usage records. "mock" is a pseudo
 * provider used for local development when no real API key is configured.
 */
export type ProviderLabel = LlmProviderName | "mock";

/**
 * A tool the model may call during generation. Parameters are described with a
 * zod schema; the handler receives the parsed arguments and returns JSON-
 * serialisable data that is fed back to the model on the next turn.
 */
export type ToolDefinition<TParams = unknown, TResult = unknown> = {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (args: TParams) => Promise<TResult> | TResult;
};

/**
 * Controls which tool (if any) the model must pick on this turn.
 *  - "auto": model chooses.
 *  - "required": model must call at least one tool.
 *  - "none": disable tool calling for this turn.
 *  - { toolName }: force a specific tool.
 */
export type ToolChoice =
  | "auto"
  | "required"
  | "none"
  | { toolName: string };

export type GenerateArgs = {
  model?: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, ToolDefinition>;
  toolChoice?: ToolChoice;
  /**
   * When present, the provider is asked to emit JSON conforming to this schema.
   * Preferred path is the dedicated `generateObject` helper in structured.ts.
   */
  jsonSchema?: z.ZodTypeAny;
};

export type ToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type GenerateResult = {
  content: string;
  provider: ProviderLabel;
  model: string;
  usage?: UsageRecord;
  finishReason?: string;
  toolCalls?: ToolCall[];
};

/**
 * Yielded by `LlmProvider.stream`. The last value must be a sentinel with
 * `done: true` and an optional usage record so callers can close out billing.
 */
export type StreamChunk =
  | { done: false; delta: string }
  | { done: true; usage?: UsageRecord; finishReason?: string };

export interface LlmProvider {
  readonly name: ProviderLabel;
  generate(args: GenerateArgs): Promise<GenerateResult>;
  stream(args: GenerateArgs): AsyncIterable<StreamChunk>;
}

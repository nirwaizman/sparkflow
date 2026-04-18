/**
 * Shared types for the @sparkflow/agents multi-agent framework (WP-C3).
 */
import type { ChatMessage, UsageRecord } from "@sparkflow/shared";

/**
 * Where an agent's memories live. `global` is reserved for system-wide
 * facts curated by operators (not user data).
 */
export type AgentMemoryScope = "session" | "user" | "workspace" | "global";

/**
 * Declarative description of an agent. Pure data — no tool handlers or
 * provider bindings — so agent definitions can be serialised / edited in
 * the product UI and instantiated at runtime against a ToolRegistry.
 */
export type AgentDefinition = {
  /** Stable machine id, e.g. "research", "critic". */
  id: string;
  /** Display name. */
  name: string;
  /** One-line persona (e.g. "Research analyst"). */
  role: string;
  /** What the agent is trying to achieve in a run. */
  objective: string;
  /** Full system prompt injected on every turn. */
  systemPrompt: string;
  /** Registry keys the agent may call. Empty array = pure reasoning. */
  tools: string[];
  /** Memory scope the agent reads/writes. */
  memoryScope: AgentMemoryScope;
  /** Optional model override (else uses the gateway default). */
  model?: string;
  /** Optional temperature override. */
  temperature?: number;
};

/**
 * Run-time context passed into an agent. Everything is optional so the
 * same agent can be exercised in tests without stubbing the whole world.
 */
export type AgentContext = {
  conversationId?: string;
  userId?: string;
  organizationId?: string;
  /** Ambient memories (key -> value) the caller wants pre-loaded. */
  memories?: Record<string, string>;
  /** Environment / feature-flag bag visible to tools. */
  env?: Record<string, string>;
};

export type AgentRunInput = {
  prompt: string;
  context?: AgentContext;
  history?: ChatMessage[];
};

export type AgentToolCallTrace = {
  name: string;
  input: unknown;
  output: unknown;
};

export type AgentRunResult = {
  content: string;
  toolCalls: AgentToolCallTrace[];
  usage?: UsageRecord;
  metadata?: Record<string, unknown>;
};

/**
 * Discriminated union for streaming agent progress. UI bindings
 * subscribe to these to show intermediate state (tool calls, thoughts).
 */
export type AgentEvent =
  | { type: "start"; payload: { agentId: string; prompt: string } }
  | { type: "token"; payload: { delta: string } }
  | { type: "tool_start"; payload: { name: string; input: unknown } }
  | { type: "tool_end"; payload: { name: string; output: unknown; durationMs: number } }
  | { type: "thought"; payload: { text: string } }
  | { type: "finish"; payload: { content: string; usage?: UsageRecord } }
  | { type: "error"; payload: { message: string } };

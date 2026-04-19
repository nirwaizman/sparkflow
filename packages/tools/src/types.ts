/**
 * Public types for the @sparkflow/tools package (WP-C1).
 *
 * A "tool" is a capability the LLM (or an agent) can invoke during a turn.
 * The shape of a tool (name + description + zod parameter schema + handler)
 * is defined by `@sparkflow/llm`; this package layers category metadata and
 * a safety policy on top so the registry can enforce sensible defaults.
 */
import type { ToolDefinition } from "@sparkflow/llm";

// Re-export so callers only need to depend on @sparkflow/tools.
export type { ToolDefinition } from "@sparkflow/llm";

/**
 * Broad category used for filtering, routing, and policy decisions. Not a
 * strict taxonomy — a tool may conceptually belong in several categories
 * but should pick the most specific one.
 */
export type ToolCategory =
  | "search"
  | "fetch"
  | "text"
  | "code"
  | "file"
  | "memory"
  | "image"
  | "document"
  | "research"
  | "content"
  | "files"
  | "integrations"
  | "utilities";

/**
 * Enforcement policy evaluated by the runtime before a tool is executed.
 *
 * - `requiresAuth`: call must be associated with a signed-in user.
 * - `maxInvocationsPerRequest`: hard cap on calls inside a single request
 *   (prevents runaway loops).
 * - `allowInAutonomousMode`: whether an autonomous agent (no human-in-loop)
 *   may invoke this without explicit approval. Destructive / expensive
 *   tools should set this to `false`.
 * - `redactInputs`: optional hook returning a redacted view of the inputs
 *   for logging. Must not mutate the original input.
 */
export type ToolSafetyPolicy = {
  requiresAuth: boolean;
  maxInvocationsPerRequest: number;
  allowInAutonomousMode: boolean;
  redactInputs?: (input: unknown) => unknown;
};

/**
 * A tool as registered in the registry: the underlying definition plus our
 * category + safety metadata.
 */
export type ToolRegistration<TParams = unknown, TResult = unknown> = {
  tool: ToolDefinition<TParams, TResult>;
  category: ToolCategory;
  safety: ToolSafetyPolicy;
};

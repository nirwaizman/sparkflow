// Core domain types shared across apps and packages.

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type SourceItem = {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  publishedAt?: string;
};

/**
 * The router classifier's output modes.
 * 11 modes as specified in the master plan.
 */
export type PlannerMode =
  | "chat"
  | "search"
  | "research"
  | "task"
  | "agent_team"
  | "file"
  | "code"
  | "image"
  | "memory"
  | "workflow"
  | "legal";

export type PlannerDecision = {
  mode: PlannerMode;
  confidence: number; // 0..1
  reasoning: string;
  tools: string[];
  complexity: "low" | "medium" | "high";
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  sources?: SourceItem[];
  mode?: PlannerMode;
  createdAt?: string;
};

export type UsageRecord = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

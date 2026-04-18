/**
 * Public entrypoint for @sparkflow/agents (WP-C3 scaffold).
 */

// Types
export type {
  AgentMemoryScope,
  AgentDefinition,
  AgentContext,
  AgentRunInput,
  AgentToolCallTrace,
  AgentRunResult,
  AgentEvent,
} from "./types";

// Core classes
export { Agent } from "./agent";
export { Coordinator } from "./coordinator";
export type { CollabMode, CoordinatorResult } from "./coordinator";

// 11 built-in agent definitions
export { researchAgent } from "./builtins/research";
export { analystAgent } from "./builtins/analyst";
export { writerAgent } from "./builtins/writer";
export { coderAgent } from "./builtins/coder";
export { fileAgent } from "./builtins/file";
export { taskExecutorAgent } from "./builtins/task-executor";
export { criticAgent } from "./builtins/critic";
export { plannerAgent } from "./builtins/planner";
export { monetizationAgent } from "./builtins/monetization";
export { uxAgent } from "./builtins/ux";
export { securityAgent } from "./builtins/security";

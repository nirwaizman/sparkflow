// Public surface of @sparkflow/llm.
// Re-exports are intentionally exhaustive — call sites should import from
// "@sparkflow/llm" and never reach into individual modules.

export * from "./types";
export * from "./errors";
export {
  generate,
  selectProvider,
  defaultModel,
  fallbackOrder,
  __setProviderForTests,
} from "./gateway";
export { generateStream } from "./stream";
export {
  generateObject,
  generateObjectHelper,
  __setGenerateObjectForTests,
} from "./structured";
export type {
  GenerateObjectArgs,
  GenerateObjectResult,
} from "./structured";
export { defineTool, executeToolCalls } from "./tools";
export {
  heuristicRoute,
  classifyWithLlm,
} from "./router";
export type { ClassifyOptions } from "./router";
export { SYSTEM_PROMPT, ROUTER_PROMPT, buildGroundingBlock } from "./prompts";
export {
  estimateCost,
  PRICING,
} from "./pricing";
export type { ModelPricing } from "./pricing";

// Providers are exported for advanced call sites that need to pin behaviour
// (e.g. tests, per-route provider selection).
export { openaiProvider } from "./providers/openai";
export { anthropicProvider } from "./providers/anthropic";
export { googleProvider } from "./providers/google";
export { groqProvider } from "./providers/groq";
export { mockProvider } from "./providers/mock";

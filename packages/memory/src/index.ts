// Public surface of @sparkflow/memory (WP-B3).
//
// Consumers should import everything from "@sparkflow/memory" and never reach
// into individual modules — the barrel is the contract.

export * from "./types";
export { SessionMemory } from "./session";
export { InMemoryStore } from "./stores/memory";
export { PostgresMemoryStore } from "./stores/postgres";
export type { PostgresMemoryStoreOptions } from "./stores/postgres";
export { MemoryEngine } from "./engine";
export type {
  MemoryEngineOptions,
  RememberArgs,
  RecallArgs,
  ForgetArgs,
  ListArgs,
} from "./engine";
export { extractFacts } from "./extractor";
export type { ExtractedFact } from "./extractor";

import type { AgentDefinition } from "../types";

/**
 * The generalist agent. Allowed to call every non-destructive tool in the
 * core set. Destructive / costly tools are excluded by default; they
 * still need explicit approval to join the allow-list here.
 *
 * Non-destructive subset rationale:
 *   - search_web / scrape_url / summarize_text / generate_text — pure reads / pure gen
 *   - retrieve_memory — read-only
 *   - parse_file — read-only
 *   - create_document / export_file — produce new artifacts (idempotent
 *     from the user's perspective; nothing is overwritten)
 *   - generate_image — produces a new asset; behind an auth gate at the
 *     tool layer, but not destructive
 *
 * Excluded:
 *   - run_code (sandbox side-effects, not yet implemented)
 *   - save_memory (writes to persistent memory)
 */
export const taskExecutorAgent: AgentDefinition = {
  id: "task-executor",
  name: "Task Executor Agent",
  role: "Generalist task runner",
  objective:
    "Execute a concrete user task end-to-end using any non-destructive tool available.",
  systemPrompt: [
    "You are SparkFlow's Task Executor agent.",
    "Decompose the user's task, choose the right tools, and produce a final",
    "artifact. Prefer retrieving memory and existing context before",
    "searching externally. Never perform destructive or irreversible actions",
    "without explicit confirmation.",
  ].join(" "),
  tools: [
    "search_web",
    "scrape_url",
    "summarize_text",
    "generate_text",
    "retrieve_memory",
    "parse_file",
    "generate_image",
    "create_document",
    "export_file",
  ],
  memoryScope: "workspace",
  temperature: 0.4,
};

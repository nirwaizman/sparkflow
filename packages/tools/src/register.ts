import { registry as defaultRegistry, ToolRegistry } from "./registry";
import { searchWebTool } from "./core/search-web";
import { scrapeUrlTool } from "./core/scrape-url";
import { summarizeTextTool } from "./core/summarize-text";
import { generateTextTool } from "./core/generate-text";
import { runCodeTool } from "./core/run-code";
import { parseFileTool } from "./core/parse-file";
import { retrieveMemoryTool } from "./core/retrieve-memory";
import { saveMemoryTool } from "./core/save-memory";
import { generateImageTool } from "./core/generate-image";
import { createDocumentTool } from "./core/create-document";
import { exportFileTool } from "./core/export-file";
import type { ToolRegistration } from "./types";

/** The 11 core tools shipped with WP-C1. */
export const CORE_TOOLS: ToolRegistration[] = [
  searchWebTool as ToolRegistration,
  scrapeUrlTool as ToolRegistration,
  summarizeTextTool as ToolRegistration,
  generateTextTool as ToolRegistration,
  runCodeTool as ToolRegistration,
  parseFileTool as ToolRegistration,
  retrieveMemoryTool as ToolRegistration,
  saveMemoryTool as ToolRegistration,
  generateImageTool as ToolRegistration,
  createDocumentTool as ToolRegistration,
  exportFileTool as ToolRegistration,
];

/**
 * Register the 11 core tools on a registry (default: the package
 * singleton). Idempotent only per-registry: if called twice on the same
 * registry instance, the second call will throw from `add()`.
 */
export function registerCoreTools(target: ToolRegistry = defaultRegistry): ToolRegistry {
  for (const reg of CORE_TOOLS) {
    if (!target.has(reg.tool.name)) {
      target.add(reg);
    }
  }
  return target;
}

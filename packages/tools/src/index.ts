/**
 * Public entrypoint for @sparkflow/tools (WP-C1).
 */

// Types
export type {
  ToolDefinition,
  ToolCategory,
  ToolSafetyPolicy,
  ToolRegistration,
} from "./types";

// Registry
export { ToolRegistry, registry } from "./registry";

// Registration helpers
export { registerCoreTools, CORE_TOOLS } from "./register";

// Logging wrapper
export { wrapWithLogging } from "./logging";

// Individual core tools (exported for direct use / testing)
export { searchWebTool } from "./core/search-web";
export { scrapeUrlTool } from "./core/scrape-url";
export { summarizeTextTool } from "./core/summarize-text";
export { generateTextTool } from "./core/generate-text";
export { runCodeTool } from "./core/run-code";
export { parseFileTool } from "./core/parse-file";
export { retrieveMemoryTool } from "./core/retrieve-memory";
export { saveMemoryTool } from "./core/save-memory";
export { generateImageTool } from "./core/generate-image";
export { createDocumentTool } from "./core/create-document";
export { exportFileTool } from "./core/export-file";

// Per-tool result types (handy for consumers)
export type { SearchWebResult } from "./core/search-web";
export type { ScrapeUrlResult } from "./core/scrape-url";
export type { SummarizeTextResult } from "./core/summarize-text";
export type { GenerateTextResult } from "./core/generate-text";
export type { RunCodeResult } from "./core/run-code";
export type { ParseFileResult } from "./core/parse-file";
export type { MemoryHit } from "./core/retrieve-memory";
export type { SaveMemoryResult } from "./core/save-memory";
export type { GenerateImageResult } from "./core/generate-image";
export type { CreateDocumentResult } from "./core/create-document";
export type { ExportFileResult } from "./core/export-file";

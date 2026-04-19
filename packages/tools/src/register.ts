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

// Extended tool registry (WP-C2+): research, content, files, integrations, utilities.
import { webBrowseTool } from "./core/web-browse";
import { extractTextTool } from "./core/extract-text";
import { wikipediaSearchTool } from "./core/wikipedia-search";
import { arxivSearchTool } from "./core/arxiv-search";
import { hackerNewsTopTool } from "./core/hacker-news-top";
import { translateTextTool } from "./core/translate-text";
import { summarizeUrlTool } from "./core/summarize-url";
import { transcribeAudioTool } from "./core/transcribe-audio";
import { generateSlidesTool } from "./core/generate-slides";
import { generateSheetTool } from "./core/generate-sheet";
import { generateDocumentTool } from "./core/generate-document";
import { readFileChunksTool } from "./core/read-file-chunks";
import { summarizeFileTool } from "./core/summarize-file";
import { compareFilesTool } from "./core/compare-files";
import { gmailSearchTool } from "./core/gmail-search";
import { driveSearchTool } from "./core/drive-search";
import { calendarNextEventsTool } from "./core/calendar-next-events";
import { sendEmailTool } from "./core/send-email";
import { mathTool } from "./core/math";
import { dateDiffTool } from "./core/date-diff";
import { urlCheckTool } from "./core/url-check";

import type { ToolRegistration } from "./types";

/** The 11 original core tools shipped with WP-C1. */
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

/** Tools added in the "80+ Genspark parity" expansion. */
export const EXTENDED_TOOLS: ToolRegistration[] = [
  webBrowseTool as ToolRegistration,
  extractTextTool as ToolRegistration,
  wikipediaSearchTool as ToolRegistration,
  arxivSearchTool as ToolRegistration,
  hackerNewsTopTool as ToolRegistration,
  translateTextTool as ToolRegistration,
  summarizeUrlTool as ToolRegistration,
  transcribeAudioTool as ToolRegistration,
  generateSlidesTool as ToolRegistration,
  generateSheetTool as ToolRegistration,
  generateDocumentTool as ToolRegistration,
  readFileChunksTool as ToolRegistration,
  summarizeFileTool as ToolRegistration,
  compareFilesTool as ToolRegistration,
  gmailSearchTool as ToolRegistration,
  driveSearchTool as ToolRegistration,
  calendarNextEventsTool as ToolRegistration,
  sendEmailTool as ToolRegistration,
  mathTool as ToolRegistration,
  dateDiffTool as ToolRegistration,
  urlCheckTool as ToolRegistration,
];

/** Every tool ships as "core" today. Callers should prefer `ALL_TOOLS`. */
export const ALL_TOOLS: ToolRegistration[] = [...CORE_TOOLS, ...EXTENDED_TOOLS];

/**
 * Register all tools on a registry (default: the package singleton).
 * Idempotent per-registry: skips tools already present.
 */
export function registerCoreTools(target: ToolRegistry = defaultRegistry): ToolRegistry {
  for (const reg of ALL_TOOLS) {
    if (!target.has(reg.tool.name)) {
      target.add(reg);
    }
  }
  return target;
}

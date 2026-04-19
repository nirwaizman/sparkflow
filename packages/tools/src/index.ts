/**
 * Public entrypoint for @sparkflow/tools.
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
export {
  registerCoreTools,
  CORE_TOOLS,
  EXTENDED_TOOLS,
  ALL_TOOLS,
} from "./register";

// Logging wrapper
export { wrapWithLogging } from "./logging";

// Original core tools (WP-C1)
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

// Extended tools
export { webBrowseTool } from "./core/web-browse";
export { extractTextTool } from "./core/extract-text";
export { wikipediaSearchTool } from "./core/wikipedia-search";
export { arxivSearchTool } from "./core/arxiv-search";
export { hackerNewsTopTool } from "./core/hacker-news-top";
export { translateTextTool } from "./core/translate-text";
export { summarizeUrlTool } from "./core/summarize-url";
export { transcribeAudioTool } from "./core/transcribe-audio";
export { generateSlidesTool } from "./core/generate-slides";
export { generateSheetTool } from "./core/generate-sheet";
export { generateDocumentTool } from "./core/generate-document";
export { readFileChunksTool } from "./core/read-file-chunks";
export { summarizeFileTool } from "./core/summarize-file";
export { compareFilesTool } from "./core/compare-files";
export { gmailSearchTool } from "./core/gmail-search";
export { driveSearchTool } from "./core/drive-search";
export { calendarNextEventsTool } from "./core/calendar-next-events";
export { sendEmailTool } from "./core/send-email";
export { mathTool } from "./core/math";
export { dateDiffTool } from "./core/date-diff";
export { urlCheckTool } from "./core/url-check";

// Per-tool result types (original)
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

// Per-tool result types (extended)
export type { WebBrowseResult } from "./core/web-browse";
export type { ExtractTextResult } from "./core/extract-text";
export type { WikipediaSearchResult } from "./core/wikipedia-search";
export type { ArxivSearchResult } from "./core/arxiv-search";
export type { HackerNewsItem } from "./core/hacker-news-top";
export type { TranslateTextResult } from "./core/translate-text";
export type { SummarizeUrlResult } from "./core/summarize-url";
export type { TranscribeAudioResult } from "./core/transcribe-audio";
export type { GenerateSlidesResult } from "./core/generate-slides";
export type { GenerateSheetResult } from "./core/generate-sheet";
export type { GenerateDocumentResult } from "./core/generate-document";
export type { ReadFileChunksResult } from "./core/read-file-chunks";
export type { SummarizeFileResult } from "./core/summarize-file";
export type { CompareFilesResult } from "./core/compare-files";
export type { GmailSearchResult } from "./core/gmail-search";
export type { DriveSearchResult } from "./core/drive-search";
export type { CalendarNextEventsResult, CalendarEvent } from "./core/calendar-next-events";
export type { SendEmailResult } from "./core/send-email";
export type { MathResult } from "./core/math";
export type { DateDiffResult } from "./core/date-diff";
export type { UrlCheckResult } from "./core/url-check";

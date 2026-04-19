/**
 * OpenRouter meta-provider adapter. OpenRouter proxies dozens of underlying
 * models behind a single OpenAI-compatible endpoint; the `model` string is
 * passed through verbatim (e.g. "anthropic/claude-3.5-sonnet",
 * "meta-llama/llama-3.3-70b-instruct", ...). Reads `OPENROUTER_API_KEY`.
 *
 * Optional `OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` populate the
 * HTTP-Referer and X-Title headers OpenRouter uses for analytics.
 */

import { makeOpenAiCompatProvider } from "./_openaiCompat";

export const openrouterProvider = makeOpenAiCompatProvider({
  provider: "openrouter",
  envVar: "OPENROUTER_API_KEY",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  // Safe, widely-available default; callers normally pass an explicit model.
  defaultModel: "openrouter/auto",
  extraHeaders: () => {
    const headers: Record<string, string> = {};
    const referer = process.env.OPENROUTER_SITE_URL;
    const title = process.env.OPENROUTER_APP_NAME;
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-Title"] = title;
    return headers;
  },
});

/**
 * xAI (Grok) adapter. Grok's API is OpenAI-compatible; we call
 * https://api.x.ai/v1/chat/completions with a bearer token. Reads `XAI_API_KEY`.
 */

import { makeOpenAiCompatProvider } from "./_openaiCompat";

export const xaiProvider = makeOpenAiCompatProvider({
  provider: "xai",
  envVar: "XAI_API_KEY",
  endpoint: "https://api.x.ai/v1/chat/completions",
  defaultModel: "grok-2-latest",
});

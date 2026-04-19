/**
 * DeepSeek adapter. OpenAI-compatible endpoint at
 * https://api.deepseek.com/v1/chat/completions. Reads `DEEPSEEK_API_KEY`.
 */

import { makeOpenAiCompatProvider } from "./_openaiCompat";

export const deepseekProvider = makeOpenAiCompatProvider({
  provider: "deepseek",
  envVar: "DEEPSEEK_API_KEY",
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  defaultModel: "deepseek-chat",
});

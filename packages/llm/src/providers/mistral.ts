/**
 * Mistral AI adapter. Uses the OpenAI-compatible chat-completions endpoint at
 * https://api.mistral.ai/v1/chat/completions via raw fetch so we don't take a
 * new SDK dependency. Reads `MISTRAL_API_KEY` from the environment.
 */

import { makeOpenAiCompatProvider } from "./_openaiCompat";

export const mistralProvider = makeOpenAiCompatProvider({
  provider: "mistral",
  envVar: "MISTRAL_API_KEY",
  endpoint: "https://api.mistral.ai/v1/chat/completions",
  defaultModel: "mistral-medium-latest",
});

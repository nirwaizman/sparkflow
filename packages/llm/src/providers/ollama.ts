/**
 * Ollama adapter. Talks to a local Ollama server via its OpenAI-compatible
 * surface (default http://localhost:11434/v1/chat/completions). Override the
 * base URL with `OLLAMA_BASE_URL` if running elsewhere. No API key required
 * — the "OLLAMA_API_KEY" env var is optional and only honoured by servers that
 * enforce bearer auth.
 */

import { makeOpenAiCompatProvider } from "./_openaiCompat";

const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export const ollamaProvider = makeOpenAiCompatProvider({
  provider: "ollama",
  envVar: "OLLAMA_API_KEY",
  endpoint: `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
  defaultModel: "llama3.1",
  keyOptional: true,
});

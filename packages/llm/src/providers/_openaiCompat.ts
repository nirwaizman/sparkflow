/**
 * Shared implementation for OpenAI-compatible chat-completions providers.
 *
 * Mistral, xAI (Grok), OpenRouter, DeepSeek and Ollama all expose the same
 * `/v1/chat/completions` wire protocol as OpenAI. Implementing one `fetch`-based
 * adapter keeps the individual provider files tiny and avoids adding new SDK
 * dependencies.
 *
 * The adapter deliberately does NOT support tool calling — the gateway already
 * routes tool-heavy work to providers with first-class AI SDK support
 * (OpenAI/Anthropic/Google/Groq). Keep this layer lean.
 */

import type { ChatMessage } from "@sparkflow/shared";
import { MissingApiKeyError, ProviderUnavailableError, isTransientStatus } from "../errors";
import { estimateCost } from "../pricing";
import type {
  GenerateArgs,
  GenerateResult,
  LlmProvider,
  LlmProviderName,
  StreamChunk,
} from "../types";

export type OpenAiCompatConfig = {
  provider: LlmProviderName;
  envVar: string;
  /** Absolute URL of the chat-completions endpoint. */
  endpoint: string;
  /** Default model id for the provider. */
  defaultModel: string;
  /**
   * When true (Ollama), an API key is not required and missing envVar is fine.
   * A placeholder key ("ollama") is sent so servers that inspect headers don't
   * reject the request.
   */
  keyOptional?: boolean;
  /** Optional extra headers (OpenRouter likes HTTP-Referer/X-Title). */
  extraHeaders?: () => Record<string, string>;
};

type OpenAiChatMessage =
  | { role: "system" | "user" | "assistant"; content: string };

function toOpenAiMessages(
  messages: ChatMessage[],
  system: string | undefined,
): OpenAiChatMessage[] {
  const out: OpenAiChatMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "tool") {
      // Represent tool results as a plain user message so the downstream
      // provider still sees the content. Tool calling isn't wired through here.
      out.push({ role: "user", content: `[tool:${m.id}] ${m.content}` });
      continue;
    }
    if (m.role === "system") {
      out.push({ role: "system", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content });
      continue;
    }
    out.push({ role: "user", content: m.content });
  }
  return out;
}

function readApiKey(cfg: OpenAiCompatConfig): string {
  const key = process.env[cfg.envVar];
  if (!key) {
    if (cfg.keyOptional) return "ollama";
    throw new MissingApiKeyError(cfg.provider, cfg.envVar);
  }
  return key;
}

function headers(cfg: OpenAiCompatConfig): Record<string, string> {
  const key = readApiKey(cfg);
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (cfg.extraHeaders) Object.assign(base, cfg.extraHeaders());
  return base;
}

function usageFor(
  cfg: OpenAiCompatConfig,
  model: string,
  promptTokens: number,
  completionTokens: number,
  startedAt: number,
) {
  return {
    provider: cfg.provider,
    model,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    costUsd: estimateCost(cfg.provider, model, promptTokens, completionTokens),
    latencyMs: Date.now() - startedAt,
  };
}

async function failIfTransient(
  cfg: OpenAiCompatConfig,
  res: Response,
): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  const status = res.status;
  if (isTransientStatus(status)) {
    throw new ProviderUnavailableError(cfg.provider, `HTTP ${status}: ${text}`, {
      status,
    });
  }
  throw new Error(`[${cfg.provider}] HTTP ${status}: ${text}`);
}

export function makeOpenAiCompatProvider(cfg: OpenAiCompatConfig): LlmProvider {
  return {
    name: cfg.provider,

    async generate(args: GenerateArgs): Promise<GenerateResult> {
      const start = Date.now();
      const model = args.model ?? cfg.defaultModel;
      const body = {
        model,
        messages: toOpenAiMessages(args.messages, args.system),
        temperature: args.temperature ?? 0.4,
        max_tokens: args.maxTokens,
        stream: false,
      };

      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify(body),
      }).catch((err) => {
        throw new ProviderUnavailableError(
          cfg.provider,
          err instanceof Error ? err.message : String(err),
          { cause: err },
        );
      });
      await failIfTransient(cfg, res);

      const json = (await res.json()) as {
        choices: Array<{
          message: { content: string };
          finish_reason?: string;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = json.choices?.[0];
      const content = choice?.message?.content ?? "";
      const promptTokens = json.usage?.prompt_tokens ?? 0;
      const completionTokens = json.usage?.completion_tokens ?? 0;

      return {
        content,
        provider: cfg.provider,
        model,
        finishReason: choice?.finish_reason,
        usage: usageFor(cfg, model, promptTokens, completionTokens, start),
      };
    },

    async *stream(args: GenerateArgs): AsyncIterable<StreamChunk> {
      const start = Date.now();
      const model = args.model ?? cfg.defaultModel;
      const body = {
        model,
        messages: toOpenAiMessages(args.messages, args.system),
        temperature: args.temperature ?? 0.4,
        max_tokens: args.maxTokens,
        stream: true,
      };

      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify(body),
      }).catch((err) => {
        throw new ProviderUnavailableError(
          cfg.provider,
          err instanceof Error ? err.message : String(err),
          { cause: err },
        );
      });
      await failIfTransient(cfg, res);

      if (!res.body) {
        yield { done: true, usage: usageFor(cfg, model, 0, 0, start) };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let promptTokens = 0;
      let completionTokens = 0;
      let finishReason: string | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
              }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield { done: false, delta };
            const fr = parsed.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
              completionTokens = parsed.usage.completion_tokens ?? completionTokens;
            }
          } catch {
            // Ignore malformed frames — providers occasionally emit keepalives.
          }
        }
      }

      yield {
        done: true,
        finishReason,
        usage: usageFor(cfg, model, promptTokens, completionTokens, start),
      };
    },
  };
}

/**
 * Streaming gateway used by Next.js route handlers.
 *
 * Contract: returns the AI SDK `streamText` result, which exposes
 * `toDataStreamResponse()` so the route can do `return result.toDataStreamResponse()`.
 *
 * The fallback chain mirrors the non-streaming gateway: we walk
 * `[preferred, ...fallbackOrder()]`, skipping providers that lack an API key.
 * We try to build the stream for each candidate in order; the first one that
 * doesn't synchronously throw wins. Per-token transient errors are not
 * transparent here — streaming retry across providers mid-stream is infeasible
 * without replaying the conversation, so callers should handle stream errors.
 */

import { streamText } from "ai";
import type { LanguageModelV1 } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { optionalEnv } from "@sparkflow/shared";
import {
  AllProvidersFailedError,
  MissingApiKeyError,
  ProviderUnavailableError,
} from "./errors";
import { toCoreMessages, toSdkTools, toSdkToolChoice } from "./providers/_shared";
import type { GenerateArgs, LlmProviderName } from "./types";
import { defaultModel, fallbackOrder } from "./gateway";

const ENV_VAR: Record<LlmProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
};

function modelFactory(name: LlmProviderName, modelId: string): LanguageModelV1 {
  const apiKey = optionalEnv(ENV_VAR[name]);
  if (!apiKey) {
    throw new MissingApiKeyError(name, ENV_VAR[name]);
  }
  switch (name) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "groq":
      return createGroq({ apiKey })(modelId);
  }
}

/**
 * Kick off a streaming generation against the first available provider in the
 * fallback chain. Returns the raw AI SDK result so callers can pipe it into
 * Next.js via `result.toDataStreamResponse()`.
 */
export function generateStream(
  args: GenerateArgs & { preferred?: LlmProviderName },
): ReturnType<typeof streamText> {
  const order: LlmProviderName[] = args.preferred
    ? [args.preferred, ...fallbackOrder().filter((n) => n !== args.preferred)]
    : fallbackOrder();

  const causes: unknown[] = [];
  for (const name of order) {
    const keyPresent = Boolean(optionalEnv(ENV_VAR[name]));
    if (!keyPresent) continue;
    try {
      const model = modelFactory(name, args.model ?? defaultModel(name));
      return streamText({
        model,
        messages: toCoreMessages(args.messages, args.system),
        temperature: args.temperature ?? 0.4,
        maxTokens: args.maxTokens,
        tools: toSdkTools(args.tools),
        toolChoice: toSdkToolChoice(args.toolChoice),
      });
    } catch (err) {
      if (err instanceof MissingApiKeyError) continue;
      if (err instanceof ProviderUnavailableError) {
        causes.push(err);
        continue;
      }
      // Treat synchronous SDK construction errors as transient for this attempt.
      causes.push(err);
      continue;
    }
  }

  throw new AllProvidersFailedError(
    "generateStream: no configured provider could start a stream.",
    causes,
  );
}

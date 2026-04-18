/**
 * OpenAI adapter using the Vercel AI SDK (`ai` + `@ai-sdk/openai`).
 * Reads `OPENAI_API_KEY` from the environment and surfaces transient 5xx/429
 * errors as `ProviderUnavailableError` so the gateway can fall back.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { optionalEnv } from "@sparkflow/shared";
import { MissingApiKeyError } from "../errors";
import type {
  GenerateArgs,
  GenerateResult,
  LlmProvider,
  StreamChunk,
} from "../types";
import {
  buildUsage,
  rethrowAsProviderError,
  toCoreMessages,
  toSdkTools,
  toSdkToolChoice,
} from "./_shared";

const PROVIDER = "openai" as const;
const DEFAULT_MODEL = "gpt-4o-mini";

function client() {
  const apiKey = optionalEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingApiKeyError(PROVIDER, "OPENAI_API_KEY");
  }
  return createOpenAI({ apiKey });
}

export const openaiProvider: LlmProvider = {
  name: PROVIDER,

  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const start = Date.now();
    const model = args.model ?? DEFAULT_MODEL;
    const openai = client();

    try {
      const result = await generateText({
        model: openai(model),
        messages: toCoreMessages(args.messages, args.system),
        temperature: args.temperature ?? 0.4,
        maxTokens: args.maxTokens,
        tools: toSdkTools(args.tools),
        toolChoice: toSdkToolChoice(args.toolChoice),
      });

      return {
        content: result.text,
        provider: PROVIDER,
        model,
        finishReason: result.finishReason,
        toolCalls: result.toolCalls?.map((c) => ({
          id: c.toolCallId,
          name: c.toolName,
          args: c.args,
        })),
        usage: buildUsage({
          provider: PROVIDER,
          model,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          startedAt: start,
        }),
      };
    } catch (err) {
      rethrowAsProviderError(PROVIDER, err);
    }
  },

  async *stream(args: GenerateArgs): AsyncIterable<StreamChunk> {
    const start = Date.now();
    const model = args.model ?? DEFAULT_MODEL;
    const openai = client();

    let result;
    try {
      result = streamText({
        model: openai(model),
        messages: toCoreMessages(args.messages, args.system),
        temperature: args.temperature ?? 0.4,
        maxTokens: args.maxTokens,
        tools: toSdkTools(args.tools),
        toolChoice: toSdkToolChoice(args.toolChoice),
      });
    } catch (err) {
      rethrowAsProviderError(PROVIDER, err);
    }

    try {
      for await (const delta of result.textStream) {
        yield { done: false, delta };
      }
      const usage = await result.usage;
      const finishReason = await result.finishReason;
      yield {
        done: true,
        finishReason,
        usage: buildUsage({
          provider: PROVIDER,
          model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          startedAt: start,
        }),
      };
    } catch (err) {
      rethrowAsProviderError(PROVIDER, err);
    }
  },
};

/**
 * Anthropic adapter using the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`).
 * Reads `ANTHROPIC_API_KEY` from the environment.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
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

const PROVIDER = "anthropic" as const;
const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

function client() {
  const apiKey = optionalEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new MissingApiKeyError(PROVIDER, "ANTHROPIC_API_KEY");
  }
  return createAnthropic({ apiKey });
}

export const anthropicProvider: LlmProvider = {
  name: PROVIDER,

  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const start = Date.now();
    const model = args.model ?? DEFAULT_MODEL;
    const anthropic = client();

    try {
      const result = await generateText({
        model: anthropic(model),
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
    const anthropic = client();

    let result;
    try {
      result = streamText({
        model: anthropic(model),
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

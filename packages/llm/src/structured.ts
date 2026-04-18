/**
 * Structured-output helper built on the AI SDK's `generateObject`.
 *
 * On zod validation failure we retry exactly once with an appended reminder
 * ("return valid JSON matching the schema"). If the second attempt still fails
 * we rethrow so the caller can decide how to handle it.
 */

import { generateObject } from "ai";
import type { LanguageModelV1 } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { ChatMessage, UsageRecord } from "@sparkflow/shared";
import { optionalEnv } from "@sparkflow/shared";
import type { z } from "zod";
import { MissingApiKeyError } from "./errors";
import { estimateCost } from "./pricing";
import { toCoreMessages } from "./providers/_shared";
import type { LlmProviderName } from "./types";
import { defaultModel, fallbackOrder } from "./gateway";

const ENV_VAR: Record<LlmProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
};

function pickProvider(preferred?: LlmProviderName): LlmProviderName | undefined {
  const order = preferred
    ? [preferred, ...fallbackOrder().filter((n) => n !== preferred)]
    : fallbackOrder();
  return order.find((n) => Boolean(optionalEnv(ENV_VAR[n])));
}

function modelFor(name: LlmProviderName, modelId: string): LanguageModelV1 {
  const apiKey = optionalEnv(ENV_VAR[name]);
  if (!apiKey) throw new MissingApiKeyError(name, ENV_VAR[name]);
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

export type GenerateObjectArgs<T> = {
  schema: z.ZodType<T>;
  system?: string;
  messages: ChatMessage[];
  model?: string;
  provider?: LlmProviderName;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateObjectResult<T> = {
  object: T;
  usage?: UsageRecord;
};

/**
 * Test-only injection point: when set, bypasses SDK calls. Used by structured.test.ts.
 */
type RawGenerate = (opts: {
  messages: unknown;
  system?: string;
  schema: z.ZodTypeAny;
}) => Promise<{ object: unknown; usage?: { promptTokens: number; completionTokens: number } }>;

let rawOverride: RawGenerate | undefined;
export function __setGenerateObjectForTests(fn: RawGenerate | undefined): void {
  rawOverride = fn;
}

export async function generateObjectHelper<T>(
  args: GenerateObjectArgs<T>,
): Promise<GenerateObjectResult<T>> {
  const provider = pickProvider(args.provider);
  const modelId =
    args.model ?? (provider ? defaultModel(provider) : defaultModel());
  const baseMessages = toCoreMessages(args.messages, args.system);

  const run = async (extraSystem?: string) => {
    if (rawOverride) {
      return rawOverride({
        messages: baseMessages,
        system: extraSystem ?? args.system,
        schema: args.schema,
      });
    }
    if (!provider) {
      throw new MissingApiKeyError(
        "openai",
        "no provider API key is configured for generateObject",
      );
    }
    const model = modelFor(provider, modelId);
    const result = await generateObject({
      model,
      schema: args.schema,
      messages: extraSystem
        ? toCoreMessages(args.messages, `${args.system ?? ""}\n\n${extraSystem}`)
        : baseMessages,
      temperature: args.temperature ?? 0.2,
      maxTokens: args.maxTokens,
    });
    return { object: result.object, usage: result.usage };
  };

  const validate = (raw: unknown): T => args.schema.parse(raw);
  const started = Date.now();

  try {
    const first = await run();
    const object = validate(first.object);
    return {
      object,
      usage: buildUsage(provider, modelId, first.usage, started),
    };
  } catch (firstErr) {
    // Retry once with an explicit schema reminder.
    const second = await run(
      "Your previous output failed validation. Return valid JSON matching the provided schema exactly. Do not include prose.",
    );
    const object = validate(second.object);
    return {
      object,
      usage: buildUsage(provider, modelId, second.usage, started),
    };
  }
}

function buildUsage(
  provider: LlmProviderName | undefined,
  model: string,
  usage: { promptTokens: number; completionTokens: number } | undefined,
  startedAt: number,
): UsageRecord | undefined {
  if (!usage || !provider) return undefined;
  return {
    provider,
    model,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    costUsd: estimateCost(provider, model, usage.promptTokens, usage.completionTokens),
    latencyMs: Date.now() - startedAt,
  };
}

// Preferred public name matches the spec verbatim.
export { generateObjectHelper as generateObject };

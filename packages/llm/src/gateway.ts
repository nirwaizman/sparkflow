/**
 * Multi-provider gateway with fallback chain.
 *
 * Selection order:
 *   [preferred, ...LLM_FALLBACK_ORDER (env, default openai,anthropic,google,groq)]
 * Providers without an API key are skipped silently. Transient upstream
 * failures (5xx/429, surfaced by adapters as ProviderUnavailableError) cause
 * the gateway to advance to the next candidate. If every provider fails the
 * gateway throws `AllProvidersFailedError` with all underlying causes.
 *
 * If no real provider has a key configured, falls back to the mock provider.
 */

import { optionalEnv } from "@sparkflow/shared";
import {
  AllProvidersFailedError,
  MissingApiKeyError,
  ProviderUnavailableError,
} from "./errors";
import { anthropicProvider } from "./providers/anthropic";
import { googleProvider } from "./providers/google";
import { groqProvider } from "./providers/groq";
import { mockProvider } from "./providers/mock";
import { openaiProvider } from "./providers/openai";
import type {
  GenerateArgs,
  GenerateResult,
  LlmProvider,
  LlmProviderName,
} from "./types";

const ALL_PROVIDERS: Record<LlmProviderName, LlmProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  groq: groqProvider,
};

const ENV_VAR: Record<LlmProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
};

const DEFAULT_MODEL: Record<LlmProviderName, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-1.5-flash",
  groq: "llama-3.3-70b-versatile",
};

const VALID: ReadonlySet<LlmProviderName> = new Set([
  "openai",
  "anthropic",
  "google",
  "groq",
]);

/**
 * Test hook — internal. Allows gateway.test.ts to swap provider implementations
 * without monkey-patching the real SDK. Not part of the public API.
 */
const overrides: Partial<Record<LlmProviderName, LlmProvider>> = {};

export function __setProviderForTests(
  name: LlmProviderName,
  provider: LlmProvider | undefined,
): void {
  if (provider === undefined) {
    delete overrides[name];
  } else {
    overrides[name] = provider;
  }
}

function getProvider(name: LlmProviderName): LlmProvider {
  return overrides[name] ?? ALL_PROVIDERS[name];
}

/**
 * Parse LLM_FALLBACK_ORDER. Defaults to openai,anthropic,google,groq.
 * Unknown entries are dropped with a console.warn; duplicates are removed.
 */
export function fallbackOrder(): LlmProviderName[] {
  const raw = optionalEnv("LLM_FALLBACK_ORDER") ?? "openai,anthropic,google,groq";
  const seen = new Set<LlmProviderName>();
  const out: LlmProviderName[] = [];
  for (const tokenRaw of raw.split(",")) {
    const token = tokenRaw.trim().toLowerCase();
    if (!token) continue;
    if (!VALID.has(token as LlmProviderName)) {
      console.warn(`[gateway] ignoring unknown provider in LLM_FALLBACK_ORDER: "${token}"`);
      continue;
    }
    const name = token as LlmProviderName;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function hasKey(name: LlmProviderName): boolean {
  return Boolean(optionalEnv(ENV_VAR[name]));
}

function orderWithPreferred(preferred?: LlmProviderName): LlmProviderName[] {
  const order = fallbackOrder();
  if (!preferred) return order;
  return [preferred, ...order.filter((n) => n !== preferred)];
}

/**
 * Pick the first provider whose API key is present. Falls back to the mock
 * provider if no real key is configured. Callers that want to assert a real
 * provider should check `result.name !== "mock"`.
 */
export function selectProvider(preferred?: LlmProviderName): LlmProvider {
  for (const name of orderWithPreferred(preferred)) {
    if (hasKey(name) || overrides[name]) {
      return getProvider(name);
    }
  }
  return mockProvider;
}

/**
 * Default chat model. Optional provider argument picks the model we ship for
 * that particular provider. Defaults to the first provider in the fallback
 * order whose key is set (OpenAI's gpt-4o-mini when everything is configured).
 */
export function defaultModel(provider?: LlmProviderName): string {
  if (provider) {
    const override = optionalEnv(`${provider.toUpperCase()}_MODEL`);
    return override ?? DEFAULT_MODEL[provider];
  }
  // Legacy env var honoured for backward compatibility with WP-A1.
  const legacy = optionalEnv("OPENAI_MODEL");
  if (legacy) return legacy;
  const first = orderWithPreferred().find((n) => hasKey(n));
  if (first) return DEFAULT_MODEL[first];
  return DEFAULT_MODEL.openai;
}

/**
 * Generate with automatic fallback. See module docstring for the selection
 * strategy. Preferred provider may be passed via args.tools? No — we keep the
 * public signature aligned with WP-A1: callers pass standard GenerateArgs.
 * A non-standard `preferredProvider` extension is read off the `model`
 * argument when prefixed with `<provider>:`.
 */
export async function generate(args: GenerateArgs): Promise<GenerateResult> {
  const { preferred, model } = parsePreferred(args.model);
  const order = orderWithPreferred(preferred);
  const causes: unknown[] = [];
  let attempted = 0;

  for (const name of order) {
    if (!hasKey(name) && !overrides[name]) {
      // Skip silently — not configured.
      continue;
    }
    attempted += 1;
    const provider = getProvider(name);
    try {
      return await provider.generate({
        ...args,
        model: model ?? args.model ?? defaultModel(name),
      });
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        // Shouldn't happen (we pre-checked) but keep defensive behaviour.
        continue;
      }
      if (err instanceof ProviderUnavailableError) {
        causes.push(err);
        continue;
      }
      throw err;
    }
  }

  if (attempted === 0) {
    // No configured real provider — degrade to mock so dev still works.
    return mockProvider.generate({ ...args, model: args.model ?? "mock-1" });
  }

  throw new AllProvidersFailedError(
    `All ${attempted} provider attempt(s) failed.`,
    causes,
  );
}

/**
 * Parse an optional `<provider>:<model>` prefix from the model argument.
 * Example: `openai:gpt-4o-mini` → { preferred: "openai", model: "gpt-4o-mini" }.
 * Plain strings pass through unchanged.
 */
function parsePreferred(
  model: string | undefined,
): { preferred?: LlmProviderName; model?: string } {
  if (!model) return {};
  const idx = model.indexOf(":");
  if (idx <= 0) return { model };
  const head = model.slice(0, idx).toLowerCase();
  const tail = model.slice(idx + 1);
  if (VALID.has(head as LlmProviderName)) {
    return { preferred: head as LlmProviderName, model: tail };
  }
  return { model };
}

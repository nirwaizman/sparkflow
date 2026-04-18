import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generate,
  __setProviderForTests,
} from "../src/gateway";
import { AllProvidersFailedError, ProviderUnavailableError } from "../src/errors";
import type { LlmProvider } from "../src/types";

function failing(name: "openai" | "anthropic" | "google" | "groq"): LlmProvider {
  return {
    name,
    async generate() {
      throw new ProviderUnavailableError(name, "simulated outage", { status: 502 });
    },
    async *stream() {
      throw new ProviderUnavailableError(name, "simulated outage", { status: 502 });
    },
  };
}

describe("gateway.generate — every provider fails", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.LLM_FALLBACK_ORDER = "openai,anthropic,google,groq";
    process.env.OPENAI_API_KEY = "k";
    process.env.ANTHROPIC_API_KEY = "k";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "k";
    process.env.GROQ_API_KEY = "k";
    __setProviderForTests("openai", failing("openai"));
    __setProviderForTests("anthropic", failing("anthropic"));
    __setProviderForTests("google", failing("google"));
    __setProviderForTests("groq", failing("groq"));
  });

  afterEach(() => {
    __setProviderForTests("openai", undefined);
    __setProviderForTests("anthropic", undefined);
    __setProviderForTests("google", undefined);
    __setProviderForTests("groq", undefined);
    process.env = { ...originalEnv };
  });

  it("throws AllProvidersFailedError with every cause collected", async () => {
    let thrown: unknown;
    try {
      await generate({
        model: "test-model",
        messages: [{ id: "1", role: "user", content: "hi" }],
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AllProvidersFailedError);
    const e = thrown as AllProvidersFailedError;
    expect(Array.isArray(e.causes)).toBe(true);
    expect(e.causes.length).toBe(4);
    for (const c of e.causes) {
      expect(c).toBeInstanceOf(ProviderUnavailableError);
    }
  });
});

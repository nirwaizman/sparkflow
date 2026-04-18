import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generate,
  __setProviderForTests,
} from "../src/gateway";
import { ProviderUnavailableError } from "../src/errors";
import type { LlmProvider } from "../src/types";

function fakeProvider(name: "openai" | "anthropic", behaviour: "fail" | "ok"): LlmProvider {
  return {
    name,
    async generate() {
      if (behaviour === "fail") {
        throw new ProviderUnavailableError(name, "simulated 503", { status: 503 });
      }
      return {
        content: `hello from ${name}`,
        provider: name,
        model: "test-model",
        finishReason: "stop",
      };
    },
    async *stream() {
      yield { done: false, delta: "x" } as const;
      yield { done: true } as const;
    },
  };
}

describe("gateway.generate fallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.LLM_FALLBACK_ORDER = "openai,anthropic";
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.ANTHROPIC_API_KEY = "sk-test-anthropic";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    __setProviderForTests("openai", undefined);
    __setProviderForTests("anthropic", undefined);
    __setProviderForTests("google", undefined);
    __setProviderForTests("groq", undefined);
    process.env = { ...originalEnv };
  });

  it("falls back from the first failing provider to the next healthy one", async () => {
    __setProviderForTests("openai", fakeProvider("openai", "fail"));
    __setProviderForTests("anthropic", fakeProvider("anthropic", "ok"));

    const result = await generate({
      model: "test-model",
      messages: [{ id: "1", role: "user", content: "hi" }],
    });

    expect(result.provider).toBe("anthropic");
    expect(result.content).toBe("hello from anthropic");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routeByTask } from "../src/gateway";
import type { LlmProviderName } from "../src/types";

const KEYS: Record<LlmProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  ollama: "OLLAMA_API_KEY",
};

const originalEnv = { ...process.env };

function setAllKeys() {
  for (const envVar of Object.values(KEYS)) {
    process.env[envVar] = `test-${envVar.toLowerCase()}`;
  }
  // Ollama is "configured" via base URL rather than an API key in production,
  // so pin it explicitly for these tests.
  process.env.OLLAMA_BASE_URL = "http://localhost:11434";
}

describe("routeByTask", () => {
  beforeEach(() => {
    // Start from a clean env so we can assert presence/absence precisely.
    for (const envVar of Object.values(KEYS)) delete process.env[envVar];
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.LLM_FALLBACK_ORDER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns groq-first order for fast tasks when all keys are present", () => {
    setAllKeys();
    const order = routeByTask("fast");
    expect(order[0]).toBe("groq");
    expect(order.slice(0, 3)).toEqual(["groq", "openai", "mistral"]);
  });

  it("prefers openai, anthropic, deepseek for reasoning tasks", () => {
    setAllKeys();
    const order = routeByTask("reasoning");
    expect(order.slice(0, 3)).toEqual(["openai", "anthropic", "deepseek"]);
  });

  it("prefers vision-capable providers for vision tasks", () => {
    setAllKeys();
    const order = routeByTask("vision");
    expect(order.slice(0, 4)).toEqual([
      "openai",
      "anthropic",
      "google",
      "mistral",
    ]);
    // Neither xAI (Grok) nor DeepSeek lead for vision work; they can still
    // appear at the tail as fallbacks but must not precede the vision-capable
    // providers.
    expect(order.indexOf("xai")).toBeGreaterThan(order.indexOf("mistral"));
  });

  it("puts anthropic, openai, deepseek first for code tasks", () => {
    setAllKeys();
    const order = routeByTask("code");
    expect(order.slice(0, 3)).toEqual(["anthropic", "openai", "deepseek"]);
  });

  it("puts free/cheap providers first for cheap tasks", () => {
    setAllKeys();
    const order = routeByTask("cheap");
    expect(order.slice(0, 4)).toEqual([
      "ollama",
      "groq",
      "deepseek",
      "mistral",
    ]);
  });

  it("returns a flagship-first order for balanced tasks", () => {
    setAllKeys();
    const order = routeByTask("balanced");
    expect(order.slice(0, 3)).toEqual(["openai", "anthropic", "google"]);
  });

  it("drops providers that have no API key configured", () => {
    // Only configure groq and mistral; everything else should disappear.
    process.env[KEYS.groq] = "k";
    process.env[KEYS.mistral] = "k";
    const order = routeByTask("fast");
    expect(order).toEqual(["groq", "mistral"]);
  });

  it("treats ollama as configured when OLLAMA_BASE_URL is set", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    const order = routeByTask("cheap");
    expect(order[0]).toBe("ollama");
  });
});

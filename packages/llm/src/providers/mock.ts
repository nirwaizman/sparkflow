import type { GenerateArgs, GenerateResult, LlmProvider } from "../types";

export const mockProvider: LlmProvider = {
  name: "openai",
  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const lastUser = [...args.messages].reverse().find((m) => m.role === "user");
    const preview = lastUser?.content.slice(0, 200) ?? "(no user message)";
    return {
      content: `[mock provider] No API key configured. Echoing prompt for dev:\n\n${preview}`,
      provider: "mock",
      model: args.model,
    };
  },
};

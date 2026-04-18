import type { ChatMessage, UsageRecord } from "@sparkflow/shared";

export type LlmProviderName = "openai" | "anthropic" | "google" | "groq";

export type GenerateArgs = {
  model: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type GenerateResult = {
  content: string;
  provider: LlmProviderName | "mock";
  model: string;
  usage?: UsageRecord;
};

export interface LlmProvider {
  readonly name: LlmProviderName;
  generate(args: GenerateArgs): Promise<GenerateResult>;
}

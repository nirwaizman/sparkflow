import { z } from "zod";
import { generate } from "@sparkflow/llm";
import type { ToolRegistration } from "../types";

/**
 * Translate arbitrary text via an LLM `generate` call. Uses a translation
 * prompt that asks for faithful, register-preserving output.
 */
const parameters = z.object({
  text: z.string().min(1).describe("Text to translate"),
  targetLanguage: z
    .string()
    .min(2)
    .describe("Target language name or BCP-47 code (e.g. 'Hebrew', 'he', 'French')"),
  sourceLanguage: z
    .string()
    .optional()
    .describe("Source language hint (optional — auto-detected if omitted)"),
  formal: z
    .boolean()
    .optional()
    .describe("Prefer formal register (default true)"),
});

type Params = z.infer<typeof parameters>;

export type TranslateTextResult = {
  translated: string;
  targetLanguage: string;
  sourceLanguage?: string;
};

export const translateTextTool: ToolRegistration<
  Params,
  TranslateTextResult
> = {
  tool: {
    name: "translate_text",
    description:
      "Translate text into a target language via LLM. Preserves meaning, tone, and formatting.",
    parameters,
    handler: async ({ text, targetLanguage, sourceLanguage, formal }) => {
      const register = formal === false ? "informal" : "formal";
      const from = sourceLanguage ? ` from ${sourceLanguage}` : "";
      const result = await generate({
        system:
          "You are a precise professional translator. Preserve meaning, nuance, and Markdown formatting. Never add commentary. Output only the translation.",
        messages: [
          {
            id: "translate_text_input",
            role: "user",
            content: `Translate the following text${from} into ${targetLanguage} (${register} register). Output ONLY the translation with no preamble:\n\n${text}`,
          },
        ],
        temperature: 0.2,
      });
      return {
        translated: result.content.trim(),
        targetLanguage,
        sourceLanguage,
      };
    },
  },
  category: "content",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};

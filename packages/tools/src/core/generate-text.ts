import { z } from "zod";
import { generate } from "@sparkflow/llm";
import type { ToolRegistration } from "../types";

/**
 * Open-ended text generation tool. Thin wrapper around
 * `@sparkflow/llm.generate` so agents can explicitly request a
 * sub-generation (e.g. writer agents composing long form).
 */
const parameters = z.object({
  prompt: z.string().min(1).describe("Primary instruction / request"),
  system: z
    .string()
    .optional()
    .describe("Optional system prompt override for tone / persona"),
});

type Params = z.infer<typeof parameters>;

export type GenerateTextResult = {
  content: string;
};

export const generateTextTool: ToolRegistration<Params, GenerateTextResult> = {
  tool: {
    name: "generate_text",
    description:
      "Generate free-form text from a prompt. Use when you need a fresh sub-generation rather than your own reply.",
    parameters,
    handler: async ({ prompt, system }) => {
      const result = await generate({
        system,
        messages: [
          { id: "generate_text_input", role: "user", content: prompt },
        ],
        temperature: 0.7,
      });
      return { content: result.content };
    },
  },
  category: "text",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};

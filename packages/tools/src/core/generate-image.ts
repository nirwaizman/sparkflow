import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Image generation. Stub returning a placeholder URL — the real provider
 * (OpenAI images / replicate / etc.) lands in WP-I?.
 */
const parameters = z.object({
  prompt: z.string().min(1).describe("Image generation prompt"),
  size: z
    .enum(["512", "1024", "1792x1024"])
    .optional()
    .describe("Output size (default: 1024)"),
});

type Params = z.infer<typeof parameters>;

export type GenerateImageResult = {
  url: string;
};

export const generateImageTool: ToolRegistration<Params, GenerateImageResult> = {
  tool: {
    name: "generate_image",
    description:
      "Generate an image from a text prompt and return a URL. Supports square and wide formats.",
    parameters,
    handler: async ({ prompt, size }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[generate_image] TODO: integrate real image provider. prompt="${prompt}" size=${size ?? "1024"}`,
      );
      return { url: "https://example.com/placeholder.png" };
    },
  },
  category: "image",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 4,
    allowInAutonomousMode: false,
  },
};

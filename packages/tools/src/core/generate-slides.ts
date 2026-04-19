import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Generate a slide deck by POSTing to our internal `/api/slides/generate`.
 */
const parameters = z.object({
  topic: z.string().min(1).describe("Deck topic / title"),
  outline: z
    .array(z.string())
    .optional()
    .describe("Optional pre-written slide outline (one item per slide)"),
  audience: z
    .string()
    .optional()
    .describe("Who the deck is for — shapes tone + depth"),
  numSlides: z
    .number()
    .int()
    .positive()
    .max(30)
    .optional()
    .describe("Target slide count (default 10)"),
  theme: z.string().optional().describe("Theme / style keyword"),
});

type Params = z.infer<typeof parameters>;

export type GenerateSlidesResult = {
  id?: string;
  url?: string;
  slides?: number;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export const generateSlidesTool: ToolRegistration<
  Params,
  GenerateSlidesResult
> = {
  tool: {
    name: "generate_slides",
    description:
      "Generate a SparkFlow slide deck. Returns the deck id + url.",
    parameters,
    handler: async (args) => {
      try {
        const res = await fetch(`${baseUrl()}/api/slides/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!res.ok) {
          return { error: `slides/generate returned ${res.status}` };
        }
        return (await res.json()) as GenerateSlidesResult;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  category: "content",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 4,
    allowInAutonomousMode: true,
  },
};

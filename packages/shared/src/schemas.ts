import { z } from "zod";

export const chatRoleSchema = z.enum(["user", "assistant", "system", "tool"]);

export const plannerModeSchema = z.enum([
  "chat",
  "search",
  "research",
  "task",
  "agent_team",
  "file",
  "code",
  "image",
  "memory",
  "workflow",
  "legal",
]);

export const sourceItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  favicon: z.string().url().optional(),
  publishedAt: z.string().optional(),
});

export const chatMessageSchema = z.object({
  id: z.string(),
  role: chatRoleSchema,
  content: z.string().min(1),
  sources: z.array(sourceItemSchema).optional(),
  mode: plannerModeSchema.optional(),
  createdAt: z.string().optional(),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  forceSearch: z.boolean().optional(),
  conversationId: z.string().optional(),
});

export const plannerDecisionSchema = z.object({
  mode: plannerModeSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  tools: z.array(z.string()),
  complexity: z.enum(["low", "medium", "high"]),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { PlannerMode } from "@sparkflow/shared";
import { conversations } from "./conversations";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system", "tool"]);
export type MessageRole = (typeof messageRoleEnum.enumValues)[number];

/**
 * `mode` stores a PlannerMode. We keep it as free text (rather than a pg
 * enum) on purpose: new planner modes ship in the shared package and we
 * don't want every addition to require a DB migration. The $type<>() cast
 * narrows it back to PlannerMode on reads.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    mode: text("mode").$type<PlannerMode>(),
    toolCalls: jsonb("tool_calls"),
    parentMessageId: uuid("parent_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index("messages_conversation_idx").on(t.conversationId),
    createdAtIdx: index("messages_created_at_idx").on(t.createdAt),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

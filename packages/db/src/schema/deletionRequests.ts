import { pgTable, uuid, timestamp, text, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";

export const deletionStatusEnum = pgEnum("deletion_status", [
  "pending",
  "executed",
  "cancelled",
]);

/**
 * GDPR right-to-be-forgotten: stores 30-day soft-delete requests per user.
 * `executeDeletion(token)` marks this row `executed` and cascades.
 */
export const deletionRequests = pgTable("deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  token: text("token").notNull().unique(),
  status: deletionStatusEnum("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeletionRequest = typeof deletionRequests.$inferSelect;
export type DeletionRequestInsert = typeof deletionRequests.$inferInsert;

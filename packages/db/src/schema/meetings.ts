import { pgTable, uuid, text, timestamp, jsonb, pgEnum, integer, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const meetingStatusEnum = pgEnum("meeting_status", [
  "uploaded",
  "processing",
  "ready",
  "failed",
]);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    storagePath: text("storage_path").notNull(),
    mime: text("mime").notNull(),
    durationSec: integer("duration_sec"),
    status: meetingStatusEnum("status").notNull().default("uploaded"),
    error: text("error"),
    transcript: jsonb("transcript").$type<{
      text: string;
      segments?: Array<{ start: number; end: number; text: string; speaker?: string }>;
      language?: string;
    } | null>(),
    notes: jsonb("notes").$type<{
      summary: string;
      actionItems: string[];
      decisions: string[];
      participants: string[];
      topics: string[];
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("meetings_org_idx").on(t.organizationId),
    statusIdx: index("meetings_status_idx").on(t.status),
  }),
);

export type Meeting = typeof meetings.$inferSelect;
export type MeetingInsert = typeof meetings.$inferInsert;

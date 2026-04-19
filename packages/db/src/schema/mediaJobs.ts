import { pgTable, uuid, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const mediaJobKindEnum = pgEnum("media_job_kind", ["image", "video", "music"]);

export const mediaJobStatusEnum = pgEnum("media_job_status", [
  "queued",
  "processing",
  "ready",
  "failed",
]);

export const mediaJobs = pgTable(
  "media_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: mediaJobKindEnum("kind").notNull(),
    provider: text("provider").notNull(), // "openai" | "replicate" | "google" | "suno" | "elevenlabs" ...
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
    providerJobId: text("provider_job_id"),
    status: mediaJobStatusEnum("status").notNull().default("queued"),
    storagePath: text("storage_path"),
    bucket: text("bucket"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("media_jobs_org_idx").on(t.organizationId),
    statusIdx: index("media_jobs_status_idx").on(t.status),
    kindIdx: index("media_jobs_kind_idx").on(t.kind),
  }),
);

export type MediaJob = typeof mediaJobs.$inferSelect;
export type MediaJobInsert = typeof mediaJobs.$inferInsert;

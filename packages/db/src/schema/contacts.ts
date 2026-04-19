import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    industry: text("industry"),
    tags: text("tags").array().notNull().default([] as string[]),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("contacts_org_idx").on(t.organizationId),
    orgEmailIdx: index("contacts_org_email_idx").on(t.organizationId, t.email),
  }),
);

export const contactActivities = pgTable(
  "contact_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "message" | "meeting" | "task" | "call" | "email"
    title: text("title").notNull(),
    link: text("link"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    contactIdx: index("contact_activities_contact_idx").on(t.contactId),
    occurredIdx: index("contact_activities_occurred_idx").on(t.occurredAt),
  }),
);

export type Contact = typeof contacts.$inferSelect;
export type ContactInsert = typeof contacts.$inferInsert;
export type ContactActivity = typeof contactActivities.$inferSelect;

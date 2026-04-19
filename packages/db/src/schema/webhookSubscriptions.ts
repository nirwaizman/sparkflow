import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/** Outgoing webhook subscriptions for /api/webhooks. */
export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: text("events").array().notNull().default([] as string[]),
    secret: text("secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    failureCount: text("failure_count").notNull().default("0"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("webhook_subscriptions_org_idx").on(t.organizationId),
  }),
);

export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type WebhookSubscriptionInsert = typeof webhookSubscriptions.$inferInsert;

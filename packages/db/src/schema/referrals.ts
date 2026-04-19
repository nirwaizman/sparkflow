import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Referral codes owned by a user. */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("referrals_owner_idx").on(t.ownerUserId),
  }),
);

/** Attribution: records which user signed up via which code. */
export const referralAttributions = pgTable(
  "referral_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
    rewardAmountCents: text("reward_amount_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    referralIdx: index("referral_attributions_referral_idx").on(t.referralId),
    referredUniq: uniqueIndex("referral_attributions_referred_uniq").on(t.referredUserId),
  }),
);

export type Referral = typeof referrals.$inferSelect;
export type ReferralAttribution = typeof referralAttributions.$inferSelect;

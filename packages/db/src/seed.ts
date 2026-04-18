/**
 * Idempotent dev seed.
 *
 * Inserts a demo org, a demo user, one owner membership, a conversation
 * and two messages. Safe to run repeatedly — every insert uses
 * `onConflictDoNothing` against a natural unique key (slug, email,
 * composite PK, etc.). No deletes, no updates.
 *
 * Usage: `pnpm -C packages/db db:seed` (requires DATABASE_URL).
 */
import { createDb, closeDb } from "./client";
import {
  organizations,
  users,
  memberships,
  conversations,
  messages,
} from "./schema";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000002";
const DEMO_CONVERSATION_ID = "00000000-0000-0000-0000-000000000003";

async function main(): Promise<void> {
  const { db, client } = createDb();
  try {
    await db.insert(organizations).values({
      id: DEMO_ORG_ID,
      name: "SparkFlow Demo",
      slug: "sparkflow-demo",
    }).onConflictDoNothing();

    await db.insert(users).values({
      id: DEMO_USER_ID,
      email: "demo@sparkflow.local",
      displayName: "Demo User",
      locale: "he",
      defaultOrganizationId: DEMO_ORG_ID,
    }).onConflictDoNothing();

    await db.insert(memberships).values({
      userId: DEMO_USER_ID,
      organizationId: DEMO_ORG_ID,
      role: "owner",
    }).onConflictDoNothing();

    await db.insert(conversations).values({
      id: DEMO_CONVERSATION_ID,
      organizationId: DEMO_ORG_ID,
      userId: DEMO_USER_ID,
      title: "Welcome to SparkFlow",
    }).onConflictDoNothing();

    await db.insert(messages).values({
      id: "00000000-0000-0000-0000-000000000004",
      conversationId: DEMO_CONVERSATION_ID,
      role: "user",
      content: "Hello SparkFlow!",
      mode: "chat",
    }).onConflictDoNothing();

    await db.insert(messages).values({
      id: "00000000-0000-0000-0000-000000000005",
      conversationId: DEMO_CONVERSATION_ID,
      role: "assistant",
      content: "Hi! I'm ready to help. Try asking me to research a topic or build a workflow.",
      mode: "chat",
    }).onConflictDoNothing();

    // eslint-disable-next-line no-console
    console.log("[seed] done");
  } finally {
    await client.end({ timeout: 5 });
    await closeDb();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed:", err);
  process.exit(1);
});

/**
 * Account deletion / right-to-be-forgotten.
 *
 * `requestDeletion` schedules a soft delete: it stores a pending record in
 * a module-level Map keyed by a random token. After `softDays` (default
 * 30) the record becomes eligible for `executeDeletion`, which tears down
 * the user's tenant-scoped rows.
 *
 * TODO(compliance/db): migrate `deletion_requests` from this in-memory Map
 * to a persistent Drizzle table (same columns) so that scheduling survives
 * process restarts and can be driven by a cron worker across instances.
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  conversations,
  files,
  getDb,
  memories,
  messages,
} from "@sparkflow/db";

export interface DeletionRequest {
  token: string;
  userId: string;
  organizationId: string;
  requestedAt: Date;
  scheduledAt: Date;
  executedAt: Date | null;
}

export interface RequestDeletionOptions {
  softDays?: number;
}

export interface RequestDeletionResult {
  token: string;
  scheduledAt: Date;
}

export interface ExecuteDeletionResult {
  token: string;
  userId: string;
  organizationId: string;
  executedAt: Date;
  removed: {
    conversations: number;
    messages: number;
    files: number;
    memories: number;
  };
}

// TODO(compliance/db): replace this in-memory Map with a `deletion_requests`
// Drizzle table so scheduling is durable and cross-process.
const deletion_requests: Map<string, DeletionRequest> = new Map();

function mintToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function requestDeletion(
  userId: string,
  organizationId: string,
  opts: RequestDeletionOptions = {},
): Promise<RequestDeletionResult> {
  const softDays = opts.softDays ?? 30;
  const requestedAt = new Date();
  const scheduledAt = new Date(requestedAt.getTime() + softDays * 24 * 60 * 60 * 1000);
  const token = mintToken();

  deletion_requests.set(token, {
    token,
    userId,
    organizationId,
    requestedAt,
    scheduledAt,
    executedAt: null,
  });

  return { token, scheduledAt };
}

export function getDeletionRequest(token: string): DeletionRequest | undefined {
  return deletion_requests.get(token);
}

export function listDeletionRequests(): DeletionRequest[] {
  return Array.from(deletion_requests.values());
}

export async function executeDeletion(token: string): Promise<ExecuteDeletionResult> {
  const req = deletion_requests.get(token);
  if (!req) {
    throw new Error(`deletion_request_not_found: ${token}`);
  }
  if (req.executedAt) {
    throw new Error(`deletion_request_already_executed: ${token}`);
  }

  const db = getDb();
  const { userId, organizationId } = req;

  // Gather conversation ids so we can delete their messages first. We do
  // this even though schema has ON DELETE CASCADE — explicit deletion
  // gives us a reliable row count to return to the caller.
  const convoRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.userId, userId),
      ),
    );

  let messagesRemoved = 0;
  for (const { id } of convoRows) {
    const deleted = await db
      .delete(messages)
      .where(eq(messages.conversationId, id))
      .returning({ id: messages.id });
    messagesRemoved += deleted.length;
  }

  const convosDeleted = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.userId, userId),
      ),
    )
    .returning({ id: conversations.id });

  const filesDeleted = await db
    .delete(files)
    .where(
      and(eq(files.organizationId, organizationId), eq(files.userId, userId)),
    )
    .returning({ id: files.id });

  const memoriesDeleted = await db
    .delete(memories)
    .where(
      and(
        eq(memories.organizationId, organizationId),
        eq(memories.userId, userId),
      ),
    )
    .returning({ id: memories.id });

  const executedAt = new Date();
  deletion_requests.set(token, { ...req, executedAt });

  return {
    token,
    userId,
    organizationId,
    executedAt,
    removed: {
      conversations: convosDeleted.length,
      messages: messagesRemoved,
      files: filesDeleted.length,
      memories: memoriesDeleted.length,
    },
  };
}

/** Test-only: reset the in-memory store. Exposed for unit tests. */
export function __resetDeletionRequestsForTests(): void {
  deletion_requests.clear();
}

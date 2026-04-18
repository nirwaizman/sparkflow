/**
 * Core types for @sparkflow/memory.
 *
 * The four memory scopes mirror the `memory_scope` enum in `@sparkflow/db`.
 *
 *   - session   — ephemeral, request/conversation-scoped facts.
 *   - user      — facts about a single user, durable across sessions.
 *   - workspace — facts shared across users in the same organization.
 *   - global    — platform-wide facts available to any tenant.
 */
export type MemoryScope = "session" | "user" | "workspace" | "global";

/**
 * Row-shape returned from a store. Mirrors `memories.$inferSelect` but exposed
 * as a plain TS interface so callers don't depend on drizzle types.
 */
export interface MemoryEntry {
  id: string;
  organizationId: string;
  userId: string;
  scope: MemoryScope;
  key: string;
  value: string;
  embedding?: number[] | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant context required to read or write a memory row.
 */
export interface MemoryContext {
  organizationId: string;
  userId: string;
}

export interface MemoryQuery {
  query: string;
  scope?: MemoryScope;
  topK?: number;
  minScore?: number;
}

export interface MemoryMatch {
  entry: MemoryEntry;
  score: number;
}

export interface MemoryListOptions {
  scope?: MemoryScope;
}

export interface MemorySimilarityOptions {
  scope?: MemoryScope;
  topK?: number;
}

/**
 * Storage contract. Concrete stores live under `./stores/*`.
 *
 * `put` is an upsert keyed by `(organizationId, userId, scope, key)` — that
 * unique index is defined at the database level in `@sparkflow/db`.
 */
export interface MemoryStore {
  get(
    key: string,
    ctx: MemoryContext,
    scope: MemoryScope,
  ): Promise<MemoryEntry | null>;

  put(
    entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<MemoryEntry>;

  delete(id: string, ctx: MemoryContext): Promise<void>;

  list(
    ctx: MemoryContext,
    options?: MemoryListOptions,
  ): Promise<MemoryEntry[]>;

  similarity(
    query: number[],
    ctx: MemoryContext,
    options: MemorySimilarityOptions,
  ): Promise<MemoryMatch[]>;
}

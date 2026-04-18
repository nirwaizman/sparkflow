/**
 * PostgresMemoryStore — a `MemoryStore` backed by Drizzle + pgvector.
 *
 * Reads/writes go through the `memories` table defined in `@sparkflow/db`.
 * Similarity search uses the pgvector cosine operator (`<=>`) and the
 * IVFFlat index created by `POST_MIGRATION_SQL` in the db package.
 *
 * Scope visibility rules mirror `InMemoryStore`:
 *
 *   - session + user → org+user must match the caller.
 *   - workspace      → only org must match.
 *   - global         → no isolation; visible to every caller.
 */
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { memories, getDb, type Database } from "@sparkflow/db";
import type {
  MemoryContext,
  MemoryEntry,
  MemoryListOptions,
  MemoryMatch,
  MemoryScope,
  MemorySimilarityOptions,
  MemoryStore,
} from "../types";

type Row = typeof memories.$inferSelect;

function rowToEntry(row: Row): MemoryEntry {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    scope: row.scope,
    key: row.key,
    value: row.value,
    embedding: row.embedding ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function scopeFilter(scope: MemoryScope, ctx: MemoryContext): SQL {
  switch (scope) {
    case "session":
    case "user":
      return and(
        eq(memories.scope, scope),
        eq(memories.organizationId, ctx.organizationId),
        eq(memories.userId, ctx.userId),
      ) as SQL;
    case "workspace":
      return and(
        eq(memories.scope, scope),
        eq(memories.organizationId, ctx.organizationId),
      ) as SQL;
    case "global":
      return eq(memories.scope, scope);
  }
}

/**
 * Build a filter matching every scope visible to the caller. Used when the
 * caller asks for similarity/list without specifying a scope.
 */
function anyScopeFilter(ctx: MemoryContext): SQL {
  // (org=ctx AND user=ctx AND scope IN (session,user))
  // OR (org=ctx AND scope = workspace)
  // OR (scope = global)
  return sql`(
    (${memories.organizationId} = ${ctx.organizationId}
      AND ${memories.userId} = ${ctx.userId}
      AND ${memories.scope} IN ('session','user'))
    OR (${memories.organizationId} = ${ctx.organizationId}
      AND ${memories.scope} = 'workspace')
    OR (${memories.scope} = 'global')
  )`;
}

export interface PostgresMemoryStoreOptions {
  db?: Database;
}

export class PostgresMemoryStore implements MemoryStore {
  private readonly db: Database;

  constructor(options: PostgresMemoryStoreOptions = {}) {
    this.db = options.db ?? getDb();
  }

  async get(
    key: string,
    ctx: MemoryContext,
    scope: MemoryScope,
  ): Promise<MemoryEntry | null> {
    const rows = await this.db
      .select()
      .from(memories)
      .where(and(scopeFilter(scope, ctx), eq(memories.key, key)))
      .limit(1);
    const hit = rows[0];
    return hit ? rowToEntry(hit) : null;
  }

  async put(
    entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<MemoryEntry> {
    // Upsert on the composite unique index `(org, user, scope, key)`.
    const inserted = await this.db
      .insert(memories)
      .values({
        ...(entry.id ? { id: entry.id } : {}),
        organizationId: entry.organizationId,
        userId: entry.userId,
        scope: entry.scope,
        key: entry.key,
        value: entry.value,
        embedding: entry.embedding ?? null,
      })
      .onConflictDoUpdate({
        target: [
          memories.organizationId,
          memories.userId,
          memories.scope,
          memories.key,
        ],
        set: {
          value: entry.value,
          embedding: entry.embedding ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      throw new Error("[PostgresMemoryStore] upsert returned no rows");
    }
    return rowToEntry(row);
  }

  async delete(id: string, ctx: MemoryContext): Promise<void> {
    // Tenant isolation: only allow deletes within the caller's org. For
    // session/user rows we additionally require the userId to match.
    await this.db.delete(memories).where(
      and(
        eq(memories.id, id),
        eq(memories.organizationId, ctx.organizationId),
        sql`(
          ${memories.scope} IN ('workspace','global')
          OR ${memories.userId} = ${ctx.userId}
        )`,
      ),
    );
  }

  async list(
    ctx: MemoryContext,
    options: MemoryListOptions = {},
  ): Promise<MemoryEntry[]> {
    const where = options.scope
      ? scopeFilter(options.scope, ctx)
      : anyScopeFilter(ctx);

    const rows = await this.db
      .select()
      .from(memories)
      .where(where)
      .orderBy(desc(memories.updatedAt));

    return rows.map(rowToEntry);
  }

  async similarity(
    query: number[],
    ctx: MemoryContext,
    options: MemorySimilarityOptions,
  ): Promise<MemoryMatch[]> {
    const topK = options.topK ?? 5;
    const where = options.scope
      ? scopeFilter(options.scope, ctx)
      : anyScopeFilter(ctx);

    // pgvector needs the query vector serialised as '[0.1,0.2,...]'.
    const queryLiteral = `[${query.join(",")}]`;
    const distance = sql<number>`${memories.embedding} <=> ${queryLiteral}::vector`;

    const rows = await this.db
      .select({
        row: memories,
        distance,
      })
      .from(memories)
      .where(and(where, sql`${memories.embedding} IS NOT NULL`))
      .orderBy(sql`${memories.embedding} <=> ${queryLiteral}::vector`)
      .limit(topK);

    return rows.map((r) => ({
      entry: rowToEntry(r.row),
      // cosine distance (0..2) -> similarity (-1..1). pgvector's <=> returns
      // `1 - cosine_similarity`, so similarity = 1 - distance.
      score: 1 - Number(r.distance),
    }));
  }
}

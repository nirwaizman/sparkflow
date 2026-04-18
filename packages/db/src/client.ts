/**
 * Drizzle + postgres-js client factory.
 *
 * Two entry points:
 *
 *  - `createDb(connectionString?)` — build a fresh `{ db, client }` pair,
 *    e.g. for scripts, tests, or request-scoped usage. If no connection
 *    string is passed we read `DATABASE_URL` (pooler URL).
 *  - `getDb()` — lazy singleton for long-running app processes. Safe to
 *    call many times; the underlying `postgres` pool is created once.
 *
 * We intentionally do NOT start any connection at module import time —
 * the singleton is created on the first `getDb()` call.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

export interface DbHandle {
  db: Database;
  client: ReturnType<typeof postgres>;
}

function resolveConnectionString(explicit?: string): string {
  const url = explicit ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[@sparkflow/db] No connection string. Pass one to createDb() or set DATABASE_URL.",
    );
  }
  return url;
}

export function createDb(connectionString?: string): DbHandle {
  const url = resolveConnectionString(connectionString);
  // `prepare: false` is recommended when going through Supabase's pgBouncer
  // pooler (transaction mode). Safe for the direct URL too.
  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });
  return { db, client };
}

let _singleton: DbHandle | null = null;

/**
 * Lazy singleton. Returns the same `db` across calls within a process.
 */
export function getDb(): Database {
  if (!_singleton) {
    _singleton = createDb();
  }
  return _singleton.db;
}

/**
 * Close the singleton's underlying pool. Call during graceful shutdown or
 * between test files. Resets the lazy handle so the next `getDb()` opens
 * a fresh pool.
 */
export async function closeDb(): Promise<void> {
  if (_singleton) {
    await _singleton.client.end({ timeout: 5 });
    _singleton = null;
  }
}

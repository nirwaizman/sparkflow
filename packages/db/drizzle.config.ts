/**
 * Drizzle Kit configuration.
 *
 * - Schema lives in `src/schema/index.ts`.
 * - Generated SQL migrations are written to `migrations/`.
 * - Credentials come from env. We prefer `DIRECT_URL` for migrations so we
 *   bypass the connection pooler (pgBouncer in Supabase) which doesn't
 *   support all statements that migrations may need. `DATABASE_URL`
 *   (pooler) is the fallback.
 */
import type { Config } from "drizzle-kit";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  // Don't throw at import time when kit isn't being used (e.g. during typecheck
  // of downstream packages). Drizzle Kit will surface a clearer error itself
  // when it tries to connect.
  // eslint-disable-next-line no-console
  console.warn(
    "[drizzle.config] Neither DIRECT_URL nor DATABASE_URL is set; drizzle-kit commands will fail."
  );
}

export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;

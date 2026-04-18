/**
 * Browser-safe public API for @sparkflow/auth.
 *
 * Contains only code that can run in the client bundle — no Next.js
 * server modules (`next/headers`), no Drizzle/postgres imports.
 */

export type { Role, AuthSession } from "./types";
export { AuthError, ACTIVE_ORG_COOKIE, ROLE_RANK } from "./types";
export { createSupabaseBrowserClient } from "./supabase";

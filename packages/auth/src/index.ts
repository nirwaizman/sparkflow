/**
 * @sparkflow/auth — public API.
 *
 * Prefer these named imports from the barrel. Direct submodule imports
 * (e.g. `@sparkflow/auth/session`) are also supported via the `exports`
 * map in package.json.
 */
export * from "./types";
export { createSupabaseServerClient, createSupabaseBrowserClient } from "./supabase";
export { getSession, requireSession, requireRole, getMembership } from "./session";
export { createInvite, acceptInvite } from "./invites";
export { logAudit } from "./audit";

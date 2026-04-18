/**
 * Core auth types shared across server and client code.
 *
 * `Role` is a literal union aligned with the `membership_role` Postgres
 * enum defined in `@sparkflow/db`. Role precedence (highest -> lowest):
 * owner > admin > member > viewer.
 */
export type Role = "owner" | "admin" | "member" | "viewer";

/**
 * Ranking used by `requireRole`. Higher number = more permissions.
 * Do not reuse this numeric scale in persistent storage; it's a local
 * comparison helper only.
 */
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthSession {
  user: AuthUser;
  organizationId: string;
  role: Role;
}

/**
 * Thrown by `requireSession`/`requireRole` and anywhere an auth invariant
 * is violated. Route handlers should catch and translate to a 401/403.
 */
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options?: { status?: number; code?: string; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AuthError";
    this.status = options?.status ?? 401;
    this.code = options?.code ?? "unauthorized";
  }
}

export const ACTIVE_ORG_COOKIE = "sf-active-org";

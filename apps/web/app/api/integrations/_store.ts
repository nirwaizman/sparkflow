/**
 * In-memory token store for the Google Drive + Gmail integration stubs.
 *
 * TODO(WP-integrations): move to an `integrations` table in Postgres
 * (one row per (org, user, provider) with `access_token`,
 * `refresh_token`, `expires_at`, `scopes`, encrypted at rest). This
 * module exists so the rest of the UI/API surface can be built against
 * a stable interface while schema design happens in parallel.
 *
 * Tokens live for the lifetime of the Node process only — they are lost
 * on deploy/restart. Fine for development, never for production.
 */

export type GoogleToken = {
  access_token: string;
  /** Refresh tokens are only granted on first consent with prompt=consent. */
  refresh_token?: string;
  /** Epoch milliseconds when the access token expires. */
  expires_at: number;
  /** Whitespace-separated scope list as returned by Google. */
  scopes: string;
};

// Keyed by app user id (Supabase auth uid). Process-global on purpose
// — the whole point of the stub is to keep state across route calls
// in the same dev server.
declare global {
  // eslint-disable-next-line no-var
  var __sparkflow_google_tokens__: Map<string, GoogleToken> | undefined;
  // eslint-disable-next-line no-var
  var __sparkflow_google_oauth_states__: Map<string, { userId: string; createdAt: number }> | undefined;
}

export function getTokenStore(): Map<string, GoogleToken> {
  if (!globalThis.__sparkflow_google_tokens__) {
    globalThis.__sparkflow_google_tokens__ = new Map();
  }
  return globalThis.__sparkflow_google_tokens__;
}

export function getOAuthStateStore(): Map<
  string,
  { userId: string; createdAt: number }
> {
  if (!globalThis.__sparkflow_google_oauth_states__) {
    globalThis.__sparkflow_google_oauth_states__ = new Map();
  }
  return globalThis.__sparkflow_google_oauth_states__;
}

export function saveGoogleToken(userId: string, token: GoogleToken): void {
  getTokenStore().set(userId, token);
}

export function getGoogleToken(userId: string): GoogleToken | undefined {
  const token = getTokenStore().get(userId);
  if (!token) return undefined;
  return token;
}

export function clearGoogleToken(userId: string): boolean {
  return getTokenStore().delete(userId);
}

export function isGoogleConfigured(): boolean {
  return (
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET
  );
}

export function googleRedirectUri(): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT ??
    "http://localhost:3001/api/integrations/google/callback"
  );
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
  "profile",
] as const;

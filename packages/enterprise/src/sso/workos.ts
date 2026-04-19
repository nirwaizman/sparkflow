/**
 * WorkOS SSO integration.
 *
 * We intentionally talk to the WorkOS REST API over `fetch` instead of
 * pulling the `@workos-inc/node` SDK. Reasons:
 *   - no extra dependency / supply-chain surface;
 *   - the two endpoints we need (authorization URL + code exchange) are
 *     trivial; and
 *   - `fetch` works in any Next.js runtime (node or edge) without
 *     polyfills.
 *
 * Env contract:
 *   WORKOS_API_KEY     — secret key (server only)
 *   WORKOS_CLIENT_ID   — client/project ID (sk_... / client_...)
 *
 * When `WORKOS_API_KEY` is unset we degrade gracefully: the two public
 * entry points return `{ configured: false }` instead of throwing. That
 * lets the Enterprise UI still render in dev/local environments where
 * the operator hasn't yet provisioned a WorkOS project.
 */

const WORKOS_BASE = "https://api.workos.com";

export interface AuthorizationUrlInput {
  /** WorkOS "organization" / connection slug, or a raw WorkOS organization ID. */
  organization: string;
  /** Absolute callback URL registered in the WorkOS dashboard. */
  redirectUri: string;
  /** Opaque state token the caller will verify on callback. Strongly recommended. */
  state?: string;
  /** Login hint (email) to pre-fill the IdP form when supported. */
  loginHint?: string;
}

export type AuthorizationUrlResult =
  | { configured: true; url: string }
  | { configured: false; reason: string };

export type CallbackResult =
  | {
      configured: true;
      profile: WorkOSProfile;
      organizationId: string | null;
      idpId: string;
    }
  | { configured: false; reason: string };

export interface WorkOSProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  rawAttributes: Record<string, unknown>;
  connectionId: string | null;
  connectionType: string | null;
}

interface WorkOSProfileResponse {
  access_token?: string;
  profile?: {
    id?: string;
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
    organization_id?: string | null;
    connection_id?: string | null;
    connection_type?: string | null;
    idp_id?: string | null;
    raw_attributes?: Record<string, unknown>;
  };
}

function readApiKey(): string | null {
  const key = process.env.WORKOS_API_KEY;
  return key && key.length > 0 ? key : null;
}

function readClientId(): string | null {
  const id = process.env.WORKOS_CLIENT_ID;
  return id && id.length > 0 ? id : null;
}

/**
 * Build the WorkOS authorization URL the browser should be redirected to.
 * Returns `{ configured: false }` if `WORKOS_API_KEY` / `WORKOS_CLIENT_ID`
 * are missing so the route can fall through to a friendly error page.
 */
export function getAuthorizationUrl(
  input: AuthorizationUrlInput,
): AuthorizationUrlResult {
  const clientId = readClientId();
  const apiKey = readApiKey();
  if (!clientId || !apiKey) {
    return {
      configured: false,
      reason: "WORKOS_API_KEY or WORKOS_CLIENT_ID not set",
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    // WorkOS accepts either `organization` (WorkOS org id) or
    // `connection` (slug). We pass through whatever the caller gave us.
    organization: input.organization,
    provider: "authkit",
  });
  if (input.state) params.set("state", input.state);
  if (input.loginHint) params.set("login_hint", input.loginHint);

  return {
    configured: true,
    url: `${WORKOS_BASE}/sso/authorize?${params.toString()}`,
  };
}

/**
 * Exchange a WorkOS `code` for the authenticated profile.
 *
 * Per WorkOS docs the canonical flow is:
 *   POST /sso/token
 *     client_id, client_secret, grant_type=authorization_code, code
 *   → { access_token, profile }
 *
 * We normalise the returned snake_case fields into the camelCase shape
 * the rest of the app expects, and compute `idpId` as either the raw IdP
 * subject (preferred) or the WorkOS profile id (fallback).
 */
export async function handleCallback(code: string): Promise<CallbackResult> {
  const clientId = readClientId();
  const apiKey = readApiKey();
  if (!clientId || !apiKey) {
    return {
      configured: false,
      reason: "WORKOS_API_KEY or WORKOS_CLIENT_ID not set",
    };
  }
  if (!code) {
    return { configured: false, reason: "missing code" };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: apiKey,
    grant_type: "authorization_code",
    code,
  });

  const res = await fetch(`${WORKOS_BASE}/sso/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WorkOS token exchange failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as WorkOSProfileResponse;
  const p = json.profile;
  if (!p || !p.id || !p.email) {
    throw new Error("WorkOS token exchange returned no profile");
  }

  const idpId = p.idp_id ?? p.id;
  const profile: WorkOSProfile = {
    id: p.id,
    email: p.email,
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    rawAttributes: p.raw_attributes ?? {},
    connectionId: p.connection_id ?? null,
    connectionType: p.connection_type ?? null,
  };

  return {
    configured: true,
    profile,
    organizationId: p.organization_id ?? null,
    idpId,
  };
}

/**
 * True if WORKOS credentials are present. Lets callers short-circuit UI
 * without making a network call.
 */
export function isWorkOSConfigured(): boolean {
  return readApiKey() !== null && readClientId() !== null;
}

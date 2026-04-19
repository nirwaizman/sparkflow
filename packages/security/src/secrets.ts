/**
 * Secret-handling utilities.
 *
 * Two primitives:
 *   - `hashSecret(value)`  — SHA-256 → base64url. Used when we need a
 *     stable identifier for a secret (e.g. PII-free logging of API keys,
 *     dedup of invite tokens) without retaining the secret itself.
 *   - `redact(obj)`        — deep walk that replaces values whose keys
 *     look sensitive. Used by the logger and the error reporter before
 *     payloads leave the process.
 *
 * Both are sync and have zero external deps — safe to call from any
 * runtime (Node, Edge, browser-for-tests).
 */

// -----------------------------------------------------------------------
// hashSecret
// -----------------------------------------------------------------------

/** Keys whose *value* should be SHA-256 hashed before logging. */
const SENSITIVE_KEY_RE = /key|token|password|secret|authorization|api[-_]?key|bearer|cookie|session/i;

/** Max depth we descend into nested structures. Prevents pathological cycles. */
const MAX_DEPTH = 8;

/**
 * SHA-256 the input and encode the digest as base64url.
 *
 * We use WebCrypto when available (Edge, modern Node) and fall back to
 * node:crypto otherwise. The hash is not prefixed — callers that want a
 * disambiguation prefix (e.g. `sha256:`) can add it themselves.
 */
export async function hashSecret(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toBase64Url(new Uint8Array(digest));
  }
  // Node fallback — dynamic so edge bundlers don't pull it in.
  const nodeModName = "node:crypto";
  const { createHash } = (await import(/* @vite-ignore */ nodeModName)) as typeof import("node:crypto");
  const digest = createHash("sha256").update(bytes).digest();
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function"
    ? btoa(bin)
    // Node has Buffer; fallback path.
    : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// -----------------------------------------------------------------------
// redact
// -----------------------------------------------------------------------

/** What we substitute for a redacted value. */
const REDACTED = "[REDACTED]";

/**
 * Deep-clone `obj` with sensitive values replaced by `"[REDACTED]"`.
 *
 * Decisions:
 *   - We match on *key names*, not values. Pattern-matching secrets by
 *     shape (e.g. `sk-...`) is brittle; call sites that care about that
 *     should pre-hash with `hashSecret`.
 *   - Arrays are walked element-wise — the array index is not treated
 *     as a "key" (indices never match the sensitive regex anyway).
 *   - Circular references are broken by depth limit; we don't do a full
 *     WeakSet pass because the common logger payload is a fresh object
 *     graph and the cost would be unjustified.
 *   - We preserve non-plain objects (Date, Error, URL, Buffer, etc.) by
 *     reference. Consumers that need them serialized should do that
 *     upstream.
 */
export function redact<T>(obj: T): T {
  return walk(obj, 0) as T;
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value == null) return value;

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") return value;
  if (t === "function" || t === "symbol") return value;

  if (Array.isArray(value)) {
    return value.map((v) => walk(v, depth + 1));
  }

  // Preserve well-known non-plain objects by reference.
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Error ||
    (typeof URL !== "undefined" && value instanceof URL) ||
    (typeof Map !== "undefined" && value instanceof Map) ||
    (typeof Set !== "undefined" && value instanceof Set)
  ) {
    return value;
  }

  if (t === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = walk(src[k], depth + 1);
      }
    }
    return out;
  }

  return value;
}

/**
 * Exposed so downstream packages (e.g. observability logger) can check
 * whether a header/key would be redacted before deciding to forward it.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

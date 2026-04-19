/**
 * HMAC-SHA256 signing for outgoing webhooks.
 *
 * Signature format (Stripe/Slack-style, but simpler):
 *
 *   X-SparkFlow-Signature: t=<unix-seconds>,v1=<hex-hmac>
 *
 * where the HMAC is computed over `${timestamp}.${body}` with the
 * subscription's shared secret. Consumers verify by:
 *   1. splitting the header,
 *   2. rejecting timestamps older than the tolerance window (default 5m),
 *   3. recomputing the HMAC and comparing in constant time.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "X-SparkFlow-Signature";

const DEFAULT_TOLERANCE_SECONDS = 300;

export interface SignOptions {
  /** Unix seconds. Defaults to `Math.floor(Date.now() / 1000)`. */
  timestamp?: number;
}

export interface SignedPayload {
  header: string;
  timestamp: number;
  signature: string;
}

/** Compute the signature header for a payload + secret. */
export function signWebhook(
  payload: string | Buffer,
  secret: string,
  opts: SignOptions = {},
): SignedPayload {
  if (!secret) throw new Error("signWebhook: secret is required");
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  const signed = `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(signed).digest("hex");
  return {
    header: `t=${timestamp},v1=${signature}`,
    timestamp,
    signature,
  };
}

export interface VerifyOptions {
  /** Seconds; defaults to 300 (5 minutes). */
  toleranceSeconds?: number;
  /** Override "now" for deterministic tests. Unix seconds. */
  now?: number;
}

/**
 * Verify a signature header against a body + secret. Returns true iff
 * the timestamp is within tolerance AND the HMAC matches.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  header: string | null | undefined,
  secret: string,
  opts: VerifyOptions = {},
): boolean {
  if (!header || !secret) return false;

  const parts = header.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === "t") timestamp = Number.parseInt(v, 10);
    else if (k === "v1") signature = v;
  }
  if (!timestamp || !signature) return false;

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const body = typeof payload === "string" ? payload : payload.toString("utf8");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

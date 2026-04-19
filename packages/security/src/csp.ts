/**
 * Content-Security-Policy builder.
 *
 * Produces a CSP header string appropriate for the SparkFlow web app.
 * The policy is deliberately strict:
 *   - default-src 'self'
 *   - script-src uses a per-request nonce, not 'unsafe-inline'
 *   - connect-src enumerates every upstream we legitimately call
 *     (Supabase, OpenAI, Anthropic, Google AI, Langfuse, Sentry, PostHog,
 *     Stripe, Vapi, Upstash) so any exfil attempt to a random host fails
 *   - frame-ancestors 'none' (we also set X-Frame-Options: DENY in the
 *     complementary `headers.ts`)
 *
 * Next.js App Router injects the nonce into streamed HTML for us when we
 * set it on the response header — see `apps/web/middleware.ts`.
 */

export interface BuildCSPOptions {
  /** Per-request nonce for `script-src` / `style-src`. Hex or base64. */
  nonce: string;
  /** Set true in dev to allow `'unsafe-eval'` for React Refresh, HMR. */
  dev?: boolean;
  /**
   * Report-only mode — returned header name changes too, use
   * `getCSPHeaderName(opts)` if you need both.
   */
  reportOnly?: boolean;
  /** Optional extra `connect-src` hosts (e.g. customer-specific Supabase). */
  extraConnectSrc?: string[];
  /** Optional extra `img-src` hosts (e.g. user CDN). */
  extraImgSrc?: string[];
  /** Endpoint for `report-to` / `report-uri` directive. */
  reportUri?: string;
}

// Third-party origins we talk to from the browser.
// Keep this list authoritative — a missing entry surfaces as a broken
// feature in the console, which is preferable to silently allowing
// everything via '*'.
const CONNECT_SRC_DEFAULTS: readonly string[] = [
  "'self'",
  // Supabase
  "https://*.supabase.co",
  "wss://*.supabase.co",
  // OpenAI
  "https://api.openai.com",
  // Anthropic
  "https://api.anthropic.com",
  // Google (Gemini / Vertex, Fonts API, Identity)
  "https://generativelanguage.googleapis.com",
  "https://*.googleapis.com",
  "https://accounts.google.com",
  // Langfuse (observability)
  "https://cloud.langfuse.com",
  "https://*.langfuse.com",
  // Sentry
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  // PostHog
  "https://*.posthog.com",
  "https://*.i.posthog.com",
  // Stripe
  "https://api.stripe.com",
  "https://checkout.stripe.com",
  // Vapi (phone)
  "https://api.vapi.ai",
  "wss://api.vapi.ai",
  // Upstash (rate-limiting)
  "https://*.upstash.io",
];

const IMG_SRC_DEFAULTS: readonly string[] = [
  "'self'",
  "data:",
  "blob:",
  "https://*.supabase.co",
  "https://*.googleusercontent.com",
  "https://*.gravatar.com",
  "https://*.stripe.com",
  // Generated image providers
  "https://*.replicate.delivery",
  "https://*.openai.com",
  "https://*.oaiusercontent.com",
];

const FRAME_SRC_DEFAULTS: readonly string[] = [
  "'self'",
  "https://js.stripe.com",
  "https://checkout.stripe.com",
  "https://hooks.stripe.com",
];

const FONT_SRC_DEFAULTS: readonly string[] = [
  "'self'",
  "data:",
  "https://fonts.gstatic.com",
];

/** Returns the header name to pair with `buildCSP()`'s value. */
export function getCSPHeaderName(opts: Pick<BuildCSPOptions, "reportOnly">): string {
  return opts.reportOnly ? "content-security-policy-report-only" : "content-security-policy";
}

/**
 * Build a CSP header value.
 *
 * Nonces are placed on `script-src` and `style-src`. We include
 * `'strict-dynamic'` on `script-src` so scripts loaded transitively by a
 * trusted (nonced) script are also allowed — this is the recommended
 * modern pattern and is what Next.js documents.
 */
export function buildCSP(opts: BuildCSPOptions): string {
  const nonce = opts.nonce;
  const dev = !!opts.dev;

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(dev ? ["'unsafe-eval'"] : []),
    // Stripe JS SDK
    "https://js.stripe.com",
    // PostHog snippet (loaded from their CDN)
    "https://*.posthog.com",
  ];

  const styleSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // Tailwind/Next.js inject some small style blocks; allow inline
    // *only* alongside a nonce. Browsers that honor nonces will ignore
    // 'unsafe-inline', browsers that don't will use it as a fallback.
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
  ];

  const connectSrc = [
    ...CONNECT_SRC_DEFAULTS,
    ...(dev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ...(opts.extraConnectSrc ?? []),
  ];

  const imgSrc = [...IMG_SRC_DEFAULTS, ...(opts.extraImgSrc ?? [])];

  const directives: Array<[string, string[] | string]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", styleSrc],
    ["img-src", imgSrc],
    ["font-src", FONT_SRC_DEFAULTS.slice()],
    ["connect-src", connectSrc],
    ["frame-src", FRAME_SRC_DEFAULTS.slice()],
    ["media-src", ["'self'", "blob:", "data:", "https://*.supabase.co"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["upgrade-insecure-requests", ""],
  ];

  if (opts.reportUri) {
    directives.push(["report-uri", [opts.reportUri]]);
  }

  return directives
    .map(([name, value]) => {
      if (typeof value === "string") return name; // bare directive (no value)
      return `${name} ${value.join(" ")}`;
    })
    .join("; ");
}

/**
 * Generate a random nonce suitable for CSP.
 *
 * Uses WebCrypto (available in both Edge runtime and Node 19+). 16 bytes
 * of randomness encoded as base64 — short enough to keep the header lean
 * and long enough to resist brute-force in the attacker's guessing budget.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Edge runtime has no Buffer, so use btoa on a binary string.
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/=+$/g, "");
}

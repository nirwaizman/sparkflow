/**
 * Default HTTP security headers.
 *
 * Paired with the CSP header built by `@sparkflow/security/csp`. These
 * are the "boring" hardening headers — HSTS, frame blocking, MIME sniff
 * blocking, referrer policy, and a conservative Permissions-Policy.
 *
 * Applied in `apps/web/middleware.ts` on every response. Individual
 * route handlers can override by setting the same header on their own
 * `NextResponse` if they need a different value (e.g. embed pages that
 * allow framing from a partner domain).
 */

export interface SecurityHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * The defaults. Ordered roughly by how often they come up in audits.
 *
 * HSTS:
 *   max-age = 2 years, includeSubDomains, preload-eligible. Only
 *   meaningful on HTTPS — browsers ignore it over plain HTTP, so it's
 *   safe to emit unconditionally.
 *
 * X-Frame-Options:
 *   Belt-and-braces alongside CSP `frame-ancestors 'none'`. Older
 *   crawlers and some enterprise proxies only understand XFO.
 *
 * X-Content-Type-Options: nosniff
 *   Prevents browsers from treating a `text/plain` response as script.
 *
 * Referrer-Policy:
 *   `strict-origin-when-cross-origin` is the modern default Google,
 *   GitHub, and most of the web use. Leaks the origin (scheme+host) but
 *   not the path to third parties.
 *
 * Permissions-Policy:
 *   Disable every powerful browser feature by default. Sub-pages that
 *   legitimately need camera/mic/geolocation (e.g. the phone feature or
 *   browser-use preview) must opt in via their own response headers.
 */
export const defaultSecurityHeaders: readonly SecurityHeader[] = [
  {
    name: "strict-transport-security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { name: "x-frame-options", value: "DENY" },
  { name: "x-content-type-options", value: "nosniff" },
  { name: "referrer-policy", value: "strict-origin-when-cross-origin" },
  {
    name: "permissions-policy",
    value: [
      "accelerometer=()",
      "autoplay=(self)",
      "camera=()",
      "clipboard-read=(self)",
      "clipboard-write=(self)",
      "cross-origin-isolated=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "hid=()",
      "idle-detection=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=(self)",
      "picture-in-picture=(self)",
      "publickey-credentials-get=(self)",
      "screen-wake-lock=()",
      "serial=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  // Isolate the origin from cross-origin popups/iframes by default.
  // Stripe Checkout opens via redirect (not popup-with-opener) so this
  // is safe; if a feature needs `window.opener` access, override on
  // that specific response.
  { name: "cross-origin-opener-policy", value: "same-origin" },
  { name: "x-dns-prefetch-control", value: "on" },
];

/**
 * Apply the defaults to a Headers instance in-place.
 *
 * Does NOT overwrite headers the caller has already set — so a route
 * that returns its own `referrer-policy` will keep it.
 */
export function applyDefaultSecurityHeaders(headers: Headers): void {
  for (const h of defaultSecurityHeaders) {
    if (!headers.has(h.name)) headers.set(h.name, h.value);
  }
}

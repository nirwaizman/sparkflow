/**
 * Shared routing constants for next-intl.
 *
 * Kept separate from `request.ts` so the middleware (Edge runtime) and
 * Server Components can import locale metadata without dragging in the
 * Node-only `getRequestConfig` helper.
 */
import { LOCALES, DEFAULT_LOCALE, type Locale } from "./request";

export { LOCALES, DEFAULT_LOCALE };
export type { Locale };

/**
 * Matches the `localePrefix: 'as-needed'` next-intl behavior:
 *   - default locale  → no prefix   (`/chat`         resolves to `he`)
 *   - other locales   → prefixed    (`/en/chat`, `/ar/chat`)
 *   - explicit he     → prefixed    (`/he/chat` — rewritten to `/chat`)
 */
export const LOCALE_PREFIX = "as-needed" as const;

/** Cookie next-intl reads on subsequent requests to remember user choice. */
export const LOCALE_COOKIE = "NEXT_LOCALE" as const;

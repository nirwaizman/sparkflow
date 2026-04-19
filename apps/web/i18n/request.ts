/**
 * next-intl request configuration.
 *
 * Resolves the active locale for the current request and loads the
 * matching messages bundle. Referenced from `next.config.ts` via the
 * `createNextIntlPlugin('./i18n/request.ts')` call.
 *
 * Supported locales:
 *   - he (Hebrew)  — default, RTL
 *   - en (English) — LTR
 *   - ar (Arabic)  — RTL
 *
 * Locale resolution order (see `middleware.ts`):
 *   1. URL prefix  (`/en/*`, `/ar/*`, `/he/*`)
 *   2. Cookie      (`NEXT_LOCALE`)
 *   3. Fallback    → DEFAULT_LOCALE (`he`)
 */
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

export const LOCALES = ["he", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "he";

/** RTL locales — consumed by the root `<html dir>` attribute in the layout. */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["he", "ar"]);

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  let messages: Record<string, string>;
  try {
    messages = (await import(`../messages/${locale}.json`)).default as Record<string, string>;
  } catch {
    // Missing bundle => 404 rather than rendering with `undefined` keys.
    notFound();
  }

  return {
    locale,
    messages,
    timeZone: "Asia/Jerusalem",
    now: new Date(),
  };
});

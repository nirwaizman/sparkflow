/**
 * Supabase client factories.
 *
 * We expose two helpers:
 *  - `createSupabaseServerClient()` — for Next.js server components,
 *    route handlers, and middleware-adjacent server code. Wraps
 *    `@supabase/ssr`'s `createServerClient` with cookie adapters bound
 *    to `next/headers`.
 *  - `createSupabaseBrowserClient()` — for client components. Wraps
 *    `createBrowserClient` and reads env from `NEXT_PUBLIC_*`.
 *
 * Env contract:
 *   SUPABASE_URL            — project URL (also exposed as
 *                             NEXT_PUBLIC_SUPABASE_URL for the browser)
 *   SUPABASE_ANON_KEY       — anon publishable key (also
 *                             NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *
 * The browser client intentionally uses the NEXT_PUBLIC_* variants so
 * Next.js inlines them at build time.
 */
import { createBrowserClient, createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertEnv, optionalEnv } from "@sparkflow/shared";

function resolveUrl(): string {
  return optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? assertEnv("SUPABASE_URL");
}

function resolveAnonKey(): string {
  return optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? assertEnv("SUPABASE_ANON_KEY");
}

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 *
 * Must be called from a Server Component / Route Handler / Server Action
 * context so `next/headers` is available. We read `cookies()` lazily per
 * call because Next 15 returns a `Promise<ReadonlyRequestCookies>` in
 * some contexts and a synchronous store in others — awaiting it works
 * in both.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  // Dynamic import so the `@sparkflow/auth` package doesn't hard-require
  // `next` at the type level for non-Next consumers (e.g. worker scripts).
  const { cookies } = await import("next/headers");
  // In Next 15 `cookies()` returns a Promise in route handlers; awaiting
  // a non-promise value is a no-op so this is safe across versions.
  const cookieStore = await (cookies() as unknown as Promise<Awaited<ReturnType<typeof cookies>>>);

  return createServerClient(resolveUrl(), resolveAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          // `set` is only permitted in Server Actions / Route Handlers;
          // in a plain Server Component this will throw. Swallow so read
          // paths don't crash — the cookie will be set on the next
          // write path. Cast through `unknown` because cookieStore.set's
          // static type is narrower than its runtime accepts in some
          // Next versions.
          (cookieStore as unknown as {
            set: (opts: { name: string; value: string } & CookieOptions) => void;
          }).set({ name, value, ...options });
        } catch {
          /* no-op in read-only contexts */
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          (cookieStore as unknown as {
            set: (opts: { name: string; value: string; maxAge: number } & CookieOptions) => void;
          }).set({ name, value: "", ...options, maxAge: 0 });
        } catch {
          /* no-op */
        }
      },
    },
  });
}

/**
 * Browser-side Supabase client. Use from `"use client"` components.
 *
 * We reference `process.env.NEXT_PUBLIC_*` **literally** (no wrapper) so Next.js
 * inlines the values into the client bundle at build time. Using a string-arg
 * indirection (e.g. `optionalEnv("NEXT_PUBLIC_SUPABASE_URL")`) defeats the
 * static-analysis replacement and the values come back `undefined` in the
 * browser.
 *
 * When the literal replacement succeeded at build-time (the common case) we
 * short-circuit before touching `resolveUrl()`. We only fall back to the
 * server-side helpers when actually running on the server (SSR first paint
 * of a client component) — detected by the absence of `window`. This way a
 * browser bundle that somehow lost the inlined value fails with an honest
 * "NEXT_PUBLIC_SUPABASE_URL" message instead of the misleading
 * "SUPABASE_URL" error that `assertEnv` emits.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  const inlineUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const inlineAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isBrowser = typeof window !== "undefined";

  const url = inlineUrl ?? (isBrowser ? undefined : resolveUrl());
  const anonKey = inlineAnonKey ?? (isBrowser ? undefined : resolveAnonKey());

  if (!url || !anonKey) {
    throw new Error(
      "Supabase browser client missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Ensure both are set in apps/web/.env.local and restart `pnpm dev`.",
    );
  }
  return createBrowserClient(url, anonKey);
}

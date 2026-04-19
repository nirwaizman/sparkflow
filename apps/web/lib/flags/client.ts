"use client";

/**
 * Client-side feature flag hook.
 *
 * `useFlag(key, defaultValue)` fetches `/api/flags/evaluate?keys=<key>`
 * once per component mount (deduped per cache key across the tab via a
 * module-level promise map) and returns the resolved boolean.
 *
 * Design notes:
 *   - Until the network call returns, the hook returns the supplied
 *     default, so server-rendered UI that already used the same default
 *     does not flash.
 *   - Results are cached in-memory for the page lifetime. If a flag flips
 *     while the tab is open the UI will stay on its last observed value
 *     — reload the page to pick up changes. That's good enough for the
 *     current product (flags change via an operator, not at runtime).
 */
import { useEffect, useState } from "react";

type CacheEntry = {
  promise: Promise<Record<string, boolean>>;
  value?: Record<string, boolean>;
};

const cache = new Map<string, CacheEntry>();

function fetchKeys(keys: string[]): Promise<Record<string, boolean>> {
  const cacheKey = keys.slice().sort().join(",");
  const hit = cache.get(cacheKey);
  if (hit) return hit.promise;
  const promise = fetch(
    `/api/flags/evaluate?keys=${encodeURIComponent(keys.join(","))}`,
    { credentials: "include" },
  )
    .then(async (res) => {
      if (!res.ok) return {} as Record<string, boolean>;
      const data = (await res.json()) as { flags?: Record<string, boolean> };
      return data.flags ?? {};
    })
    .catch(() => ({}) as Record<string, boolean>);
  const entry: CacheEntry = { promise };
  cache.set(cacheKey, entry);
  void promise.then((v) => {
    entry.value = v;
  });
  return promise;
}

export function useFlag(key: string, defaultValue = false): boolean {
  const [value, setValue] = useState<boolean>(defaultValue);

  useEffect(() => {
    let cancelled = false;
    fetchKeys([key]).then((flags) => {
      if (cancelled) return;
      if (Object.prototype.hasOwnProperty.call(flags, key)) {
        setValue(Boolean(flags[key]));
      } else {
        setValue(defaultValue);
      }
    });
    return () => {
      cancelled = true;
    };
    // We intentionally depend on the key only — the default is a static
    // fallback used only until the first response arrives, so changing it
    // should not refire the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return value;
}

/**
 * Multi-key variant. Returns a stable object keyed by the requested flag
 * names. Unresolved keys fall back to `defaultValue`.
 */
export function useFlags(
  keys: readonly string[],
  defaultValue = false,
): Record<string, boolean> {
  const initial: Record<string, boolean> = {};
  for (const k of keys) initial[k] = defaultValue;
  const [value, setValue] = useState<Record<string, boolean>>(initial);

  const keyList = [...keys].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    if (keys.length === 0) return;
    fetchKeys([...keys]).then((flags) => {
      if (cancelled) return;
      const next: Record<string, boolean> = {};
      for (const k of keys) {
        next[k] = Object.prototype.hasOwnProperty.call(flags, k)
          ? Boolean(flags[k])
          : defaultValue;
      }
      setValue(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList]);

  return value;
}

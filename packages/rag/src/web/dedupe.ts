import type { SourceItem } from "@sparkflow/shared";

const TRACKING_PARAM_PREFIXES = ["utm_", "mc_"];
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "yclid",
  "ref",
  "ref_src",
  "ref_url",
  "igshid",
]);

/**
 * Return a normalized form of a URL suitable for dedupe comparison:
 * - lowercase scheme + host
 * - strip tracking query params (utm_*, fbclid, etc.)
 * - strip trailing slash on the path
 * Invalid URLs fall back to a trimmed lowercase string.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();
    u.hash = "";

    const params = [...u.searchParams.keys()];
    for (const key of params) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower)) {
        u.searchParams.delete(key);
        continue;
      }
      if (TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) {
        u.searchParams.delete(key);
      }
    }

    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;

    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim().toLowerCase();
  }
}

function shingles(text: string, k = 5): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  if (tokens.length <= k) {
    if (tokens.length > 0) out.add(tokens.join(" "));
    return out;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    out.add(tokens.slice(i, i + k).join(" "));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const s of a) if (b.has(s)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Dedupe by normalized URL first, then drop near-duplicate snippets
 * with Jaccard similarity >= 0.8 on 5-word shingles.
 */
export function dedupeSources(sources: SourceItem[]): SourceItem[] {
  const seenUrls = new Set<string>();
  const snippetShingles: Set<string>[] = [];
  const out: SourceItem[] = [];

  for (const s of sources) {
    const normalized = normalizeUrl(s.url);
    if (seenUrls.has(normalized)) continue;

    const shing = shingles(s.snippet ?? "");
    let isNearDup = false;
    for (const existing of snippetShingles) {
      if (shing.size > 0 && jaccard(shing, existing) >= 0.8) {
        isNearDup = true;
        break;
      }
    }
    if (isNearDup) continue;

    seenUrls.add(normalized);
    snippetShingles.push(shing);
    out.push(s);
  }
  return out;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

/**
 * Cap the number of results from any one domain to `maxPerDomain`,
 * preserving original order.
 */
export function diversifyByDomain(
  sources: SourceItem[],
  maxPerDomain = 2,
): SourceItem[] {
  const counts = new Map<string, number>();
  const out: SourceItem[] = [];
  for (const s of sources) {
    const host = hostnameOf(s.url);
    const current = counts.get(host) ?? 0;
    if (current >= maxPerDomain) continue;
    counts.set(host, current + 1);
    out.push(s);
  }
  return out;
}

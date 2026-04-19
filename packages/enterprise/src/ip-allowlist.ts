/**
 * IP allowlist.
 *
 * Stored per-organization as a list of CIDR blocks (IPv4 or IPv6). An
 * empty list = "no allowlist configured" = allow all. Only when an org
 * sets at least one CIDR do we start enforcing.
 *
 * The store is in-memory for now (process-local `Map`). A production
 * deployment should back this with a table so entries survive deploys
 * and are shared across replicas.
 *
 * TODO: add `org_ip_allowlist` table (org_id, cidr, created_by,
 *       created_at) and replace the in-memory Map with DB reads
 *       (likely cached for 30-60s with a Redis-keyed invalidation).
 */

type Allowlist = string[];

const store = new Map<string, Allowlist>();

export function setAllowlist(orgId: string, cidrs: readonly string[]): void {
  const cleaned = cidrs
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .filter((c, i, arr) => arr.indexOf(c) === i);
  // Validate up front so bad input never makes it into the store.
  for (const cidr of cleaned) {
    if (!isValidCidr(cidr)) {
      throw new Error(`invalid CIDR: ${cidr}`);
    }
  }
  if (cleaned.length === 0) {
    store.delete(orgId);
  } else {
    store.set(orgId, cleaned);
  }
}

export function getAllowlist(orgId: string): string[] {
  return store.get(orgId) ?? [];
}

export function clearAllowlist(orgId: string): void {
  store.delete(orgId);
}

/**
 * Returns true when `ip` is allowed for `orgId`. If the org has no
 * entries we default-allow (there is no policy to enforce).
 */
export function isAllowed(orgId: string, ip: string): boolean {
  const list = store.get(orgId);
  if (!list || list.length === 0) return true;
  return list.some((cidr) => cidrMatches(cidr, ip));
}

// ---------------------------------------------------------------------------
// CIDR parsing / matching — written inline to avoid a runtime dependency.
// ---------------------------------------------------------------------------

export function isValidCidr(cidr: string): boolean {
  const slash = cidr.indexOf("/");
  const addr = slash >= 0 ? cidr.slice(0, slash) : cidr;
  const prefix = slash >= 0 ? Number(cidr.slice(slash + 1)) : null;

  if (addr.includes(":")) {
    if (prefix !== null && (!Number.isInteger(prefix) || prefix < 0 || prefix > 128)) {
      return false;
    }
    return parseIPv6(addr) !== null;
  }
  if (prefix !== null && (!Number.isInteger(prefix) || prefix < 0 || prefix > 32)) {
    return false;
  }
  return parseIPv4(addr) !== null;
}

function parseIPv4(addr: string): Uint8Array | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const p = parts[i];
    if (p === undefined || p.length === 0) return null;
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    out[i] = n;
  }
  return out;
}

function parseIPv6(addr: string): Uint8Array | null {
  // Allow "::ffff:1.2.3.4" by delegating to a dual-stack split.
  let base = addr;
  let v4Tail: Uint8Array | null = null;
  if (base.includes(".")) {
    const lastColon = base.lastIndexOf(":");
    const v4 = base.slice(lastColon + 1);
    const parsed = parseIPv4(v4);
    if (!parsed) return null;
    v4Tail = parsed;
    base = base.slice(0, lastColon) + ":0:0";
  }

  const doubleColon = base.indexOf("::");
  let head: string[] = [];
  let tail: string[] = [];
  if (doubleColon >= 0) {
    head = base.slice(0, doubleColon).split(":").filter((s) => s.length > 0);
    tail = base.slice(doubleColon + 2).split(":").filter((s) => s.length > 0);
  } else {
    head = base.split(":");
    if (head.length !== 8) return null;
  }
  const totalGroups = 8;
  const fillers = totalGroups - head.length - tail.length;
  if (fillers < 0) return null;

  const groups: string[] = [
    ...head,
    ...Array.from({ length: fillers }, () => "0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;

  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const g = groups[i];
    if (g === undefined || !/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out[i * 2] = (n >>> 8) & 0xff;
    out[i * 2 + 1] = n & 0xff;
  }
  if (v4Tail) {
    out[12] = v4Tail[0]!;
    out[13] = v4Tail[1]!;
    out[14] = v4Tail[2]!;
    out[15] = v4Tail[3]!;
  }
  return out;
}

function cidrMatches(cidr: string, ip: string): boolean {
  const slash = cidr.indexOf("/");
  const cidrAddr = slash >= 0 ? cidr.slice(0, slash) : cidr;
  const isV6 = cidrAddr.includes(":") || ip.includes(":");

  // If cidr is v4 but ip is v6 (or vice versa) try to coerce ::ffff:v4.
  const cidrBytes = cidrAddr.includes(":")
    ? parseIPv6(cidrAddr)
    : parseIPv4(cidrAddr);
  const ipBytes = ip.includes(":") ? parseIPv6(ip) : parseIPv4(ip);
  if (!cidrBytes || !ipBytes) return false;

  // Different lengths = different families. Leave them unequal.
  if (cidrBytes.length !== ipBytes.length) return false;

  const maxPrefix = cidrBytes.length * 8;
  const prefix = slash >= 0 ? Number(cidr.slice(slash + 1)) : maxPrefix;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return false;

  const fullBytes = Math.floor(prefix / 8);
  const remainder = prefix % 8;

  for (let i = 0; i < fullBytes; i += 1) {
    if (cidrBytes[i] !== ipBytes[i]) return false;
  }
  if (remainder > 0) {
    const mask = (0xff << (8 - remainder)) & 0xff;
    if (((cidrBytes[fullBytes] ?? 0) & mask) !== ((ipBytes[fullBytes] ?? 0) & mask)) {
      return false;
    }
  }
  // Silence unused-var linting for isV6 — it's useful for future
  // telemetry/debug output but not currently read.
  void isV6;
  return true;
}

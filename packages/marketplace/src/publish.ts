/**
 * Publish flow for marketplace listings.
 *
 * `publishListing` runs a basic safety scan over the incoming entity
 * payload to reject obvious secret leaks (API keys, private keys, bearer
 * tokens, long hex/base64 blobs that look like credentials). This is a
 * first-pass filter — a full review pipeline will replace it server-
 * side once listings become revenue-bearing.
 *
 * TODO(safety): move the secret-detection heuristics into a shared
 * `@sparkflow/security` scanner so the same regex set is applied by
 * logging redaction, file uploads, and marketplace publish. Also add an
 * LLM-based second pass for prompt-injection / jailbreak payloads.
 */

import { insertListing, normaliseTags, uid } from "./store";
import type {
  Listing,
  ListingVisibility,
  PublishListingInput,
} from "./types";

/** Custom error so callers can distinguish safety failures from the
 * generic "bad input" 400. */
export class ListingSafetyError extends Error {
  readonly matches: ReadonlyArray<string>;
  constructor(matches: ReadonlyArray<string>) {
    super(
      `Listing rejected by safety scan. Matched patterns: ${matches.join(", ")}`,
    );
    this.name = "ListingSafetyError";
    this.matches = matches;
  }
}

/** Regexes that look for credential-shaped strings. Intentionally loose —
 * false positives are better than publishing a secret. */
const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "aws_access_key_id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "github_token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "openai_api_key", re: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "anthropic_api_key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "stripe_secret_key", re: /sk_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: "google_api_key", re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "slack_token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "private_key_block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "jwt_token", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: "bearer_header",
    re: /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{20,}/,
  },
  {
    // Labels like API_KEY=..., SECRET_KEY=..., PASSWORD=..., followed by
    // something longer than a token placeholder.
    name: "labelled_secret",
    re: /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{12,}/i,
  },
];

/** Flatten every string found in a JSON-like payload so we can scan it. */
function collectStrings(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    collectStrings(v, out);
  }
}

/**
 * Runs the secret scan over a listing payload. Exported so callers (e.g.
 * a preview endpoint) can dry-run the check without publishing.
 */
export function scanListingForSecrets(
  input: Pick<PublishListingInput, "title" | "description" | "entity">,
): string[] {
  const blobs: string[] = [];
  collectStrings(input.title, blobs);
  collectStrings(input.description, blobs);
  collectStrings(input.entity, blobs);
  const haystack = blobs.join("\n");
  const matched: string[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(haystack)) matched.push(name);
  }
  return matched;
}

function clampPrice(price: number | undefined): number | undefined {
  if (price === undefined) return undefined;
  if (!Number.isFinite(price) || price < 0) return 0;
  // Cap at an arbitrary upper bound so a stray 1e12 never reaches billing.
  return Math.min(Math.floor(price), 10_000_00);
}

function validateTitle(title: string): string {
  const t = title.trim();
  if (t.length < 2) throw new Error("title_too_short");
  if (t.length > 120) throw new Error("title_too_long");
  return t;
}

function validateDescription(description: string): string {
  const d = description.trim();
  if (d.length < 10) throw new Error("description_too_short");
  if (d.length > 4000) throw new Error("description_too_long");
  return d;
}

/**
 * Publish a new marketplace listing from the caller's org.
 *
 * Throws:
 *   - `ListingSafetyError` when the payload trips the secret scanner.
 *   - `Error("title_too_short" | ...)` for basic validation issues.
 */
export async function publishListing(
  input: PublishListingInput,
): Promise<Listing> {
  const matches = scanListingForSecrets(input);
  if (matches.length > 0) {
    throw new ListingSafetyError(matches);
  }

  const title = validateTitle(input.title);
  const description = validateDescription(input.description);
  const visibility: ListingVisibility = input.visibility ?? "public";
  const now = new Date();

  const row: Listing = {
    id: uid("mk"),
    kind: input.kind,
    title,
    description,
    publisherOrganizationId: input.publisherOrganizationId,
    publisherUserId: input.publisherUserId,
    entity: input.entity,
    price: clampPrice(input.price),
    visibility,
    tags: normaliseTags(input.tags),
    installCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await insertListing(row);
  return row;
}

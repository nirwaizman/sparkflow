/**
 * Referral codes.
 *
 * Currently backed by an in-memory Map — suitable for dev and single-
 * instance deploys but intentionally process-local so callers can swap
 * in a DB-backed implementation without touching the call sites.
 *
 * TODO(db): introduce a `referrals` table with columns:
 *   - code              text primary key
 *   - owner_user_id     uuid not null references users(id)
 *   - created_at        timestamptz not null default now()
 *   - credits_awarded   integer not null default 0
 * and a `referral_attributions` table:
 *   - code              text not null references referrals(code)
 *   - referred_user_id  uuid not null unique references users(id)
 *   - attributed_at     timestamptz not null default now()
 *   - rewarded_at       timestamptz
 * Expose via @sparkflow/db and replace the Maps below.
 */

import { trackEvent } from "@sparkflow/observability";

export type Attribution = {
  code: string;
  ownerUserId: string;
  referredUserId: string;
  attributedAt: Date;
};

/** code -> ownerUserId */
const codeToOwner = new Map<string, string>();
/** ownerUserId -> code (reverse for stable idempotent lookups) */
const ownerToCode = new Map<string, string>();
/** referredUserId -> attribution (prevents double-attribution) */
const referredToAttribution = new Map<string, Attribution>();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_LEN = 8;

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    out += ALPHABET[idx] ?? "X";
  }
  return out;
}

/**
 * Return a stable referral code for a given user. Creates one on first
 * call and caches it so the same user always shares the same code.
 */
export function generateReferralCode(userId: string): string {
  const existing = ownerToCode.get(userId);
  if (existing) return existing;

  // Extremely unlikely collision with an 8-char alphabet of 32 chars; we
  // still loop so we never clobber an existing owner.
  let code = randomCode();
  while (codeToOwner.has(code)) code = randomCode();

  codeToOwner.set(code, userId);
  ownerToCode.set(userId, code);
  trackEvent("referral_code_generated", { userId, code });
  return code;
}

export type AttributeResult =
  | { ok: true; attribution: Attribution }
  | { ok: false; reason: "unknown_code" | "self_referral" | "already_attributed" };

/**
 * Record that `newUserId` signed up using `code`. Idempotent: calling
 * twice for the same referred user returns the original attribution.
 */
export function attributeReferral(
  code: string,
  newUserId: string,
): AttributeResult {
  const owner = codeToOwner.get(code);
  if (!owner) return { ok: false, reason: "unknown_code" };
  if (owner === newUserId) return { ok: false, reason: "self_referral" };

  const existing = referredToAttribution.get(newUserId);
  if (existing) {
    // Idempotent — same referred user, same result. Treat it as "ok"
    // only if the code matches; otherwise it's a conflict we won't
    // silently overwrite.
    if (existing.code === code) return { ok: true, attribution: existing };
    return { ok: false, reason: "already_attributed" };
  }

  const attribution: Attribution = {
    code,
    ownerUserId: owner,
    referredUserId: newUserId,
    attributedAt: new Date(),
  };
  referredToAttribution.set(newUserId, attribution);
  trackEvent("referral_attributed", {
    code,
    ownerUserId: owner,
    referredUserId: newUserId,
  });
  return { ok: true, attribution };
}

/** Look up the owner of a code without mutating state. */
export function ownerOfCode(code: string): string | undefined {
  return codeToOwner.get(code);
}

/** Look up the attribution for a referred user, if any. */
export function attributionFor(
  referredUserId: string,
): Attribution | undefined {
  return referredToAttribution.get(referredUserId);
}

/**
 * Test-only: clear all in-memory state. Not exported from the barrel
 * index on purpose — only call from vitest.
 */
export function __resetReferralStore(): void {
  codeToOwner.clear();
  ownerToCode.clear();
  referredToAttribution.clear();
}

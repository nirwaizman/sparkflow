/**
 * Pure-regex PII detection / redaction.
 *
 * Designed for Israeli-locale content:
 *   - email            — RFC-ish simple form.
 *   - il_phone         — Israeli phone numbers (mobile + landline), with
 *                        or without country code (+972 / 0).
 *   - il_id            — תעודת זהות: exactly 9 digits.
 *   - credit_card      — 13-19 digit groups (optionally space/dash
 *                        separated) that pass a Luhn check.
 *   - iban             — Simple IBAN shape check (country + 13-32 alnum).
 *
 * These are heuristic detectors; they trade recall for precision in the
 * simplest way. Anything we flag is always wrapped in a `[REDACTED <type>]`
 * marker by `redactPII`.
 */

export type PIIType = "email" | "il_phone" | "il_id" | "credit_card" | "iban";

export interface PIIMatch {
  type: PIIType;
  match: string;
  start: number;
  end: number;
}

// Ordered: more specific patterns first, so we can greedily claim ranges
// and avoid double-flagging the same span (e.g. a credit_card inside a
// longer digit run).
const PATTERNS: Array<{ type: PIIType; regex: RegExp }> = [
  {
    type: "email",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    type: "iban",
    // IBAN: two letters + two check digits + 11-30 alphanumerics.
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },
  {
    type: "credit_card",
    // 13-19 digits, optionally grouped by spaces or dashes. Luhn check
    // performed later.
    regex: /\b(?:\d[ -]?){12,18}\d\b/g,
  },
  {
    type: "il_phone",
    // +972 <digits> | 0<digits>. Accepts spaces and dashes between
    // groups. 9-10 digits total after normalisation.
    regex: /(?:(?:\+?972[-\s]?)|0)(?:\d[-\s]?){7,9}\d/g,
  },
  {
    type: "il_id",
    // Exactly 9 digits with word boundaries so we don't grab the middle
    // of a longer number.
    regex: /\b\d{9}\b/g,
  },
];

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const c = digits.charCodeAt(i);
    if (c < 48 || c > 57) return false;
    let n = c - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function overlaps(ranges: Array<{ start: number; end: number }>, start: number, end: number): boolean {
  for (const r of ranges) {
    if (start < r.end && end > r.start) return true;
  }
  return false;
}

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];
  const claimed: Array<{ start: number; end: number }> = [];

  for (const { type, regex } of PATTERNS) {
    // Reset regex state — these are module-level and mutable.
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const raw = m[0];
      const start = m.index;
      const end = start + raw.length;

      if (overlaps(claimed, start, end)) continue;

      if (type === "credit_card") {
        const digits = raw.replace(/[^0-9]/g, "");
        if (digits.length < 13 || digits.length > 19) continue;
        if (!luhn(digits)) continue;
      }

      matches.push({ type, match: raw, start, end });
      claimed.push({ start, end });
    }
  }

  // Return in natural left-to-right order for predictable output.
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

export function redactPII(text: string): string {
  const matches = detectPII(text);
  if (matches.length === 0) return text;

  let out = "";
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start);
    out += `[REDACTED ${m.type}]`;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return out;
}

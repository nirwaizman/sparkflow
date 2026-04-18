/**
 * Minimal cron scheduling helper.
 *
 * TODO(WP-C4.5): Replace this with Inngest (or a hosted scheduler) for
 * real distributed scheduling. This module exists so the workflow
 * definition can still attach a cron trigger and the dev server has
 * something sensible to compute "next run" with.
 *
 * Supported cron syntax (five-field):
 *   minute  hour  day-of-month  month  day-of-week
 *
 * Each field may be:
 *   - "*"                        any value
 *   - "N"                        literal value
 *   - "N-M"                      inclusive range
 *   - "N,M,..."                  explicit list
 *   - "*\/K" or "N-M/K"          step values
 *
 * Returns `null` if the expression is syntactically invalid or has no
 * future match within the next year (safety cap).
 */

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day-of-month
  [1, 12], // month
  [0, 6], // day-of-week (0 = Sunday)
];

function expandField(expr: string, [min, max]: [number, number]): Set<number> | null {
  const values = new Set<number>();
  const parts = expr.split(",");
  for (const raw of parts) {
    const part = raw.trim();
    if (part.length === 0) return null;

    let step = 1;
    let body = part;
    const slash = part.indexOf("/");
    if (slash >= 0) {
      const stepRaw = part.slice(slash + 1);
      step = Number(stepRaw);
      if (!Number.isInteger(step) || step <= 0) return null;
      body = part.slice(0, slash);
    }

    let lo = min;
    let hi = max;
    if (body !== "*" && body !== "") {
      const dash = body.indexOf("-");
      if (dash >= 0) {
        lo = Number(body.slice(0, dash));
        hi = Number(body.slice(dash + 1));
      } else {
        lo = hi = Number(body);
      }
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
      if (lo < min || hi > max || lo > hi) return null;
    }

    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

type ParsedCron = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
};

function parseCron(expr: string): ParsedCron | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const expanded: Array<Set<number> | null> = fields.map((f, i) =>
    expandField(f, FIELD_RANGES[i]!),
  );
  if (expanded.some((s) => s === null)) return null;
  const sets = expanded as Set<number>[];
  const minute = sets[0];
  const hour = sets[1];
  const dayOfMonth = sets[2];
  const month = sets[3];
  const dayOfWeek = sets[4];
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Compute the next Date (in UTC) matching the given cron expression,
 * strictly after `now` (defaults to `new Date()`). Returns `null` if
 * the expression is invalid or no match is found within ~1 year.
 */
export function nextRunAt(cronExpr: string, now: Date = new Date()): Date | null {
  const parsed = parseCron(cronExpr);
  if (!parsed) return null;

  const candidate = new Date(now.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Safety cap: a year of minutes.
  const maxIterations = 60 * 24 * 370;
  for (let i = 0; i < maxIterations; i++) {
    if (
      parsed.month.has(candidate.getUTCMonth() + 1) &&
      parsed.dayOfMonth.has(candidate.getUTCDate()) &&
      parsed.dayOfWeek.has(candidate.getUTCDay()) &&
      parsed.hour.has(candidate.getUTCHours()) &&
      parsed.minute.has(candidate.getUTCMinutes())
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

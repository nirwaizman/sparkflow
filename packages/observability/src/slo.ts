/**
 * SLO primitives: sliding-window latency + error recorders.
 *
 * The plumbing here is intentionally in-process. Each metric name owns a
 * small ring buffer of recent samples (default: last 500 observations,
 * last 15 minutes of error counts). Percentile math (p50/p95/p99) is
 * computed on demand from the buffer so `snapshotSlo()` is cheap for a
 * health/status endpoint to call on every request.
 *
 * TODO(obs-slo-1): flush buffers to Grafana Cloud via the Prometheus
 * pushgateway (or the OTLP/HTTP endpoint) on a 30s timer once the
 * `PROMETHEUS_PUSHGATEWAY_URL` env var is wired. See
 * `infra/monitoring/grafana-cloud.yaml` for the dashboard contract.
 * TODO(obs-slo-2): expose error-budget burn rate (fast 1h + slow 6h
 * windows per the SRE workbook) once targets are agreed with product.
 */

// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

export interface LatencyStats {
  /** Number of samples currently held in the window. */
  count: number;
  /** Arithmetic mean in ms. 0 when no samples. */
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface SloComponentSnapshot {
  name: string;
  latency: LatencyStats;
  /** Total errors recorded within the current rolling window. */
  errors: number;
  /** Ratio of errors to (errors + successful latency samples). */
  errorRate: number;
}

export interface SloSnapshot {
  /** Milliseconds worth of data the window covers. */
  windowMs: number;
  /** Maximum samples kept per metric. */
  sampleCap: number;
  components: SloComponentSnapshot[];
  /** Unix ms at which the snapshot was produced. */
  takenAt: number;
}

// -----------------------------------------------------------------------
// Tunables
// -----------------------------------------------------------------------

// Kept conservative so this works on a single Vercel serverless container
// without ballooning heap. A production deployment that needs longer
// retention should push samples to Prometheus (see TODO above) rather
// than grow these numbers.
const DEFAULT_SAMPLE_CAP = 500;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface LatencySample {
  t: number;
  ms: number;
}

interface ErrorSample {
  t: number;
}

interface ComponentState {
  latency: LatencySample[];
  errors: ErrorSample[];
}

const state = new Map<string, ComponentState>();

function getComponent(name: string): ComponentState {
  let c = state.get(name);
  if (!c) {
    c = { latency: [], errors: [] };
    state.set(name, c);
  }
  return c;
}

function prune(samples: { t: number }[], now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  // Samples are appended in chronological order so a linear scan from
  // the head is enough. We mutate in place to avoid allocating a new
  // array on every record call.
  let drop = 0;
  for (const s of samples) {
    if (s.t >= cutoff) break;
    drop += 1;
  }
  if (drop > 0) samples.splice(0, drop);
}

// -----------------------------------------------------------------------
// Recorders
// -----------------------------------------------------------------------

export interface RecordOptions {
  /** How long to keep samples, in ms. Default 15m. */
  windowMs?: number;
  /** Max samples to retain per component. Default 500. */
  sampleCap?: number;
  /** Override `Date.now()`. Only used in tests. */
  now?: number;
}

export function recordLatency(
  name: string,
  ms: number,
  opts: RecordOptions = {},
): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const cap = opts.sampleCap ?? DEFAULT_SAMPLE_CAP;
  const c = getComponent(name);
  c.latency.push({ t: now, ms });
  prune(c.latency, now, windowMs);
  if (c.latency.length > cap) {
    c.latency.splice(0, c.latency.length - cap);
  }
}

export function recordError(name: string, opts: RecordOptions = {}): void {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const cap = opts.sampleCap ?? DEFAULT_SAMPLE_CAP;
  const c = getComponent(name);
  c.errors.push({ t: now });
  prune(c.errors, now, windowMs);
  if (c.errors.length > cap) {
    c.errors.splice(0, c.errors.length - cap);
  }
}

// -----------------------------------------------------------------------
// Percentile helpers
// -----------------------------------------------------------------------

/**
 * Linear-interpolation percentile, same definition as `numpy.percentile`
 * with default `linear` method. Returns 0 for an empty input.
 *
 * Exported primarily for tests; most callers want `snapshotSlo()`.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = clamped * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo] ?? 0;
  const loVal = sortedValues[lo] ?? 0;
  const hiVal = sortedValues[hi] ?? 0;
  const frac = idx - lo;
  return loVal + (hiVal - loVal) * frac;
}

function computeLatency(samples: LatencySample[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    avg: sum / sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

// -----------------------------------------------------------------------
// Snapshot
// -----------------------------------------------------------------------

export interface SnapshotOptions {
  windowMs?: number;
  sampleCap?: number;
  now?: number;
}

export function snapshotSlo(opts: SnapshotOptions = {}): SloSnapshot {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const cap = opts.sampleCap ?? DEFAULT_SAMPLE_CAP;

  const components: SloComponentSnapshot[] = [];
  for (const [name, c] of state.entries()) {
    // Prune lazily on read so old metrics don't keep reporting stale data
    // when a component has gone quiet.
    prune(c.latency, now, windowMs);
    prune(c.errors, now, windowMs);
    const latency = computeLatency(c.latency);
    const denom = latency.count + c.errors.length;
    const errorRate = denom === 0 ? 0 : c.errors.length / denom;
    components.push({
      name,
      latency,
      errors: c.errors.length,
      errorRate,
    });
  }
  components.sort((a, b) => a.name.localeCompare(b.name));

  return {
    windowMs,
    sampleCap: cap,
    components,
    takenAt: now,
  };
}

/** Clear all SLO state. Intended for tests. */
export function __resetSlo(): void {
  state.clear();
}

// -----------------------------------------------------------------------
// Pushgateway flush stub
// -----------------------------------------------------------------------

/**
 * Placeholder for Prometheus pushgateway flush. Called on a timer by the
 * app process once the env var is wired. Until then it's a no-op we can
 * unit-test around.
 *
 * TODO(obs-slo-1): implement OTLP/HTTP or pushgateway write here using
 * `fetch` against `process.env.PROMETHEUS_PUSHGATEWAY_URL` with basic
 * auth from `PROMETHEUS_PUSHGATEWAY_TOKEN`.
 */
export async function flushSloToPushgateway(): Promise<
  { ok: true; pushed: number } | { ok: false; reason: string }
> {
  const url = process.env.PROMETHEUS_PUSHGATEWAY_URL;
  if (!url) return { ok: false, reason: "no_pushgateway_url" };
  // Intentionally unimplemented — see TODO above.
  return { ok: false, reason: "not_implemented" };
}

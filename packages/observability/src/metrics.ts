/**
 * In-process counters + histograms for local development and tests.
 *
 * NOTE: This is intentionally simple. Production deployments should read
 * request metrics from Vercel Analytics, Grafana, or an OpenTelemetry
 * collector — not from this module. The helpers here exist so developers can
 * eyeball cost / latency distributions on a laptop without standing up an
 * entire telemetry stack.
 */

export type MetricLabels = Record<string, string | number>;

type CounterEntry = {
  name: string;
  labels: MetricLabels;
  value: number;
};

type HistogramEntry = {
  name: string;
  labels: MetricLabels;
  count: number;
  sum: number;
  min: number;
  max: number;
  // Buckets are the classic SRE-golden-signals set. Units are whatever the
  // caller passes in (we default to ms). Callers that need different bucket
  // boundaries should graduate to Prometheus + otel.
  buckets: number[];
  bucketCounts: number[];
};

const DEFAULT_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];

const counters = new Map<string, CounterEntry>();
const histograms = new Map<string, HistogramEntry>();

function keyOf(name: string, labels: MetricLabels | undefined): string {
  if (!labels) return name;
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${String(labels[k])}`);
  return parts.length ? `${name}{${parts.join(",")}}` : name;
}

export function incr(name: string, labels?: MetricLabels, delta = 1): void {
  const key = keyOf(name, labels);
  const entry = counters.get(key);
  if (entry) {
    entry.value += delta;
    return;
  }
  counters.set(key, { name, labels: labels ?? {}, value: delta });
}

export function observe(name: string, value: number, labels?: MetricLabels): void {
  const key = keyOf(name, labels);
  let entry = histograms.get(key);
  if (!entry) {
    entry = {
      name,
      labels: labels ?? {},
      count: 0,
      sum: 0,
      min: value,
      max: value,
      buckets: DEFAULT_BUCKETS_MS,
      bucketCounts: new Array(DEFAULT_BUCKETS_MS.length + 1).fill(0),
    };
    histograms.set(key, entry);
  }
  entry.count += 1;
  entry.sum += value;
  if (value < entry.min) entry.min = value;
  if (value > entry.max) entry.max = value;
  let placed = false;
  for (let i = 0; i < entry.buckets.length; i += 1) {
    const boundary = entry.buckets[i];
    if (boundary !== undefined && value <= boundary) {
      const bc = entry.bucketCounts[i];
      entry.bucketCounts[i] = (bc ?? 0) + 1;
      placed = true;
      break;
    }
  }
  if (!placed) {
    const last = entry.bucketCounts.length - 1;
    const bc = entry.bucketCounts[last];
    entry.bucketCounts[last] = (bc ?? 0) + 1;
  }
}

export type MetricsSnapshot = {
  counters: Array<{ name: string; labels: MetricLabels; value: number }>;
  histograms: Array<{
    name: string;
    labels: MetricLabels;
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    buckets: number[];
    bucketCounts: number[];
  }>;
};

export function snapshot(): MetricsSnapshot {
  return {
    counters: [...counters.values()].map((c) => ({ ...c })),
    histograms: [...histograms.values()].map((h) => ({
      name: h.name,
      labels: h.labels,
      count: h.count,
      sum: h.sum,
      avg: h.count === 0 ? 0 : h.sum / h.count,
      min: h.min,
      max: h.max,
      buckets: [...h.buckets],
      bucketCounts: [...h.bucketCounts],
    })),
  };
}

/** Clear all in-memory metrics. Intended for tests. */
export function __resetMetrics(): void {
  counters.clear();
  histograms.clear();
}

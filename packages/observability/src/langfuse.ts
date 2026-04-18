/**
 * Langfuse integration (LLM tracing).
 *
 * The SDK is loaded lazily and the singleton returned by `initLangfuse` is
 * `null` whenever `LANGFUSE_PUBLIC_KEY` is missing — all helpers in this
 * module are safe to call without any env configured (they become no-ops).
 *
 * `withLlmTrace` is the primary surface used by API routes. It records input,
 * output, usage, cost and latency. Flushing is scheduled asynchronously so the
 * request path is never blocked on the Langfuse network round-trip.
 */

import type { UsageRecord } from "@sparkflow/shared";
import { logger } from "./logger";

// We deliberately type the SDK loosely. The langfuse package ships real types
// but we resolve it dynamically so the file typechecks even before
// `pnpm install` has been run in this workspace.
type LangfuseLike = {
  trace: (args: {
    name: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }) => LangfuseTraceLike;
  flushAsync: () => Promise<void>;
};

type LangfuseTraceLike = {
  update: (args: { output?: unknown; metadata?: Record<string, unknown> }) => void;
  generation: (args: {
    name: string;
    input?: unknown;
    output?: unknown;
    model?: string;
    usage?: unknown;
    metadata?: Record<string, unknown>;
    startTime?: Date;
    endTime?: Date;
  }) => LangfuseTraceLike;
  span: (args: {
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    startTime?: Date;
    endTime?: Date;
  }) => LangfuseTraceLike;
};

let singleton: LangfuseLike | null | undefined;

/**
 * Returns a shared Langfuse client, or `null` when not configured.
 * The dynamic import is guarded by a try/catch so a missing/unbuilt package
 * never crashes the process; we log once and then cache the `null` result.
 */
export function initLangfuse(): LangfuseLike | null {
  if (singleton !== undefined) return singleton;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    singleton = null;
    return singleton;
  }

  try {
    // Use eval("require") so this file still typechecks without the SDK's
    // type declarations present in the workspace before install.
    const req = eval("require") as (id: string) => unknown;
    const mod = req("langfuse") as { Langfuse?: new (opts: unknown) => LangfuseLike } & {
      default?: new (opts: unknown) => LangfuseLike;
    };
    const Ctor = mod.Langfuse ?? mod.default;
    if (!Ctor) {
      logger.warn("[langfuse] SDK loaded but no Langfuse constructor found");
      singleton = null;
      return singleton;
    }
    singleton = new Ctor({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com",
    });
    return singleton;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[langfuse] failed to initialise; tracing disabled",
    );
    singleton = null;
    return singleton;
  }
}

export type LlmTraceMetadata = {
  provider?: string;
  model?: string;
  mode?: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  tags?: string[];
  // Anything extra flows through verbatim.
  [key: string]: unknown;
};

/**
 * Shape returned by `fn` in `withLlmTrace`. We try to extract usage & content
 * automatically when the caller's result has the matching fields.
 */
type MaybeLlmResult = {
  content?: unknown;
  usage?: UsageRecord;
  model?: string;
  provider?: string;
};

/**
 * Wraps an LLM call, producing a Langfuse trace + generation. If Langfuse is
 * not configured, the wrapper is equivalent to `await fn()` with a single
 * structured log line for local dev visibility.
 */
export async function withLlmTrace<T extends MaybeLlmResult | unknown>(
  name: string,
  metadata: LlmTraceMetadata,
  fn: () => Promise<T>,
): Promise<T> {
  const client = initLangfuse();
  const startTime = new Date();
  const start = performance.now();

  if (!client) {
    try {
      const result = await fn();
      const latencyMs = Math.round(performance.now() - start);
      logger.debug(
        { name, latencyMs, metadata: sanitizeMeta(metadata) },
        "llm.call",
      );
      return result;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      logger.error(
        {
          name,
          latencyMs,
          err: err instanceof Error ? err.message : String(err),
        },
        "llm.call.error",
      );
      throw err;
    }
  }

  const trace = client.trace({
    name,
    input: metadata.input,
    metadata: sanitizeMeta(metadata),
    tags: metadata.tags,
  });

  try {
    const result = (await fn()) as T;
    const endTime = new Date();
    const latencyMs = Math.round(performance.now() - start);
    const asLlm = result as MaybeLlmResult;
    const usage = asLlm?.usage;

    trace.generation({
      name: `${name}.generation`,
      input: metadata.input,
      output: asLlm?.content,
      model: asLlm?.model ?? metadata.model,
      startTime,
      endTime,
      usage: usage
        ? {
            input: usage.inputTokens,
            output: usage.outputTokens,
            total: usage.inputTokens + usage.outputTokens,
            unit: "TOKENS",
            inputCost: undefined,
            outputCost: undefined,
            totalCost: usage.costUsd,
          }
        : undefined,
      metadata: {
        provider: asLlm?.provider ?? metadata.provider,
        latencyMs,
      },
    });

    trace.update({ output: asLlm?.content });

    // Fire-and-forget flush; we do not await it so the request path is
    // never blocked on the Langfuse network round-trip.
    void client.flushAsync().catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[langfuse] flushAsync failed",
      );
    });

    return result;
  } catch (err) {
    const endTime = new Date();
    trace.update({
      output: null,
      metadata: {
        error: err instanceof Error ? err.message : String(err),
        endedAt: endTime.toISOString(),
      },
    });
    void client.flushAsync().catch(() => {
      // already logged above
    });
    throw err;
  }
}

/**
 * Record a tool invocation as a standalone span on its own trace. Used by the
 * agent runtime to get visibility into tool calls when no parent LLM trace is
 * available on the current async context.
 */
export function traceToolCall(
  name: string,
  input: unknown,
  output: unknown,
  latencyMs: number,
): void {
  const client = initLangfuse();
  if (!client) return;
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - latencyMs);
    const trace = client.trace({
      name: `tool:${name}`,
      input,
      metadata: { latencyMs },
    });
    trace.span({
      name,
      input,
      output,
      startTime,
      endTime,
      metadata: { latencyMs },
    });
    void client.flushAsync().catch(() => {});
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), name },
      "[langfuse] traceToolCall failed",
    );
  }
}

/**
 * Drop keys we never want to ship to Langfuse, and narrow to a plain record.
 * The `input` key is surfaced at the top level of the trace instead.
 */
function sanitizeMeta(meta: LlmTraceMetadata): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === "input" || k === "tags") continue;
    out[k] = v;
  }
  return out;
}

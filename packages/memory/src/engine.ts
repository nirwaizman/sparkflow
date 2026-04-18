/**
 * MemoryEngine — high-level API that wraps a `MemoryStore` with an embedder.
 *
 * Call sites use this instead of hitting the store directly so that embedding
 * is handled uniformly:
 *
 *   - `remember` embeds the value at write time.
 *   - `recall`   embeds the query, runs similarity, and thresholds by score.
 *   - `buildContextBlock` formats matches for prompt injection (labelled
 *     explicitly as memories, not retrieved sources).
 */
import type { EmbedFn } from "@sparkflow/rag";
import type {
  MemoryContext,
  MemoryEntry,
  MemoryMatch,
  MemoryScope,
  MemoryStore,
} from "./types";

export interface MemoryEngineOptions {
  store: MemoryStore;
  embed: EmbedFn;
}

export interface RememberArgs {
  ctx: MemoryContext;
  scope: MemoryScope;
  key: string;
  value: string;
}

export interface RecallArgs {
  ctx: MemoryContext;
  query: string;
  scope?: MemoryScope;
  topK?: number;
  /**
   * Cosine-similarity threshold in [0, 1]. Matches below this score are
   * dropped. Defaults to 0.7.
   */
  minScore?: number;
}

export interface ForgetArgs {
  ctx: MemoryContext;
  id: string;
}

export interface ListArgs {
  ctx: MemoryContext;
  scope?: MemoryScope;
}

export class MemoryEngine {
  private readonly store: MemoryStore;
  private readonly embed: EmbedFn;

  constructor(options: MemoryEngineOptions) {
    this.store = options.store;
    this.embed = options.embed;
  }

  /**
   * Persist a fact. Generates an embedding for `value` and upserts on the
   * `(org, user, scope, key)` unique index so repeated calls with the same
   * key overwrite in place.
   */
  async remember(args: RememberArgs): Promise<MemoryEntry> {
    const [embedding] = await this.embed([args.value]);
    return this.store.put({
      organizationId: args.ctx.organizationId,
      userId: args.ctx.userId,
      scope: args.scope,
      key: args.key,
      value: args.value,
      embedding: embedding ?? null,
    });
  }

  /**
   * Retrieve the top-K most similar memories to `query`, filtered by
   * `minScore`. If the caller omits `scope` every scope visible to the
   * tenant is searched.
   */
  async recall(args: RecallArgs): Promise<MemoryMatch[]> {
    const topK = args.topK ?? 5;
    const minScore = args.minScore ?? 0.7;
    const [queryEmbedding] = await this.embed([args.query]);
    if (!queryEmbedding) return [];

    const options: { scope?: MemoryScope; topK: number } = { topK };
    if (args.scope) options.scope = args.scope;

    const matches = await this.store.similarity(
      queryEmbedding,
      args.ctx,
      options,
    );
    return matches.filter((m) => m.score >= minScore);
  }

  async forget(args: ForgetArgs): Promise<void> {
    await this.store.delete(args.id, args.ctx);
  }

  async list(args: ListArgs): Promise<MemoryEntry[]> {
    const options: { scope?: MemoryScope } = {};
    if (args.scope) options.scope = args.scope;
    return this.store.list(args.ctx, options);
  }

  /**
   * Format a list of matches into a text block suitable for prompt injection.
   *
   * We label the block explicitly as MEMORIES (not SOURCES) so downstream
   * citation logic doesn't mistakenly cite them as web/document evidence.
   * The format is deterministic so snapshot tests stay stable.
   */
  buildContextBlock(matches: MemoryMatch[]): string {
    if (matches.length === 0) {
      return "## MEMORIES\n(none)";
    }
    const lines = matches.map((m, i) => {
      const n = i + 1;
      const score = m.score.toFixed(3);
      return `${n}. [${m.entry.scope}] ${m.entry.key}: ${m.entry.value} (score=${score})`;
    });
    return [
      "## MEMORIES",
      "The following are durable facts recalled from long-term memory. They are NOT web sources and must not be cited as such.",
      ...lines,
    ].join("\n");
  }
}

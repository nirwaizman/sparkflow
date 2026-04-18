/**
 * InMemoryStore — a `MemoryStore` implementation backed by plain Maps.
 *
 * Used for unit tests + local development where we don't want to spin up
 * Postgres. Cosine similarity is computed in-process; scopes are filtered
 * with the same semantics as the Postgres store (user/session scoped to
 * the caller, workspace scoped to the org, global shared across tenants).
 */
import { uid } from "@sparkflow/shared";
import type {
  MemoryContext,
  MemoryEntry,
  MemoryListOptions,
  MemoryMatch,
  MemoryScope,
  MemorySimilarityOptions,
  MemoryStore,
} from "../types";

function cosineSim(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Decide whether a stored row is visible to the caller under a given scope
 * filter. This mirrors what the Postgres store does in SQL:
 *
 *   - session + user → must match both org and user.
 *   - workspace      → must match org; user is irrelevant.
 *   - global         → visible to everyone.
 */
function rowVisible(
  entry: MemoryEntry,
  ctx: MemoryContext,
  scope: MemoryScope,
): boolean {
  if (entry.scope !== scope) return false;
  switch (scope) {
    case "session":
    case "user":
      return (
        entry.organizationId === ctx.organizationId &&
        entry.userId === ctx.userId
      );
    case "workspace":
      return entry.organizationId === ctx.organizationId;
    case "global":
      return true;
  }
}

export class InMemoryStore implements MemoryStore {
  private readonly rows = new Map<string, MemoryEntry>();

  private uniqKey(
    organizationId: string,
    userId: string,
    scope: MemoryScope,
    key: string,
  ): string {
    return `${organizationId}|${userId}|${scope}|${key}`;
  }

  private findByUnique(
    organizationId: string,
    userId: string,
    scope: MemoryScope,
    key: string,
  ): MemoryEntry | undefined {
    const needle = this.uniqKey(organizationId, userId, scope, key);
    for (const entry of this.rows.values()) {
      if (
        this.uniqKey(
          entry.organizationId,
          entry.userId,
          entry.scope,
          entry.key,
        ) === needle
      ) {
        return entry;
      }
    }
    return undefined;
  }

  async get(
    key: string,
    ctx: MemoryContext,
    scope: MemoryScope,
  ): Promise<MemoryEntry | null> {
    const hit = this.findByUnique(ctx.organizationId, ctx.userId, scope, key);
    return hit ?? null;
  }

  async put(
    entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<MemoryEntry> {
    const now = new Date();
    const existing = this.findByUnique(
      entry.organizationId,
      entry.userId,
      entry.scope,
      entry.key,
    );

    if (existing) {
      const updated: MemoryEntry = {
        ...existing,
        value: entry.value,
        embedding: entry.embedding ?? existing.embedding ?? null,
        updatedAt: now,
      };
      this.rows.set(existing.id, updated);
      return updated;
    }

    const id = entry.id ?? uid("mem");
    const created: MemoryEntry = {
      id,
      organizationId: entry.organizationId,
      userId: entry.userId,
      scope: entry.scope,
      key: entry.key,
      value: entry.value,
      embedding: entry.embedding ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(id, created);
    return created;
  }

  async delete(id: string, ctx: MemoryContext): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    // Enforce tenant isolation: only the owning org/user (or a workspace/
    // global row in the same org) can drop a row.
    if (row.organizationId !== ctx.organizationId) return;
    if (
      (row.scope === "session" || row.scope === "user") &&
      row.userId !== ctx.userId
    ) {
      return;
    }
    this.rows.delete(id);
  }

  async list(
    ctx: MemoryContext,
    options: MemoryListOptions = {},
  ): Promise<MemoryEntry[]> {
    const out: MemoryEntry[] = [];
    for (const entry of this.rows.values()) {
      if (options.scope) {
        if (!rowVisible(entry, ctx, options.scope)) continue;
      } else {
        // Any scope visible to the caller.
        const scopes: MemoryScope[] = [
          "session",
          "user",
          "workspace",
          "global",
        ];
        if (!scopes.some((s) => rowVisible(entry, ctx, s))) continue;
      }
      out.push(entry);
    }
    return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async similarity(
    query: number[],
    ctx: MemoryContext,
    options: MemorySimilarityOptions,
  ): Promise<MemoryMatch[]> {
    const topK = options.topK ?? 5;
    const candidates: MemoryMatch[] = [];
    for (const entry of this.rows.values()) {
      if (!entry.embedding || entry.embedding.length === 0) continue;
      if (options.scope) {
        if (!rowVisible(entry, ctx, options.scope)) continue;
      } else {
        const scopes: MemoryScope[] = [
          "session",
          "user",
          "workspace",
          "global",
        ];
        if (!scopes.some((s) => rowVisible(entry, ctx, s))) continue;
      }
      candidates.push({ entry, score: cosineSim(query, entry.embedding) });
    }
    return candidates.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

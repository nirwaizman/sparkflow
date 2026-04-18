/**
 * SessionMemory — in-process, conversation-scoped key/value store.
 *
 * Lives for the duration of a single request/conversation. Not durable; not
 * shared across processes. Use this for the "scratch pad" an agent needs
 * within one turn (working memory), and promote anything durable to the
 * long-term `MemoryEngine` via `remember()`.
 *
 * Entries are keyed by `conversationId:key` internally so a single instance
 * can be reused across simultaneous conversations without cross-talk.
 */
export class SessionMemory {
  private readonly store = new Map<string, string>();

  private compositeKey(conversationId: string, key: string): string {
    return `${conversationId}:${key}`;
  }

  get(conversationId: string, key: string): string | undefined {
    return this.store.get(this.compositeKey(conversationId, key));
  }

  set(conversationId: string, key: string, value: string): void {
    this.store.set(this.compositeKey(conversationId, key), value);
  }

  delete(conversationId: string, key: string): boolean {
    return this.store.delete(this.compositeKey(conversationId, key));
  }

  /**
   * Return every (key -> value) pair for a given conversation. Returns an
   * empty object if the conversation has no entries.
   */
  all(conversationId: string): Record<string, string> {
    const prefix = `${conversationId}:`;
    const out: Record<string, string> = {};
    for (const [composite, value] of this.store.entries()) {
      if (composite.startsWith(prefix)) {
        out[composite.slice(prefix.length)] = value;
      }
    }
    return out;
  }

  /**
   * Drop every entry for a conversation. If `conversationId` is omitted the
   * entire session memory is wiped — useful at process shutdown or in tests.
   */
  clear(conversationId?: string): void {
    if (conversationId === undefined) {
      this.store.clear();
      return;
    }
    const prefix = `${conversationId}:`;
    for (const composite of Array.from(this.store.keys())) {
      if (composite.startsWith(prefix)) {
        this.store.delete(composite);
      }
    }
  }
}

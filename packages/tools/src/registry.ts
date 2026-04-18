import type { ToolDefinition } from "@sparkflow/llm";
import type { ToolCategory, ToolRegistration } from "./types";

/**
 * In-memory registry of tools available to agents and the planner.
 *
 * The registry is intentionally simple (a Map keyed by tool name). It is
 * the single source of truth for which tools exist; category / safety
 * metadata is co-located with the definition so the runtime can make
 * policy decisions without inspecting the tool itself.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolRegistration>();

  /**
   * Register a tool. Throws if a tool with the same name already exists —
   * duplicate names are almost always a bug (shadowing silently would
   * cause hard-to-debug behaviour differences between envs).
   */
  add<TParams, TResult>(registration: ToolRegistration<TParams, TResult>): void {
    const name = registration.tool.name;
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }
    // The registry stores the widened form; callers recover type info via
    // their own imports of the concrete tool.
    this.tools.set(name, registration as unknown as ToolRegistration);
  }

  get(name: string): ToolRegistration | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools, optionally filtered by category.
   */
  list(filter?: { category?: ToolCategory }): ToolRegistration[] {
    const all = Array.from(this.tools.values());
    if (!filter?.category) return all;
    return all.filter((r) => r.category === filter.category);
  }

  /**
   * Produce the shape `@sparkflow/llm`'s `generate({ tools })` expects — a
   * record keyed by tool name. Optionally restrict to a subset of names
   * (e.g. the tools an individual agent is allowed to call).
   */
  toLlmTools(names?: string[]): Record<string, ToolDefinition> {
    const out: Record<string, ToolDefinition> = {};
    const source = names
      ? names
          .map((n) => this.tools.get(n))
          .filter((r): r is ToolRegistration => r !== undefined)
      : Array.from(this.tools.values());
    for (const reg of source) {
      out[reg.tool.name] = reg.tool;
    }
    return out;
  }
}

/** Default singleton. Most callers should use this. */
export const registry: ToolRegistry = new ToolRegistry();

import { generate, generateStream } from "@sparkflow/llm";
import type { ChatMessage } from "@sparkflow/shared";
import type { ToolRegistry } from "@sparkflow/tools";
import type {
  AgentDefinition,
  AgentEvent,
  AgentRunInput,
  AgentRunResult,
  AgentToolCallTrace,
} from "./types";

/**
 * Runtime wrapper around an AgentDefinition.
 *
 * An Agent binds a declarative definition (prompt, tool allow-list,
 * memory scope) to an actual ToolRegistry and the `@sparkflow/llm`
 * gateway. It exposes:
 *   - `run()`  — one-shot, returns the final answer + tool trace.
 *   - `stream()` — async iterable of AgentEvent for live UIs.
 */
export class Agent {
  readonly definition: AgentDefinition;
  private readonly registry: ToolRegistry;

  constructor(definition: AgentDefinition, registry: ToolRegistry) {
    this.definition = definition;
    this.registry = registry;
  }

  /** Resolve the agent's allowed tools into the shape @sparkflow/llm expects. */
  private llmTools() {
    return this.registry.toLlmTools(this.definition.tools);
  }

  /** Build the full message list the model will see. */
  private buildMessages(input: AgentRunInput): ChatMessage[] {
    const history = input.history ?? [];
    const prompt: ChatMessage = {
      id: `agent_${this.definition.id}_user`,
      role: "user",
      content: input.prompt,
    };
    return [...history, prompt];
  }

  /**
   * One-shot run. Today this is a single generate() call; the full
   * tool-calling loop (re-feeding tool results on each turn) will layer
   * on top once the gateway exposes it in WP-B2. Tool trace is left as
   * an empty array when the model doesn't request any calls.
   */
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const result = await generate({
      model: this.definition.model,
      system: this.definition.systemPrompt,
      messages: this.buildMessages(input),
      temperature: this.definition.temperature,
      tools: this.llmTools(),
      toolChoice: this.definition.tools.length === 0 ? "none" : "auto",
    });

    const toolCalls: AgentToolCallTrace[] = (result.toolCalls ?? []).map(
      (tc) => ({
        name: tc.name,
        input: tc.args,
        // The minimal gateway used today doesn't execute tools inline;
        // the multi-turn loop (WP-B2) will populate `output`.
        output: undefined,
      }),
    );

    return {
      content: result.content,
      toolCalls,
      usage: result.usage,
      metadata: {
        provider: result.provider,
        model: result.model,
        finishReason: result.finishReason,
      },
    };
  }

  /**
   * Stream agent progress as AgentEvents. Yields a `start`, a sequence
   * of `token` events, and a final `finish`. Error paths yield `error`
   * and then stop.
   */
  async *stream(input: AgentRunInput): AsyncIterable<AgentEvent> {
    yield {
      type: "start",
      payload: { agentId: this.definition.id, prompt: input.prompt },
    };
    try {
      // `generateStream` returns the AI SDK `StreamTextResult`; token
      // chunks live on `.textStream`. Usage / finishReason resolve after
      // the stream closes (we ignore them here; the full usage record
      // is emitted by `run()` once WP-B2 lands the unified loop).
      const result = generateStream({
        model: this.definition.model,
        system: this.definition.systemPrompt,
        messages: this.buildMessages(input),
        temperature: this.definition.temperature,
        tools: this.llmTools(),
        toolChoice: this.definition.tools.length === 0 ? "none" : "auto",
      });
      let assembled = "";
      for await (const delta of result.textStream) {
        assembled += delta;
        yield { type: "token", payload: { delta } };
      }
      yield { type: "finish", payload: { content: assembled } };
    } catch (err) {
      yield {
        type: "error",
        payload: {
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

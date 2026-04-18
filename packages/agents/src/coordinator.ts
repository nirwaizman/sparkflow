import type { Agent } from "./agent";
import type { AgentEvent, AgentRunInput } from "./types";

/**
 * Orchestration patterns supported by the coordinator. Each maps to a
 * method below.
 */
export type CollabMode =
  | "sequential"
  | "parallel"
  | "debate"
  | "self_critique"
  | "hierarchical";

export type CoordinatorResult = {
  content: string;
  trace: AgentEvent[];
};

/** Internal helper: record a lifecycle event into the trace. */
function push(trace: AgentEvent[], event: AgentEvent): void {
  trace.push(event);
}

/**
 * Multi-agent orchestrator. Stateless — all methods take the agents
 * they need as arguments so callers can compose any team.
 *
 * All methods return `{ content, trace }`:
 *   - `content`: the final merged answer.
 *   - `trace`: a flat AgentEvent log (start/tool/thought/finish) from
 *     every participating agent, in execution order. UIs and evals can
 *     replay this to show how the answer was produced.
 */
export class Coordinator {
  /** Pipe the output of each agent into the next agent's prompt. */
  async runSequential(goal: string, agents: Agent[]): Promise<CoordinatorResult> {
    const trace: AgentEvent[] = [];
    let current = goal;
    for (const agent of agents) {
      push(trace, {
        type: "start",
        payload: { agentId: agent.definition.id, prompt: current },
      });
      const result = await agent.run({ prompt: current });
      for (const tc of result.toolCalls) {
        push(trace, {
          type: "tool_start",
          payload: { name: tc.name, input: tc.input },
        });
        push(trace, {
          type: "tool_end",
          payload: { name: tc.name, output: tc.output, durationMs: 0 },
        });
      }
      push(trace, {
        type: "finish",
        payload: { content: result.content, usage: result.usage },
      });
      current = result.content;
    }
    return { content: current, trace };
  }

  /** Run every agent on the same goal in parallel, then concatenate. */
  async runParallel(goal: string, agents: Agent[]): Promise<CoordinatorResult> {
    const trace: AgentEvent[] = [];
    const input: AgentRunInput = { prompt: goal };
    const results = await Promise.all(
      agents.map(async (agent) => {
        push(trace, {
          type: "start",
          payload: { agentId: agent.definition.id, prompt: goal },
        });
        const r = await agent.run(input);
        push(trace, {
          type: "finish",
          payload: { content: r.content, usage: r.usage },
        });
        return { agent, result: r };
      }),
    );
    const merged = results
      .map(({ agent, result }) => `### ${agent.definition.name}\n${result.content}`)
      .join("\n\n");
    return { content: merged, trace };
  }

  /**
   * Debate: agents take turns, each responding to the running transcript
   * until `rounds` complete. Final content is the last speaker's reply.
   */
  async runDebate(
    goal: string,
    agents: Agent[],
    rounds = 3,
  ): Promise<CoordinatorResult> {
    const trace: AgentEvent[] = [];
    if (agents.length === 0) return { content: "", trace };
    const transcript: string[] = [`GOAL: ${goal}`];
    let lastContent = "";
    for (let round = 0; round < rounds; round++) {
      for (const agent of agents) {
        const prompt = [
          `Debate round ${round + 1}/${rounds}.`,
          `Transcript so far:\n${transcript.join("\n\n")}`,
          `As ${agent.definition.name}, respond.`,
        ].join("\n\n");
        push(trace, {
          type: "start",
          payload: { agentId: agent.definition.id, prompt },
        });
        const r = await agent.run({ prompt });
        push(trace, {
          type: "finish",
          payload: { content: r.content, usage: r.usage },
        });
        transcript.push(`${agent.definition.name}: ${r.content}`);
        lastContent = r.content;
      }
    }
    return { content: lastContent, trace };
  }

  /**
   * Self-critique loop: `author` drafts, `critic` critiques, `author`
   * revises. Runs up to `maxLoops` critique/revision iterations.
   */
  async runSelfCritique(
    goal: string,
    author: Agent,
    critic: Agent,
    maxLoops = 2,
  ): Promise<CoordinatorResult> {
    const trace: AgentEvent[] = [];
    push(trace, {
      type: "start",
      payload: { agentId: author.definition.id, prompt: goal },
    });
    let draft = (await author.run({ prompt: goal })).content;
    push(trace, { type: "finish", payload: { content: draft } });

    for (let i = 0; i < maxLoops; i++) {
      const critiquePrompt = `Please critique this draft against the goal: ${goal}\n\nDRAFT:\n${draft}`;
      push(trace, {
        type: "start",
        payload: { agentId: critic.definition.id, prompt: critiquePrompt },
      });
      const critique = (await critic.run({ prompt: critiquePrompt })).content;
      push(trace, { type: "finish", payload: { content: critique } });

      const revisionPrompt = [
        `Revise the draft according to this critique. If the critique says it is already good, return the draft unchanged.`,
        `GOAL: ${goal}`,
        `CRITIQUE:\n${critique}`,
        `DRAFT:\n${draft}`,
      ].join("\n\n");
      push(trace, {
        type: "start",
        payload: { agentId: author.definition.id, prompt: revisionPrompt },
      });
      const revised = (await author.run({ prompt: revisionPrompt })).content;
      push(trace, { type: "finish", payload: { content: revised } });

      if (revised.trim() === draft.trim()) {
        // Author signalled convergence by returning the draft unchanged.
        draft = revised;
        break;
      }
      draft = revised;
    }
    return { content: draft, trace };
  }

  /**
   * Hierarchical: a manager decomposes the goal into subtasks, each
   * worker takes the subtask whose index matches its position in
   * `workers`, and the manager merges the results into a final answer.
   */
  async runHierarchical(
    goal: string,
    manager: Agent,
    workers: Agent[],
  ): Promise<CoordinatorResult> {
    const trace: AgentEvent[] = [];

    // 1. Manager decomposes.
    const decomposePrompt = [
      `Decompose the following goal into ${workers.length} independent subtasks,`,
      `one per worker, in the order of the worker list below. Respond with a`,
      `numbered list and nothing else.`,
      ``,
      `GOAL: ${goal}`,
      ``,
      `WORKERS:`,
      ...workers.map((w, i) => `${i + 1}. ${w.definition.name} — ${w.definition.role}`),
    ].join("\n");
    push(trace, {
      type: "start",
      payload: { agentId: manager.definition.id, prompt: decomposePrompt },
    });
    const plan = (await manager.run({ prompt: decomposePrompt })).content;
    push(trace, { type: "finish", payload: { content: plan } });

    // Extract numbered lines; fall back to splitting on newlines if the
    // model didn't strictly follow the format.
    const lines = plan
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const numbered = lines.filter((l) => /^\d+[.)]/.test(l));
    const subtasks = (numbered.length >= workers.length ? numbered : lines)
      .slice(0, workers.length)
      .map((l) => l.replace(/^\d+[.)]\s*/, ""));

    // 2. Workers execute in parallel.
    const workerResults = await Promise.all(
      workers.map(async (w, i) => {
        const subtask = subtasks[i] ?? goal;
        push(trace, {
          type: "start",
          payload: { agentId: w.definition.id, prompt: subtask },
        });
        const r = await w.run({ prompt: subtask });
        push(trace, {
          type: "finish",
          payload: { content: r.content, usage: r.usage },
        });
        return { worker: w, subtask, result: r };
      }),
    );

    // 3. Manager merges.
    const mergePrompt = [
      `Merge these worker outputs into a single cohesive answer for the goal.`,
      `GOAL: ${goal}`,
      ``,
      ...workerResults.map(
        ({ worker, subtask, result }) =>
          `## ${worker.definition.name}\nSUBTASK: ${subtask}\nOUTPUT:\n${result.content}`,
      ),
    ].join("\n\n");
    push(trace, {
      type: "start",
      payload: { agentId: manager.definition.id, prompt: mergePrompt },
    });
    const merged = (await manager.run({ prompt: mergePrompt })).content;
    push(trace, { type: "finish", payload: { content: merged } });

    return { content: merged, trace };
  }
}

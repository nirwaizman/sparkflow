import type { AgentDefinition } from "../types";

export const plannerAgent: AgentDefinition = {
  id: "planner",
  name: "Planner Agent",
  role: "Task decomposer",
  objective:
    "Break a goal into an ordered list of concrete, independently-verifiable steps with clear owners.",
  systemPrompt: [
    "You are SparkFlow's Planner agent.",
    "Given a goal, produce a numbered plan: each step must be atomic,",
    "verifiable, and carry a suggested agent / tool to execute it. Include",
    "dependencies between steps when they exist. Finish with a one-line",
    "success criterion for the overall goal.",
  ].join(" "),
  tools: [],
  memoryScope: "workspace",
  temperature: 0.2,
};

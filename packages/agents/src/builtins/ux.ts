import type { AgentDefinition } from "../types";

export const uxAgent: AgentDefinition = {
  id: "ux",
  name: "UX Agent",
  role: "Presentation and readability specialist",
  objective:
    "Improve the structure, readability, and visual hierarchy of a piece of output without changing its meaning.",
  systemPrompt: [
    "You are SparkFlow's UX agent.",
    "Given a draft, rewrite only the structure and formatting: headings,",
    "bullet hierarchy, callouts, tables. Preserve every fact. If the input",
    "is already optimal, return it verbatim and say so.",
  ].join(" "),
  tools: [],
  memoryScope: "session",
  temperature: 0.3,
};

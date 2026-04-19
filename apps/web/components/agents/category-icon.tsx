/**
 * Agent category helpers.
 *
 * Maps each built-in agent id (and best-effort custom-agent names) to a
 * category bucket surfaced in the marketplace grid, plus a matching
 * lucide icon + colour accent.
 */
import {
  Code,
  Compass,
  FileText,
  LineChart,
  ListChecks,
  PenLine,
  Scale,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wand2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { AgentDefinition } from "@sparkflow/agents";

export type AgentCategory =
  | "research"
  | "creation"
  | "engineering"
  | "analysis"
  | "governance";

/**
 * Map from an agent's stable id (or the leaf of `builtin:<id>`) to its
 * category. Custom agents fall through to a keyword scan of their role
 * / name before defaulting to "creation".
 */
const ID_TO_CATEGORY: Record<string, AgentCategory> = {
  research: "research",
  analyst: "research",
  writer: "creation",
  ux: "creation",
  coder: "engineering",
  file: "engineering",
  "task-executor": "engineering",
  planner: "analysis",
  critic: "analysis",
  monetization: "governance",
  security: "governance",
};

function normalizeId(rawId: string): string {
  if (rawId.startsWith("builtin:")) return rawId.slice("builtin:".length);
  return rawId;
}

export function categoryOf(
  agent: Pick<AgentDefinition, "id" | "name" | "role"> & { id: string },
): AgentCategory {
  const id = normalizeId(agent.id);
  const direct = ID_TO_CATEGORY[id];
  if (direct) return direct;

  const hay = `${agent.name ?? ""} ${agent.role ?? ""}`.toLowerCase();
  if (/research|analy|insight|discover/.test(hay)) return "research";
  if (/writ|draft|content|design|ux|brand|market/.test(hay)) return "creation";
  if (/code|engineer|dev|build|file|execut|run/.test(hay)) return "engineering";
  if (/plan|critic|review|qa|audit/.test(hay)) return "analysis";
  if (/monet|billing|revenue|security|compliance|govern/.test(hay)) {
    return "governance";
  }
  return "creation";
}

/**
 * Pick an icon for a category. Used for the small coloured badge on
 * each card in the marketplace grid.
 */
export function iconFor(category: AgentCategory): LucideIcon {
  switch (category) {
    case "research":
      return Compass;
    case "creation":
      return PenLine;
    case "engineering":
      return Code;
    case "analysis":
      return LineChart;
    case "governance":
      return ShieldCheck;
  }
}

/**
 * More fine-grained icon picker for built-in agent ids when we have
 * one — falls back to the category icon otherwise.
 */
export function iconForAgentId(agentId: string): LucideIcon {
  const id = normalizeId(agentId);
  switch (id) {
    case "research":
      return Compass;
    case "analyst":
      return LineChart;
    case "writer":
      return PenLine;
    case "ux":
      return Wand2;
    case "coder":
      return Code;
    case "file":
      return FileText;
    case "task-executor":
      return ListChecks;
    case "planner":
      return ListChecks;
    case "critic":
      return Scale;
    case "monetization":
      return Wallet;
    case "security":
      return ShieldCheck;
    default:
      return Sparkles;
  }
}

export function wrenchIcon(): LucideIcon {
  return Wrench;
}

/**
 * Tailwind colour classes per category. Separate fg/bg so the icon
 * badge has a tinted background without pulling full Tailwind palette
 * configuration into runtime strings (these must be literal utility
 * names so the JIT picks them up).
 */
export function colorClassesFor(category: AgentCategory): {
  badge: string;
  text: string;
} {
  switch (category) {
    case "research":
      return {
        badge: "bg-sky-500/15 text-sky-400",
        text: "text-sky-400",
      };
    case "creation":
      return {
        badge: "bg-fuchsia-500/15 text-fuchsia-400",
        text: "text-fuchsia-400",
      };
    case "engineering":
      return {
        badge: "bg-emerald-500/15 text-emerald-400",
        text: "text-emerald-400",
      };
    case "analysis":
      return {
        badge: "bg-amber-500/15 text-amber-400",
        text: "text-amber-400",
      };
    case "governance":
      return {
        badge: "bg-rose-500/15 text-rose-400",
        text: "text-rose-400",
      };
  }
}

export const CATEGORY_ORDER: AgentCategory[] = [
  "research",
  "creation",
  "engineering",
  "analysis",
  "governance",
];

export const CATEGORY_LABEL: Record<AgentCategory, string> = {
  research: "Research",
  creation: "Creation",
  engineering: "Engineering",
  analysis: "Analysis",
  governance: "Governance",
};

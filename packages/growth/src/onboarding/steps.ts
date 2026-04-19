/**
 * Onboarding tour steps.
 *
 * Each step is anchored to a DOM node via `selector` (a `data-onboarding`
 * attribute value preferred) and has a completion predicate that the
 * client-side tour runner evaluates when deciding whether to mark the
 * step complete without user interaction.
 *
 * Keep this list short — six steps is already the upper bound of what
 * first-run users will tolerate before abandoning the walkthrough.
 */

export type OnboardingStepId =
  | "welcome"
  | "composer"
  | "agents"
  | "workflows"
  | "files"
  | "invite";

export type OnboardingContext = {
  /** Whether the user has sent at least one chat message. */
  hasSentMessage: boolean;
  /** Whether the user has created/cloned at least one agent. */
  hasCreatedAgent: boolean;
  /** Whether the user has a workflow saved. */
  hasCreatedWorkflow: boolean;
  /** Whether the user has uploaded at least one file. */
  hasUploadedFile: boolean;
  /** Whether at least one teammate has been invited. */
  hasInvited: boolean;
};

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** CSS selector or `[data-onboarding="..."]` anchor on the page. */
  selector: string;
  /** Preferred side for the popover relative to the anchor. */
  side: "top" | "right" | "bottom" | "left";
  /** Primary call-to-action label. */
  ctaLabel: string;
  /** Optional route to navigate the user to when CTA is clicked. */
  ctaHref?: string;
  /** Returns `true` when this step can be marked complete from context. */
  isComplete: (ctx: OnboardingContext) => boolean;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to SparkFlow",
    description:
      "A quick tour of the workspace — you can skip at any time from the top-right.",
    selector: "[data-onboarding='workspace-hero']",
    side: "bottom",
    ctaLabel: "Start tour",
    isComplete: () => false,
  },
  {
    id: "composer",
    title: "Ask anything",
    description:
      "Type a prompt here to spin up a chat, research task, or agent run. Attach files, pick a mode, and go.",
    selector: "[data-onboarding='super-composer']",
    side: "bottom",
    ctaLabel: "Try a prompt",
    ctaHref: "/chat/new",
    isComplete: (ctx) => ctx.hasSentMessage,
  },
  {
    id: "agents",
    title: "Hire an agent",
    description:
      "Pre-built agents handle research, data pulls, browsing, and more. Clone one into your workspace to customize it.",
    selector: "[data-onboarding='tile-agents']",
    side: "top",
    ctaLabel: "Browse agents",
    ctaHref: "/agents",
    isComplete: (ctx) => ctx.hasCreatedAgent,
  },
  {
    id: "workflows",
    title: "Automate a workflow",
    description:
      "Chain prompts, tools, and approvals into a reusable run. Trigger manually or on a schedule.",
    selector: "[data-onboarding='tile-workflows']",
    side: "top",
    ctaLabel: "Open workflows",
    ctaHref: "/workflows",
    isComplete: (ctx) => ctx.hasCreatedWorkflow,
  },
  {
    id: "files",
    title: "Bring your knowledge",
    description:
      "Upload PDFs, docs, and sheets to ground answers in your own data.",
    selector: "[data-onboarding='tile-files']",
    side: "top",
    ctaLabel: "Upload a file",
    ctaHref: "/files",
    isComplete: (ctx) => ctx.hasUploadedFile,
  },
  {
    id: "invite",
    title: "Invite your team",
    description:
      "Share the workspace with teammates — plus, you earn credits for every referral that sticks.",
    selector: "[data-onboarding='invite-cta']",
    side: "left",
    ctaLabel: "Invite teammates",
    ctaHref: "/settings/team",
    isComplete: (ctx) => ctx.hasInvited,
  },
] as const;

export function getStep(id: OnboardingStepId): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((s) => s.id === id);
}

export function nextStep(
  currentId: OnboardingStepId | null,
): OnboardingStep | undefined {
  if (!currentId) return ONBOARDING_STEPS[0];
  const idx = ONBOARDING_STEPS.findIndex((s) => s.id === currentId);
  if (idx < 0) return ONBOARDING_STEPS[0];
  return ONBOARDING_STEPS[idx + 1];
}

export function progressPercent(
  completedIds: readonly OnboardingStepId[],
): number {
  if (ONBOARDING_STEPS.length === 0) return 0;
  return Math.round((completedIds.length / ONBOARDING_STEPS.length) * 100);
}

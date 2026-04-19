/**
 * Shared types for the browser automation runner.
 *
 * The LLM plan is a flat `Action[]`. Each action is a discriminated union
 * on `type`. Keep the schema narrow — we only want verbs Playwright can
 * execute deterministically.
 *
 * `BrowserEvent` is what the runner yields and what the SSE endpoint
 * re-emits to the client. The UI uses it to paint the timeline.
 */
import { z } from "zod";

// -----------------------------------------------------------------------
// Actions (Zod schemas — used both for `generateObject` and for runtime
// validation of hand-rolled plans).
// -----------------------------------------------------------------------

export const gotoActionSchema = z.object({
  type: z.literal("goto"),
  url: z.string().url(),
  description: z.string().optional(),
});

export const typeActionSchema = z.object({
  type: z.literal("type"),
  // CSS selector or Playwright role selector (e.g. 'role=textbox[name="Search"]').
  selector: z.string().min(1),
  text: z.string(),
  // Whether to press Enter after typing.
  submit: z.boolean().optional(),
  description: z.string().optional(),
});

export const clickActionSchema = z.object({
  type: z.literal("click"),
  selector: z.string().min(1),
  description: z.string().optional(),
});

export const waitActionSchema = z.object({
  type: z.literal("wait"),
  // Either a selector to wait for, or a duration in ms (max 10s).
  selector: z.string().optional(),
  ms: z.number().int().min(0).max(10_000).optional(),
  description: z.string().optional(),
});

export const extractActionSchema = z.object({
  type: z.literal("extract"),
  // Optional schema-by-example — describe what you want; the LLM structures
  // final output. At runtime we just snapshot the visible text + URL and
  // let the caller interpret it, but we record the intent here.
  instruction: z.string().min(1),
  // Optional selector to scope extraction to (e.g. a results list).
  selector: z.string().optional(),
  description: z.string().optional(),
});

export const actionSchema = z.discriminatedUnion("type", [
  gotoActionSchema,
  typeActionSchema,
  clickActionSchema,
  waitActionSchema,
  extractActionSchema,
]);

export const planSchema = z.object({
  actions: z.array(actionSchema).min(1).max(20),
  // LLM's one-line summary of the plan — shown to the user before execution.
  summary: z.string(),
});

export type GotoAction = z.infer<typeof gotoActionSchema>;
export type TypeAction = z.infer<typeof typeActionSchema>;
export type ClickAction = z.infer<typeof clickActionSchema>;
export type WaitAction = z.infer<typeof waitActionSchema>;
export type ExtractAction = z.infer<typeof extractActionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Plan = z.infer<typeof planSchema>;

// -----------------------------------------------------------------------
// Runtime events (yielded by the runner, streamed to the client).
// -----------------------------------------------------------------------

export type BrowserEvent =
  | { kind: "plan"; plan: Plan }
  | { kind: "action_start"; index: number; action: Action }
  | {
      kind: "action_end";
      index: number;
      action: Action;
      ok: boolean;
      error?: string;
      extracted?: unknown;
    }
  | {
      kind: "screenshot";
      // data URL: `data:image/jpeg;base64,…`
      image: string;
      // 1-based action index this screenshot belongs to.
      actionIndex: number;
    }
  | {
      kind: "finish";
      ok: boolean;
      result?: unknown;
      error?: string;
    };

export interface RunnerOptions {
  /** Cap total run time in ms. Defaults to 90_000. */
  timeoutMs?: number;
  /** Target viewport width. */
  viewportWidth?: number;
  /** Target viewport height. */
  viewportHeight?: number;
  /**
   * Override: force remote (Browserbase) vs. local Playwright. If
   * unspecified, we pick remote iff `BROWSERBASE_API_KEY` is set.
   */
  remote?: boolean;
}

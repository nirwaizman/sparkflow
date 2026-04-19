import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Compute the elapsed time between two ISO timestamps. Returns days,
 * hours, minutes, and total milliseconds; all signed (b - a).
 */
const parameters = z.object({
  a: z.string().min(1).describe("First ISO timestamp (e.g. 2025-01-01T00:00:00Z)"),
  b: z.string().min(1).describe("Second ISO timestamp; delta is b - a"),
});

type Params = z.infer<typeof parameters>;

export type DateDiffResult = {
  a: string;
  b: string;
  ms: number;
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
  humanized: string;
  error?: string;
};

function humanize(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const sec = Math.floor(abs / 1000) % 60;
  const min = Math.floor(abs / 60_000) % 60;
  const hr = Math.floor(abs / 3_600_000) % 24;
  const day = Math.floor(abs / 86_400_000);
  const parts: string[] = [];
  if (day) parts.push(`${day}d`);
  if (hr) parts.push(`${hr}h`);
  if (min) parts.push(`${min}m`);
  if (sec || parts.length === 0) parts.push(`${sec}s`);
  return sign + parts.join(" ");
}

export const dateDiffTool: ToolRegistration<Params, DateDiffResult> = {
  tool: {
    name: "date_diff",
    description:
      "Compute elapsed days / hours / minutes / ms between two ISO timestamps (b - a).",
    parameters,
    handler: async ({ a, b }) => {
      const ta = Date.parse(a);
      const tb = Date.parse(b);
      if (Number.isNaN(ta) || Number.isNaN(tb)) {
        return {
          a,
          b,
          ms: NaN,
          seconds: NaN,
          minutes: NaN,
          hours: NaN,
          days: NaN,
          humanized: "",
          error: "invalid ISO timestamp",
        };
      }
      const ms = tb - ta;
      return {
        a,
        b,
        ms,
        seconds: ms / 1000,
        minutes: ms / 60_000,
        hours: ms / 3_600_000,
        days: ms / 86_400_000,
        humanized: humanize(ms),
      };
    },
  },
  category: "utilities",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 20,
    allowInAutonomousMode: true,
  },
};

import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * HEAD-check a URL and follow redirects manually so we can report the
 * full redirect chain + terminal status.
 */
const parameters = z.object({
  url: z.string().url().describe("Starting URL"),
  maxRedirects: z
    .number()
    .int()
    .nonnegative()
    .max(10)
    .optional()
    .describe("Max redirects to follow (default 5)"),
});

type Params = z.infer<typeof parameters>;

export type UrlCheckResult = {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  redirects: Array<{ from: string; to: string; status: number }>;
  contentType?: string;
  contentLength?: number;
  error?: string;
};

export const urlCheckTool: ToolRegistration<Params, UrlCheckResult> = {
  tool: {
    name: "url_check",
    description:
      "HEAD-check an URL and report status + the redirect chain + content-type.",
    parameters,
    handler: async ({ url, maxRedirects }) => {
      const cap = maxRedirects ?? 5;
      const redirects: UrlCheckResult["redirects"] = [];
      let current = url;
      try {
        for (let i = 0; i <= cap; i++) {
          const res = await fetch(current, { method: "HEAD", redirect: "manual" });
          const status = res.status;
          if (status >= 300 && status < 400 && res.headers.get("location")) {
            const to = new URL(
              res.headers.get("location") as string,
              current,
            ).toString();
            redirects.push({ from: current, to, status });
            current = to;
            continue;
          }
          return {
            url,
            finalUrl: current,
            status,
            ok: res.ok,
            redirects,
            contentType: res.headers.get("content-type") ?? undefined,
            contentLength: res.headers.get("content-length")
              ? Number(res.headers.get("content-length"))
              : undefined,
          };
        }
        return {
          url,
          finalUrl: current,
          status: 0,
          ok: false,
          redirects,
          error: `exceeded ${cap} redirects`,
        };
      } catch (err) {
        return {
          url,
          finalUrl: current,
          status: 0,
          ok: false,
          redirects,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "utilities",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 15,
    allowInAutonomousMode: true,
  },
};

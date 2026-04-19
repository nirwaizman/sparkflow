import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Send a transactional email via Resend. Deliberately NOT allowed in
 * autonomous mode — silent spam is a nightmare.
 */
const parameters = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]).describe("Recipient email(s)"),
  subject: z.string().min(1).describe("Email subject"),
  text: z.string().optional().describe("Plain-text body"),
  html: z.string().optional().describe("HTML body"),
  from: z
    .string()
    .optional()
    .describe("Sender (defaults to RESEND_FROM env or 'noreply@sparkflow.ai')"),
  replyTo: z.string().email().optional().describe("Optional Reply-To address"),
});

type Params = z.infer<typeof parameters>;

export type SendEmailResult = {
  id?: string;
  ok: boolean;
  error?: string;
};

export const sendEmailTool: ToolRegistration<Params, SendEmailResult> = {
  tool: {
    name: "send_email",
    description:
      "Send an email via Resend. Requires RESEND_API_KEY. Requires human confirmation (not allowed in autonomous mode).",
    parameters,
    handler: async ({ to, subject, text, html, from, replyTo }) => {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
      if (!text && !html) {
        return { ok: false, error: "Either `text` or `html` body is required" };
      }
      const sender =
        from ?? process.env.RESEND_FROM ?? "noreply@sparkflow.ai";
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: sender,
            to: Array.isArray(to) ? to : [to],
            subject,
            text,
            html,
            reply_to: replyTo,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          return { ok: false, error: `resend ${res.status}: ${body.slice(0, 200)}` };
        }
        const data = (await res.json()) as { id?: string };
        return { ok: true, id: data.id };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "integrations",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 5,
    allowInAutonomousMode: false,
    redactInputs: (input) => {
      if (typeof input !== "object" || input === null) return input;
      const v = input as Record<string, unknown>;
      return {
        ...v,
        text: typeof v.text === "string" ? "[redacted]" : undefined,
        html: typeof v.html === "string" ? "[redacted]" : undefined,
      };
    },
  },
};

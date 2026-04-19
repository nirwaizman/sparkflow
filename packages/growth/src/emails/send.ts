/**
 * Transactional email wrapper around Resend.
 *
 * Graceful no-op behavior when:
 *   - `RESEND_API_KEY` is unset (dev / preview deploys),
 *   - the `resend` package is not installed at runtime.
 *
 * The goal is that sign-up / billing flows never 500 because of email
 * infrastructure — dropped-on-the-floor is preferable to a failed
 * checkout. Observability captures the skip so we can still alert.
 */

import type { ReactElement } from "react";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** Pre-rendered HTML body. Takes precedence over `react` if both set. */
  html?: string;
  /** React Email element — will be rendered with `@react-email/render`. */
  react?: ReactElement;
  /** Optional plaintext body. */
  text?: string;
  /** Override the default `from` address. */
  from?: string;
  replyTo?: string | string[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: "no_api_key" | "module_missing" }
  | { ok: false; skipped: false; error: string };

type ResendLike = {
  emails: {
    send: (input: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      reply_to?: string | string[];
    }) => Promise<{ data?: { id?: string } | null; error?: { message?: string } | null }>;
  };
};

type ResendCtor = new (key: string) => ResendLike;

function loadResend(): ResendCtor | null {
  try {
    // Deferred require so the package builds even without `resend`
    // installed — same pattern used elsewhere in the monorepo for
    // optional integrations.
    const req = eval("require") as (id: string) => unknown;
    const mod = req("resend") as { Resend?: ResendCtor };
    return mod.Resend ?? null;
  } catch {
    return null;
  }
}

async function renderReact(element: ReactElement): Promise<string> {
  try {
    const req = eval("require") as (id: string) => unknown;
    const mod = req("@react-email/render") as {
      render?: (el: ReactElement, opts?: { pretty?: boolean }) => string | Promise<string>;
    };
    if (!mod.render) return "";
    const out = mod.render(element, { pretty: false });
    return typeof out === "string" ? out : await out;
  } catch {
    return "";
  }
}

function defaultFrom(): string {
  return process.env.RESEND_FROM_EMAIL ?? "SparkFlow <noreply@sparkflow.local>";
}

/**
 * Send a transactional email. Never throws — inspect the result.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, skipped: true, reason: "no_api_key" };
  }

  const Resend = loadResend();
  if (!Resend) {
    return { ok: false, skipped: true, reason: "module_missing" };
  }

  let html = input.html;
  if (!html && input.react) {
    html = await renderReact(input.react);
  }
  if (!html && !input.text) {
    return { ok: false, skipped: false, error: "empty_body" };
  }

  try {
    const client = new Resend(key);
    const res = await client.emails.send({
      from: input.from ?? defaultFrom(),
      to: input.to,
      subject: input.subject,
      html,
      text: input.text,
      reply_to: input.replyTo,
    });
    if (res.error) {
      return {
        ok: false,
        skipped: false,
        error: res.error.message ?? "resend_error",
      };
    }
    return { ok: true, id: res.data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

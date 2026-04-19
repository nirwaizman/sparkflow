/**
 * POST /api/emails/send
 *
 * Internal, session-gated endpoint that agents and server-side workers
 * can call to send a templated transactional email. Keeping this behind
 * a request gate (rather than exposing sendEmail directly) gives us a
 * single place to audit, rate-limit, and sanitize template inputs.
 *
 * Body:
 *   {
 *     template: "welcome" | "trial-ending" | "usage-alert" | "referral-reward",
 *     to: string | string[],
 *     subject?: string,            // overrides template default
 *     props: Record<string, unknown>  // template-specific props
 *   }
 *
 * TODO: add per-org rate limiting once `@sparkflow/security` exposes a
 * generic `limit(key, quota)` helper.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  sendEmail,
  WelcomeEmail,
  TrialEndingEmail,
  UsageAlertEmail,
  ReferralRewardEmail,
} from "@sparkflow/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  template: z.enum([
    "welcome",
    "trial-ending",
    "usage-alert",
    "referral-reward",
  ]),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1).max(200).optional(),
  props: z.record(z.unknown()).default({}),
});

function defaultSubject(template: string): string {
  switch (template) {
    case "welcome":
      return "Welcome to SparkFlow";
    case "trial-ending":
      return "Your SparkFlow trial is ending soon";
    case "usage-alert":
      return "Usage alert — SparkFlow";
    case "referral-reward":
      return "You earned referral credits";
    default:
      return "SparkFlow";
  }
}

function renderTemplate(
  template: string,
  props: Record<string, unknown>,
): React.ReactElement | null {
  // We intentionally coerce props with `as` — validating every
  // template's shape at runtime is premature until we have real
  // callers. `react-email/render` handles missing fields gracefully.
  switch (template) {
    case "welcome":
      return WelcomeEmail(
        props as {
          name?: string | null;
          workspaceUrl: string;
          docsUrl?: string;
        },
      );
    case "trial-ending":
      return TrialEndingEmail(
        props as {
          name?: string | null;
          daysRemaining: number;
          billingUrl: string;
        },
      );
    case "usage-alert":
      return UsageAlertEmail(
        props as {
          name?: string | null;
          metric: string;
          used: number;
          limit: number;
          percent: number;
          billingUrl: string;
        },
      );
    case "referral-reward":
      return ReferralRewardEmail(
        props as {
          name?: string | null;
          referredName?: string | null;
          creditsAwarded: number;
          workspaceUrl: string;
        },
      );
    default:
      return null;
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const element = renderTemplate(parsed.data.template, parsed.data.props);
  if (!element) {
    return NextResponse.json(
      { error: "unknown_template" },
      { status: 400 },
    );
  }

  const result = await sendEmail({
    to: parsed.data.to,
    subject: parsed.data.subject ?? defaultSubject(parsed.data.template),
    react: element,
  });

  if (!result.ok) {
    // Skipped sends are not failures — they just mean email is
    // disabled in this environment. Still useful to surface to the
    // caller so they can decide to retry later.
    const status = result.skipped ? 202 : 502;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

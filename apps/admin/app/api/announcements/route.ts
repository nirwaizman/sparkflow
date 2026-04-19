/**
 * Announcements API — admin-only broadcast.
 *
 * POST  — create an announcement row in `feature_flags`
 *         (key=`announcement:<YYYY-MM-DD>`). Optionally fans out an
 *         email to every known user via `@sparkflow/growth`'s
 *         `sendEmail`. Email fan-out is best-effort: `sendEmail`
 *         already swallows Resend outages and returns a skip reason.
 *
 * PATCH — toggle `enabled` on an existing announcement row.
 *
 * Storage choice: we intentionally reuse `feature_flags` rather than
 * adding a new table. A per-day key lets operators ship multiple
 * announcements a day by suffixing (`announcement:2026-04-19-incident-1`).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { featureFlags, getDb, users } from "@sparkflow/db";
import { AuthError, logAudit, requireSession } from "@sparkflow/auth";

// NOTE: we cannot import `@sparkflow/growth/emails/send` directly —
// `@sparkflow/growth` isn't a dependency of `apps/admin` and we can't
// run `pnpm install` here. We inline a minimal Resend wrapper mirroring
// growth/emails/send.ts (same graceful-no-op behavior when
// RESEND_API_KEY is missing or the `resend` module isn't installed).
// TODO(follow-up): once admin depends on `@sparkflow/growth`, delete
// this and use `sendEmail` from the shared package.
type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

type ResendClient = {
  emails: {
    send: (i: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
    }) => Promise<{
      data?: { id?: string } | null;
      error?: { message?: string } | null;
    }>;
  };
};
type ResendCtor = new (k: string) => ResendClient;

function loadResend(): ResendCtor | null {
  try {
    const req = eval("require") as (id: string) => unknown;
    const mod = req("resend") as { Resend?: ResendCtor };
    return mod.Resend ?? null;
  } catch {
    return null;
  }
}

async function sendEmail(input: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true, reason: "no_api_key" };
  const Ctor = loadResend();
  if (!Ctor) return { ok: false, skipped: true, reason: "module_missing" };
  try {
    const client = new Ctor(key);
    const res = await client.emails.send({
      from:
        process.env.RESEND_FROM_EMAIL ??
        "SparkFlow <noreply@sparkflow.local>",
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
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

export const runtime = "nodejs";

// Batch email sends so we don't hammer Resend if 50k users are in the
// table. 100-per-batch keeps each request within Resend's limits.
const EMAIL_BATCH = 100;

const createSchema = z.object({
  body: z.string().min(1).max(2000),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  sendEmail: z.boolean().default(false),
  enabled: z.boolean().default(true),
  /** Override the auto-generated date suffix (e.g. "-incident-1"). */
  suffix: z.string().max(60).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

function todayKey(suffix?: string): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const base = `announcement:${yyyy}-${mm}-${dd}`;
  return suffix ? `${base}-${suffix}` : base;
}

async function fanoutEmail(subject: string, body: string): Promise<{
  sent: number;
  skipped?: string;
}> {
  const db = getDb();
  const all = await db.select({ email: users.email }).from(users);
  let sent = 0;
  let lastSkip: string | undefined;
  for (let i = 0; i < all.length; i += EMAIL_BATCH) {
    const batch = all.slice(i, i + EMAIL_BATCH).map((u) => u.email);
    const res = await sendEmail({
      to: batch,
      subject,
      text: body,
      html: `<div style="font-family:system-ui;font-size:14px;line-height:1.5"><p>${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p><p style="color:#888;font-size:12px">— SparkFlow</p></div>`,
    });
    if (res.ok) {
      sent += batch.length;
    } else if ("skipped" in res && res.skipped) {
      lastSkip = res.reason;
      break; // no point retrying more batches when Resend is unavailable
    } else if ("error" in res) {
      lastSkip = res.error;
    }
  }
  return { sent, skipped: lastSkip };
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await req.json());
    const db = getDb();
    const key = todayKey(body.suffix);

    const [row] = await db
      .insert(featureFlags)
      .values({
        key,
        organizationId: null,
        enabled: body.enabled,
        rolloutPercent: 100,
        payload: {
          body: body.body,
          severity: body.severity,
          emailSent: false,
          createdBy: session.user.email,
        },
      })
      .returning();
    if (!row) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    let emailedTo: number | undefined;
    let emailSkipped: string | undefined;
    if (body.sendEmail) {
      const { sent, skipped } = await fanoutEmail(
        `[SparkFlow] ${body.severity === "info" ? "Announcement" : body.severity.toUpperCase()}`,
        body.body,
      );
      emailedTo = sent;
      emailSkipped = skipped;
      // Update the row so the UI reflects "emailed" state.
      await db
        .update(featureFlags)
        .set({
          payload: {
            body: body.body,
            severity: body.severity,
            emailSent: !skipped,
            emailedTo: sent,
            emailSkipped: skipped ?? null,
            createdBy: session.user.email,
          },
          updatedAt: new Date(),
        })
        .where(eq(featureFlags.id, row.id));
    }

    await logAudit(
      {
        action: "admin.announcement.create",
        targetType: "feature_flag",
        targetId: row.id,
        metadata: {
          key,
          severity: body.severity,
          sendEmail: body.sendEmail,
          emailedTo,
          emailSkipped,
        },
      },
      session,
    );

    return NextResponse.json({
      ok: true,
      id: row.id,
      key,
      emailedTo,
      emailSkipped,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = patchSchema.parse(await req.json());
    const db = getDb();
    const [row] = await db
      .update(featureFlags)
      .set({ enabled: body.enabled, updatedAt: new Date() })
      .where(eq(featureFlags.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await logAudit(
      {
        action: "admin.announcement.toggle",
        targetType: "feature_flag",
        targetId: row.id,
        metadata: { enabled: row.enabled },
      },
      session,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

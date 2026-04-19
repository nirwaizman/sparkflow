/**
 * Per-org data export.
 *
 * Two-step flow so the heavy-lifting endpoint can be proxied through a
 * CDN / object-store signer later without changing the admin UI:
 *
 *   GET  /api/export?orgId=X                 → returns { url: "..." }
 *                                              where `url` is a signed,
 *                                              single-use link to the
 *                                              actual bundle download.
 *   GET  /api/export?orgId=X&exp=...&sig=... → streams the bundle if the
 *                                              signature verifies and
 *                                              `exp` hasn't passed.
 *
 * Signing uses HMAC-SHA256 with `ADMIN_IMPERSONATION_SECRET` (yes, we
 * reuse the admin secret — it's the one secret every admin-side route
 * already depends on, and exports are admin-only). Signature covers
 * `orgId|exp`. Links expire after 5 minutes.
 *
 * Bundle format: a single JSON envelope of all org-scoped tables,
 * gzip-compressed. A true multi-file zip would be nicer but requires a
 * zip dependency we cannot install right now; downstream tooling can
 * trivially split the JSON envelope into per-table files.
 *
 * TODO(export):
 *   - Swap JSON-gzip for a real zip (adm-zip / jszip) once we can
 *     add deps.
 *   - Add streaming cursor pagination for multi-GB orgs (current impl
 *     materialises in memory).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  apiKeys,
  auditLogs,
  conversations,
  featureFlags,
  files,
  getDb,
  memberships,
  messages,
  organizations,
  subscriptions,
  tasks,
  usageRecords,
  users,
} from "@sparkflow/db";
import { AuthError, logAudit, requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const TTL_SECONDS = 5 * 60;

function secret(): string {
  const s = process.env.ADMIN_IMPERSONATION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "ADMIN_IMPERSONATION_SECRET missing or too short (>=32 chars required)",
    );
  }
  return s;
}

function sign(orgId: string, exp: number): string {
  return createHmac("sha256", secret())
    .update(`${orgId}|${exp}`)
    .digest("hex");
}

function verify(orgId: string, exp: number, sig: string): boolean {
  const expected = sign(orgId, exp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function buildBundle(orgId: string): Promise<Buffer> {
  const db = getDb();

  const [
    org,
    memberRows,
    userRows,
    convRows,
    msgRows,
    taskRows,
    fileRows,
    apiKeyRows,
    usageRows,
    subRows,
    flagRows,
    auditRows,
  ] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1),
    db
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, orgId)),
    // Users who are members of this org.
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        locale: users.locale,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, orgId)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.organizationId, orgId)),
    // Messages joined via conversations.
    db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(
        conversations,
        eq(conversations.id, messages.conversationId),
      )
      .where(eq(conversations.organizationId, orgId)),
    db.select().from(tasks).where(eq(tasks.organizationId, orgId)),
    db.select().from(files).where(eq(files.organizationId, orgId)),
    // API keys — export metadata only, never the hash column.
    db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, orgId)),
    db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.organizationId, orgId)),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId)),
    db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.organizationId, orgId)),
    db.select().from(auditLogs).where(eq(auditLogs.organizationId, orgId)),
  ]);

  const envelope = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    organization: org[0] ?? null,
    tables: {
      memberships: memberRows,
      users: userRows,
      conversations: convRows,
      messages: msgRows,
      tasks: taskRows,
      files: fileRows,
      api_keys: apiKeyRows,
      usage_records: usageRows,
      subscriptions: subRows,
      feature_flags: flagRows,
      audit_logs: auditRows,
    },
  };

  return gzipSync(Buffer.from(JSON.stringify(envelope), "utf8"));
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = req.nextUrl;
    const orgId = searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const sig = searchParams.get("sig");
    const expRaw = searchParams.get("exp");

    if (!sig || !expRaw) {
      // Step 1: return a signed URL.
      const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
      const s = sign(orgId, exp);
      const url = new URL(req.nextUrl);
      url.searchParams.set("exp", String(exp));
      url.searchParams.set("sig", s);

      await logAudit(
        {
          action: "admin.export.link",
          targetType: "organization",
          targetId: orgId,
          metadata: { exp },
        },
        session,
      );

      // If a browser hit this link directly (Accept: text/html) we want
      // to auto-redirect so clicking "Export org data" in the admin UI
      // just starts the download. JSON clients still get the raw URL.
      const wantsJson = (req.headers.get("accept") ?? "").includes(
        "application/json",
      );
      if (wantsJson) {
        return NextResponse.json({ url: url.pathname + url.search, exp });
      }
      return NextResponse.redirect(url.toString(), { status: 302 });
    }

    // Step 2: signed download.
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: "link_expired" }, { status: 410 });
    }
    if (!verify(orgId, exp, sig)) {
      return NextResponse.json({ error: "bad_signature" }, { status: 403 });
    }

    const buffer = await buildBundle(orgId);

    await logAudit(
      {
        action: "admin.export.download",
        targetType: "organization",
        targetId: orgId,
        metadata: { bytes: buffer.length },
      },
      session,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="sparkflow-org-${orgId}.json.gz"`,
        "cache-control": "no-store",
        "x-export-format": "json-gzip-v1",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

/**
 * Append-only audit log writer.
 *
 * Callers pass a session (so we can scope the row to the acting user +
 * org) and a small action descriptor. Failures are swallowed + logged
 * — audit logging must never break a request.
 */
import { getDb, auditLogs } from "@sparkflow/db";
import type { AuthSession } from "./types";

export interface LogAuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function logAudit(input: LogAuditInput, session: AuthSession): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      organizationId: session.organizationId,
      actorUserId: session.user.id,
      action: input.action,
      targetType: input.targetType ?? "none",
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write audit log", {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

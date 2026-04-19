/**
 * GDPR / DSAR export.
 *
 * Builds a ZIP buffer containing one JSON file per tenant-scoped table the
 * user has data in, plus a `manifest.json` describing row counts and the
 * export metadata. All queries are scoped by `(organizationId, userId)` so
 * the export respects tenant boundaries: a user only ever gets their own
 * rows inside the requested org.
 */
import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import {
  auditLogs,
  conversations,
  files,
  getDb,
  memories,
  messages,
} from "@sparkflow/db";

export interface ExportManifestEntry {
  table: string;
  path: string;
  rowCount: number;
}

export interface ExportManifest {
  version: 1;
  userId: string;
  organizationId: string;
  generatedAt: string;
  entries: ExportManifestEntry[];
}

export interface ExportResult {
  zipBuffer: Buffer;
  manifest: ExportManifest;
}

export async function exportUserData(
  userId: string,
  organizationId: string,
): Promise<ExportResult> {
  const db = getDb();

  // Pull tenant-scoped rows. For `messages`, join through conversations
  // the user owns — messages have no direct userId.
  const [convos, userFiles, userMemories, userAudit] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, organizationId),
          eq(conversations.userId, userId),
        ),
      ),
    db
      .select()
      .from(files)
      .where(
        and(eq(files.organizationId, organizationId), eq(files.userId, userId)),
      ),
    db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.organizationId, organizationId),
          eq(memories.userId, userId),
        ),
      ),
    db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, organizationId),
          eq(auditLogs.actorUserId, userId),
        ),
      ),
  ]);

  const conversationIds = convos.map((c) => c.id);
  let userMessages: Array<Record<string, unknown>> = [];
  if (conversationIds.length > 0) {
    // Drizzle's `inArray` would be nicer; we iterate to keep the import
    // surface small and avoid pulling it in just for the export path.
    const rows = await Promise.all(
      conversationIds.map((id) =>
        db.select().from(messages).where(eq(messages.conversationId, id)),
      ),
    );
    userMessages = rows.flat();
  }

  const generatedAt = new Date().toISOString();

  const entries: ExportManifestEntry[] = [
    { table: "conversations", path: "conversations.json", rowCount: convos.length },
    { table: "messages", path: "messages.json", rowCount: userMessages.length },
    { table: "files", path: "files.json", rowCount: userFiles.length },
    { table: "memories", path: "memories.json", rowCount: userMemories.length },
    { table: "audit_logs", path: "audit_logs.json", rowCount: userAudit.length },
  ];

  const manifest: ExportManifest = {
    version: 1,
    userId,
    organizationId,
    generatedAt,
    entries,
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("conversations.json", JSON.stringify(convos, null, 2));
  zip.file("messages.json", JSON.stringify(userMessages, null, 2));
  zip.file("files.json", JSON.stringify(userFiles, null, 2));
  zip.file("memories.json", JSON.stringify(userMemories, null, 2));
  zip.file("audit_logs.json", JSON.stringify(userAudit, null, 2));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return { zipBuffer, manifest };
}

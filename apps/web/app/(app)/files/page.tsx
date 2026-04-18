/**
 * Files dashboard.
 *
 * Server Component. Lists the current org's files with a status pill
 * and hands off to the client `<UploadZone>` for drag-and-drop +
 * polling.
 */
import { desc, eq } from "drizzle-orm";
import { requireSession } from "@sparkflow/auth";
import { getDb, files } from "@sparkflow/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparkflow/ui";
import { UploadZone } from "./upload-zone";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    uploaded: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
    processing: "bg-amber-500/10 text-amber-600",
    ready: "bg-emerald-500/10 text-emerald-600",
    failed: "bg-red-500/10 text-red-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        tone[status] ?? tone.uploaded
      }`}
    >
      {status}
    </span>
  );
}

export default async function FilesPage() {
  const session = await requireSession();
  const db = getDb();
  const rows = await db
    .select({
      id: files.id,
      name: files.name,
      mime: files.mime,
      sizeBytes: files.sizeBytes,
      status: files.status,
      error: files.error,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(eq(files.organizationId, session.organizationId))
    .orderBy(desc(files.createdAt));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Upload PDFs, Word docs, and Markdown/text files. They are chunked and
          embedded for retrieval.
        </p>
      </div>

      <UploadZone />

      <Card>
        <CardHeader>
          <CardTitle>Your files</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "No files yet. Drop one above to get started."
              : `${rows.length} file${rows.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{row.name}</div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {row.mime} · {formatBytes(row.sizeBytes)}
                      {row.error ? ` · ${row.error}` : ""}
                    </div>
                  </div>
                  <StatusPill status={row.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

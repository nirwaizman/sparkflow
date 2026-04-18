"use client";

/**
 * Drag-and-drop upload zone. Uses XHR so we can surface per-file
 * progress (fetch() doesn't expose upload progress). After upload we
 * poll `/api/files/:id/status` every 1.5s until the row becomes
 * `ready` or `failed`.
 */
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Progress,
} from "@sparkflow/ui";

interface TrackedFile {
  id: string;
  name: string;
  progress: number; // 0..100 (upload only)
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed";
  error?: string;
  serverId?: string;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
];

function makeLocalId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

export function UploadZone() {
  const router = useRouter();
  const [tracked, setTracked] = useState<TrackedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback(
    (id: string, next: Partial<TrackedFile>) => {
      setTracked((prev) => prev.map((f) => (f.id === id ? { ...f, ...next } : f)));
    },
    [setTracked],
  );

  const pollStatus = useCallback(
    async (localId: string, serverId: string) => {
      // Poll up to ~5 minutes; for most small docs this finishes in seconds.
      const MAX_ATTEMPTS = 200;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const res = await fetch(`/api/files/${serverId}/status`, {
            cache: "no-store",
          });
          if (!res.ok) continue;
          const data = (await res.json()) as {
            status: "uploaded" | "processing" | "ready" | "failed";
            error?: string | null;
          };
          patch(localId, { status: data.status, error: data.error ?? undefined });
          if (data.status === "ready" || data.status === "failed") {
            router.refresh();
            return;
          }
        } catch {
          // transient — keep polling
        }
      }
    },
    [patch, router],
  );

  const uploadOne = useCallback(
    (file: File) => {
      if (!ACCEPT_MIMES.includes(file.type)) {
        const id = makeLocalId();
        setTracked((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            progress: 0,
            status: "failed",
            error: `Unsupported type: ${file.type || "unknown"}`,
          },
        ]);
        return;
      }
      if (file.size > MAX_BYTES) {
        const id = makeLocalId();
        setTracked((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            progress: 0,
            status: "failed",
            error: `Too large (max ${MAX_BYTES / 1024 / 1024} MB)`,
          },
        ]);
        return;
      }

      const localId = makeLocalId();
      setTracked((prev) => [
        ...prev,
        { id: localId, name: file.name, progress: 0, status: "uploading" },
      ]);

      const form = new FormData();
      form.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files");
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable) {
          patch(localId, {
            progress: Math.round((evt.loaded / evt.total) * 100),
          });
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText) as { id: string };
            patch(localId, {
              progress: 100,
              status: "processing",
              serverId: body.id,
            });
            pollStatus(localId, body.id);
          } catch {
            patch(localId, { status: "failed", error: "bad_response" });
          }
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            if (body.error) msg = body.error;
          } catch {
            /* ignore */
          }
          patch(localId, { status: "failed", error: msg });
        }
      });
      xhr.addEventListener("error", () => {
        patch(localId, { status: "failed", error: "network_error" });
      });
      xhr.send(form);
    },
    [patch, pollStatus],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const fs = Array.from(e.dataTransfer.files ?? []);
      for (const f of fs) uploadOne(f);
    },
    [uploadOne],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fs = Array.from(e.target.files ?? []);
      for (const f of fs) uploadOne(f);
      e.target.value = "";
    },
    [uploadOne],
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragging
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--muted))]"
              : "border-[hsl(var(--border))]"
          }`}
        >
          <p className="text-sm font-medium">Drop files here to upload</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            PDF, DOCX, Markdown, or plain text · up to 25 MB
          </p>
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_MIMES.join(",")}
              className="hidden"
              onChange={onPick}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              Choose files
            </Button>
          </div>
        </div>

        {tracked.length > 0 ? (
          <ul className="space-y-3">
            {tracked.map((t) => (
              <li key={t.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-medium">{t.name}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {t.status}
                  </span>
                </div>
                {t.status === "uploading" ? (
                  <Progress value={t.progress} />
                ) : null}
                {t.status === "failed" && t.error ? (
                  <Alert>
                    <AlertTitle>Upload failed</AlertTitle>
                    <AlertDescription>{t.error}</AlertDescription>
                  </Alert>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

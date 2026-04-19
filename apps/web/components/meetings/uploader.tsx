"use client";

/**
 * Drag-and-drop uploader for meeting audio.
 *
 * - Accepts audio/{wav,mp3,m4a,mp4,webm,ogg,flac} up to 100 MB.
 * - Uses XHR so we can surface per-file progress.
 * - After upload completes the row is kicked to `/api/meetings/:id/process`
 *   and we redirect the user to the detail page so they can watch the
 *   pipeline finish.
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

const MAX_BYTES = 100 * 1024 * 1024;
const ACCEPT_MIMES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
];

interface TrackedUpload {
  localId: string;
  name: string;
  progress: number;
  status: "uploading" | "processing" | "done" | "failed";
  error?: string;
  serverId?: string;
}

function localId(): string {
  return `mu_${Math.random().toString(36).slice(2, 10)}`;
}

export function MeetingUploader() {
  const router = useRouter();
  const [tracked, setTracked] = useState<TrackedUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((id: string, next: Partial<TrackedUpload>) => {
    setTracked((prev) => prev.map((t) => (t.localId === id ? { ...t, ...next } : t)));
  }, []);

  const uploadOne = useCallback(
    (file: File) => {
      const id = localId();
      if (!ACCEPT_MIMES.includes(file.type)) {
        setTracked((prev) => [
          ...prev,
          {
            localId: id,
            name: file.name,
            progress: 0,
            status: "failed",
            error: `Unsupported type: ${file.type || "unknown"}`,
          },
        ]);
        return;
      }
      if (file.size > MAX_BYTES) {
        setTracked((prev) => [
          ...prev,
          {
            localId: id,
            name: file.name,
            progress: 0,
            status: "failed",
            error: `Too large (max ${MAX_BYTES / 1024 / 1024} MB)`,
          },
        ]);
        return;
      }

      setTracked((prev) => [
        ...prev,
        { localId: id, name: file.name, progress: 0, status: "uploading" },
      ]);

      const form = new FormData();
      form.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/meetings/upload");
      xhr.upload.addEventListener("progress", (evt) => {
        if (evt.lengthComputable) {
          patch(id, { progress: Math.round((evt.loaded / evt.total) * 100) });
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText) as { id: string };
            patch(id, {
              progress: 100,
              status: "processing",
              serverId: body.id,
            });
            // Kick off processing and navigate to the detail page where
            // the user can watch the status flip to `ready`.
            fetch(`/api/meetings/${body.id}/process`, { method: "POST" }).catch(() => {
              /* swallowed — detail page will show failed status */
            });
            router.push(`/meetings/${body.id}`);
          } catch {
            patch(id, { status: "failed", error: "bad_response" });
          }
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            if (body.error) msg = body.error;
          } catch {
            /* ignore */
          }
          patch(id, { status: "failed", error: msg });
        }
      });
      xhr.addEventListener("error", () => {
        patch(id, { status: "failed", error: "network_error" });
      });
      xhr.send(form);
    },
    [patch, router],
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
          <p className="text-sm font-medium">Drop an audio file here</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            WAV, MP3, M4A, WebM, OGG, or FLAC up to 100 MB
          </p>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_MIMES.join(",")}
              className="hidden"
              onChange={onPick}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              Choose audio file
            </Button>
          </div>
        </div>

        {tracked.length > 0 ? (
          <ul className="space-y-3">
            {tracked.map((t) => (
              <li key={t.localId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-medium">{t.name}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {t.status}
                  </span>
                </div>
                {t.status === "uploading" ? <Progress value={t.progress} /> : null}
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

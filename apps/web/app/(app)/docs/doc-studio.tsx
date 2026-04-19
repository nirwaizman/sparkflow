"use client";

/**
 * <DocStudio />
 *
 * Client UI for long-form document generation and export.
 */
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  ScrollArea,
  Textarea,
} from "@sparkflow/ui";

type Length = "short" | "medium" | "long";
type Language = "he" | "en" | "auto";
type ExportFormat = "md" | "html" | "pdf";

interface GenerateResponse {
  markdown: string;
  wordCount: number;
  sections: string[];
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
        style={{ animationDelay: "120ms" }}
      />
      <span
        className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
        style={{ animationDelay: "240ms" }}
      />
    </span>
  );
}

export function DocStudio() {
  const [topic, setTopic] = useState("");
  const [outline, setOutline] = useState("");
  const [length, setLength] = useState<Length>("medium");
  const [language, setLanguage] = useState<Language>("auto");

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingToFiles, setSavingToFiles] = useState(false);

  const title = useMemo(() => {
    if (!result?.markdown) return topic || "Document";
    const firstH1 = /^#\s+(.+)$/m.exec(result.markdown);
    return firstH1?.[1]?.trim() || topic || "Document";
  }, [result, topic]);

  const onGenerate = useCallback(async () => {
    const t = topic.trim();
    if (!t || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: t,
          outline: outline.trim() || undefined,
          targetLength: length,
          language,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GenerateResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generation_failed");
    } finally {
      setLoading(false);
    }
  }, [topic, outline, length, language, loading]);

  const onExport = useCallback(
    async (format: ExportFormat) => {
      if (!result || exporting) return;
      setExporting(format);
      setError(null);
      try {
        const res = await fetch("/api/docs/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            markdown: result.markdown,
            format,
            title,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `${title.replace(/[^\w.-]+/g, "-")}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      } catch (err) {
        setError(err instanceof Error ? err.message : "export_failed");
      } finally {
        setExporting(null);
      }
    },
    [result, title, exporting],
  );

  const onCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [result]);

  const onSaveToFiles = useCallback(async () => {
    if (!result || savingToFiles) return;
    setSavingToFiles(true);
    setError(null);
    try {
      const filename = `${title.replace(/[^\w.-]+/g, "-")}.md`;
      const blob = new Blob([result.markdown], { type: "text/markdown" });
      const file = new File([blob], filename, { type: "text/markdown" });
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setSavingToFiles(false);
    }
  }, [result, title, savingToFiles]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="doc-topic">Topic</Label>
            <Input
              id="doc-topic"
              dir="auto"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="נושא המסמך…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-outline">Outline (optional)</Label>
            <Textarea
              id="doc-outline"
              dir="auto"
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder="Bullet points or section headings to follow…"
              rows={4}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Length</Label>
              <div className="flex flex-wrap gap-2">
                {(["short", "medium", "long"] as const).map((l) => (
                  <Button
                    key={l}
                    type="button"
                    size="sm"
                    variant={length === l ? "default" : "secondary"}
                    onClick={() => setLength(l)}
                  >
                    {l}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <div className="flex flex-wrap gap-2">
                {(["auto", "he", "en"] as const).map((l) => (
                  <Button
                    key={l}
                    type="button"
                    size="sm"
                    variant={language === l ? "default" : "secondary"}
                    onClick={() => setLanguage(l)}
                  >
                    {l}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button onClick={onGenerate} disabled={loading || !topic.trim()}>
              {loading ? (
                <>
                  Generating <Dots />
                </>
              ) : (
                "Generate"
              )}
            </Button>
          </div>

          {error ? (
            <Alert>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{result.wordCount} words</Badge>
                {result.sections.slice(0, 6).map((s) => (
                  <Badge key={s} variant="outline">
                    {s}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={onCopy}>
                  {copied ? "Copied" : "Copy to clipboard"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onSaveToFiles}
                  disabled={savingToFiles}
                >
                  {savingToFiles ? "Saving…" : "Save to Files"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onExport("md")}
                  disabled={exporting !== null}
                >
                  {exporting === "md" ? "…" : "Markdown"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onExport("html")}
                  disabled={exporting !== null}
                >
                  {exporting === "html" ? "…" : "HTML"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onExport("pdf")}
                  disabled={exporting !== null}
                >
                  {exporting === "pdf" ? "…" : "PDF"}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[60vh] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--bg))] p-6">
              <article className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.markdown}
                </ReactMarkdown>
              </article>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

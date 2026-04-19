/**
 * AI Docs page — server component. Defers to `<DocStudio />` for all
 * interactivity. Enforces `requireSession()` before rendering.
 */
import { requireSession } from "@sparkflow/auth";
import { DocStudio } from "./doc-studio";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  await requireSession();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Docs</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Generate long-form markdown documents and export to Markdown,
          HTML, or PDF.
        </p>
      </div>
      <DocStudio />
    </div>
  );
}

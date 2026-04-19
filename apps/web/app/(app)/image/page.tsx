/**
 * Image Studio page.
 *
 * Server component — enforces `requireSession()` at the edge and then
 * defers everything else to the client-side `<ImageStudio />`.
 */
import { requireSession } from "@sparkflow/auth";
import { ImageStudio } from "./image-studio";

export const dynamic = "force-dynamic";

export default async function ImagePage() {
  await requireSession();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Image</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Generate images with gpt-image-1. Stored privately in your
          workspace.
        </p>
      </div>
      <ImageStudio />
    </div>
  );
}

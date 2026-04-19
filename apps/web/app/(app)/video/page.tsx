/**
 * Video Studio page.
 *
 * Server component — enforces `requireSession()` then hands control to
 * the client-side `<VideoStudio />`.
 */
import { requireSession } from "@sparkflow/auth";
import { VideoStudio } from "./video-studio";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  await requireSession();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Video</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Generate short videos with Kling, Sora or Veo. Rendered videos
          are stored privately in your workspace.
        </p>
      </div>
      <VideoStudio />
    </div>
  );
}

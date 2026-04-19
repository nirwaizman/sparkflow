/**
 * Music Studio page.
 *
 * Server component — enforces `requireSession()` then hands control to
 * the client-side `<MusicStudio />`.
 */
import { requireSession } from "@sparkflow/auth";
import { MusicStudio } from "./music-studio";

export const dynamic = "force-dynamic";

export default async function MusicPage() {
  await requireSession();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Music</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Generate songs and sound effects with Suno or ElevenLabs. Audio
          is stored privately in your workspace.
        </p>
      </div>
      <MusicStudio />
    </div>
  );
}

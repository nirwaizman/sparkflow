/**
 * /slides — AI Slides studio.
 *
 * Thin server wrapper that renders the client-side `SlidesStudio`.
 * Kept as a server component so it participates in the app's layout
 * (nav/sidebar) without forcing the entire tree to be client-rendered.
 */
import { SlidesStudio } from "./slides-studio";

export const dynamic = "force-dynamic";

export default function SlidesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AI Slides</h1>
        <p className="text-sm text-neutral-500">
          Describe a topic. Get a structured deck you can edit and present.
        </p>
      </header>
      <SlidesStudio />
    </div>
  );
}

/**
 * /design — AI Designer studio.
 *
 * Thin server wrapper that renders the client-side `DesignStudio`. Kept as
 * a server component so it participates in the app's layout (nav/sidebar)
 * without forcing the entire tree to be client-rendered.
 */
import { DesignStudio } from "./design-studio";

export const dynamic = "force-dynamic";

export default function DesignPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AI Designer</h1>
        <p className="text-sm text-neutral-500">
          Describe a web design in plain English. Get a rendered,
          downloadable HTML page in seconds.
        </p>
      </header>
      <DesignStudio />
    </div>
  );
}

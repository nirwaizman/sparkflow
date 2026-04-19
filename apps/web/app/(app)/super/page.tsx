/**
 * /super — Super Agent studio.
 *
 * Top-level multi-agent orchestrator. Accepts a single goal, plans the
 * decomposition into specialist sub-tasks (slides / image / docs / dev /
 * design / sheets / chat / research), and runs them in parallel where
 * possible while streaming a live timeline.
 *
 * Thin server wrapper around the client component.
 */
import { SuperStudio } from "./super-studio";

export const dynamic = "force-dynamic";

export default function SuperPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Super Agent</h1>
        <p className="text-sm text-neutral-500">
          Give a single goal. Super Agent decomposes it across specialists
          (slides, images, docs, research…), runs them in parallel, and
          aggregates the artifacts.
        </p>
      </header>
      <SuperStudio />
    </div>
  );
}

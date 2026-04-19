/**
 * /browser — Browser automation studio.
 *
 * Thin server wrapper that renders the client-side `BrowserStudio`.
 */
import { BrowserStudio } from "./browser-studio";

export const dynamic = "force-dynamic";

export default function BrowserPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Browser Automation</h1>
        <p className="text-sm text-neutral-500">
          Describe what you want a headless Chromium to do. We plan it,
          execute it, and stream back screenshots and extracted data.
        </p>
      </header>
      <BrowserStudio />
    </div>
  );
}

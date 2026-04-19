/**
 * /sheets — AI Sheets studio.
 *
 * Thin server wrapper that renders the client-side `SheetsStudio`.
 */
import { SheetsStudio } from "./sheets-studio";

export const dynamic = "force-dynamic";

export default function SheetsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AI Sheets</h1>
        <p className="text-sm text-neutral-500">
          Describe a dataset. Get a typed, editable table you can export.
        </p>
      </header>
      <SheetsStudio />
    </div>
  );
}

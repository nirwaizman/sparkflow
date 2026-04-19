/**
 * /phone — AI phone calling studio.
 *
 * Thin server wrapper that renders the client-side `PhoneStudio`.
 */
import { PhoneStudio } from "./phone-studio";

export const dynamic = "force-dynamic";

export default function PhonePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Phone Calling</h1>
        <p className="text-sm text-neutral-500">
          Place an AI-driven phone call. Describe the agent&rsquo;s script; we
          dial, follow it, and return a transcript when the call ends.
        </p>
      </header>
      <PhoneStudio />
    </div>
  );
}

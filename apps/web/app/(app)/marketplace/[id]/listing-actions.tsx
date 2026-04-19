"use client";

/**
 * Client-side actions for the marketplace listing detail page: install
 * + submit-review form. Both drive the page via `router.refresh()` so
 * the server component re-renders with new reviews / install counts.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ListingKind } from "@sparkflow/marketplace";

type Props = {
  listingId: string;
  kind: ListingKind;
  isOwnListing: boolean;
};

export function ListingActions({ listingId, kind, isOwnListing }: Props) {
  const router = useRouter();
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  const [rating, setRating] = useState<number>(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  async function handleInstall() {
    setInstalling(true);
    setInstallMsg(null);
    try {
      const res = await fetch(
        `/api/marketplace/listings/${listingId}/install`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        install?: unknown;
      };
      if (!res.ok) {
        setInstallMsg(data.message ?? data.error ?? "Install failed");
        return;
      }
      setInstallMsg(
        kind === "tool"
          ? "Tool enabled for your org."
          : kind === "workflow"
            ? "Workflow cloned into your org."
            : "Agent cloned into your org.",
      );
      router.refresh();
    } catch (err) {
      setInstallMsg(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstalling(false);
    }
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setReviewMsg(null);
    try {
      const res = await fetch(
        `/api/marketplace/listings/${listingId}/reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, body: body.trim() || null }),
        },
      );
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setReviewMsg(data.message ?? data.error ?? "Failed to submit review");
        return;
      }
      setReviewMsg("Review submitted.");
      setBody("");
      router.refresh();
    } catch (err) {
      setReviewMsg(err instanceof Error ? err.message : "Review failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          disabled={installing || isOwnListing}
          onClick={handleInstall}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {installing
            ? "Installing…"
            : isOwnListing
              ? "Your listing"
              : "Install"}
        </button>
        {installMsg ? (
          <p className="mt-2 text-xs text-neutral-600" role="status">
            {installMsg}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={handleReview}
        className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
      >
        <h3 className="mb-2 text-sm font-semibold">Leave a review</h3>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <label htmlFor="rating" className="text-neutral-600">
            Rating
          </label>
          <select
            id="rating"
            value={rating}
            onChange={(e) => setRating(Number.parseInt(e.target.value, 10))}
            className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} star{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What worked? What didn't?"
          className="mb-2 w-full rounded-md border border-neutral-200 bg-white p-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
        {reviewMsg ? (
          <p className="mt-2 text-xs text-neutral-600" role="status">
            {reviewMsg}
          </p>
        ) : null}
      </form>
    </div>
  );
}

"use client";

/**
 * Publish form — turns user input into the JSON body accepted by
 * `POST /api/marketplace/listings`. The `entity` field is a raw JSON
 * textarea; power users hand-craft it. A full kind-specific builder
 * (agent picker / workflow importer) is tracked as a follow-up.
 *
 * TODO(WP-M1.3): replace the raw JSON `entity` editor with kind-aware
 * pickers — e.g. a dropdown of the org's existing agents for kind
 * "agent", existing workflows for "workflow", and the registered tool
 * catalogue for "tool".
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ListingKind, ListingVisibility } from "@sparkflow/marketplace";

const KIND_PLACEHOLDER: Record<ListingKind, string> = {
  agent: `{
  "name": "Research Assistant",
  "role": "researcher",
  "description": "Gathers sources and drafts briefings.",
  "systemPrompt": "You are a careful research assistant...",
  "tools": ["search_web"],
  "memoryScope": "session"
}`,
  tool: `{
  "name": "search_web"
}`,
  workflow: `{
  "name": "Weekly digest",
  "description": "Generates a Monday briefing.",
  "graph": { "entryNodeId": "n1", "nodes": [ { "id": "n1", "kind": "trigger", "config": {} } ] },
  "trigger": { "kind": "manual" }
}`,
};

export function PublishForm() {
  const router = useRouter();
  const [kind, setKind] = useState<ListingKind>("agent");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityJson, setEntityJson] = useState(KIND_PLACEHOLDER.agent);
  const [visibility, setVisibility] = useState<ListingVisibility>("public");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleKindChange(next: ListingKind) {
    // Only overwrite the entity JSON if it still matches a known template
    // (i.e. the user hasn't started editing it).
    const templates = Object.values(KIND_PLACEHOLDER);
    if (templates.includes(entityJson)) {
      setEntityJson(KIND_PLACEHOLDER[next]);
    }
    setKind(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let entity: unknown;
    try {
      entity = JSON.parse(entityJson);
    } catch {
      setError("Entity must be valid JSON.");
      setSubmitting(false);
      return;
    }

    const priceCents =
      price.trim() === "" ? undefined : Math.round(Number(price) * 100);
    if (priceCents !== undefined && !Number.isFinite(priceCents)) {
      setError("Price must be a number.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title,
          description,
          entity,
          visibility,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          price: priceCents,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        matches?: string[];
        listing?: { id: string };
      };
      if (!res.ok) {
        if (data.error === "safety_check_failed" && data.matches) {
          setError(
            `Safety scan rejected your listing. Remove: ${data.matches.join(", ")}.`,
          );
        } else {
          setError(data.message ?? data.error ?? "Publish failed");
        }
        return;
      }
      if (data.listing?.id) {
        router.push(`/marketplace/${data.listing.id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Kind</label>
        <div className="flex gap-2">
          {(["agent", "tool", "workflow"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => handleKindChange(k)}
              className={`rounded-full border px-3 py-1 text-sm capitalize ${
                kind === k
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-1 block text-sm font-medium"
        >
          Description
        </label>
        <textarea
          id="description"
          required
          minLength={10}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="entity"
          className="mb-1 block text-sm font-medium"
        >
          Entity JSON
        </label>
        <textarea
          id="entity"
          required
          value={entityJson}
          onChange={(e) => setEntityJson(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs"
        />
        <p className="mt-1 text-xs text-neutral-500">
          For <strong>agent</strong> listings, include at least{" "}
          <code>systemPrompt</code>. For <strong>workflow</strong>{" "}
          listings, include <code>graph</code> and <code>trigger</code>.
          For <strong>tool</strong> listings, include the registry{" "}
          <code>name</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="visibility" className="mb-1 block text-sm font-medium">
            Visibility
          </label>
          <select
            id="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ListingVisibility)}
            className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private (draft)</option>
          </select>
        </div>

        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-medium">
            Tags (comma-separated)
          </label>
          <input
            id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="price" className="mb-1 block text-sm font-medium">
            Price USD (blank = free)
          </label>
          <input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "Publishing…" : "Publish"}
        </button>
      </div>
    </form>
  );
}

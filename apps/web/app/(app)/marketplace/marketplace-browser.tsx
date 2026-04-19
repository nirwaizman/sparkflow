"use client";

/**
 * Client-side browser grid for /marketplace.
 *
 * Holds the current filter state (kind, q, tag, sort) and re-fetches
 * from `/api/marketplace/listings` whenever the user changes any
 * facet. Keeps the grid in the initial SSR-rendered order until the
 * first fetch resolves.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Listing, ListingKind, ListingSort } from "@sparkflow/marketplace";

type Props = {
  initial: Listing[];
};

const KIND_LABELS: Record<ListingKind | "all", string> = {
  all: "All",
  agent: "Agents",
  tool: "Tools",
  workflow: "Workflows",
};

const SORT_LABELS: Record<ListingSort, string> = {
  recent: "Most recent",
  installs: "Most installed",
  rating: "Top rated",
};

function formatRating(n: number): string {
  if (n === 0) return "—";
  return n.toFixed(1);
}

function kindBadgeClass(kind: ListingKind): string {
  switch (kind) {
    case "agent":
      return "bg-purple-100 text-purple-700";
    case "tool":
      return "bg-emerald-100 text-emerald-700";
    case "workflow":
      return "bg-amber-100 text-amber-700";
  }
}

export function MarketplaceBrowser({ initial }: Props) {
  const [kind, setKind] = useState<ListingKind | "all">("all");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<ListingSort>("recent");
  const [listings, setListings] = useState<Listing[]>(initial);
  const [loading, setLoading] = useState(false);

  // Debounce text inputs so every keystroke doesn't hit the API.
  const debounced = useDebounced({ q, tag }, 250);

  useEffect(() => {
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (debounced.q) params.set("q", debounced.q);
    if (debounced.tag) params.set("tag", debounced.tag);
    params.set("sort", sort);

    let cancelled = false;
    setLoading(true);
    fetch(`/api/marketplace/listings?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data: { listings?: Listing[] }) => {
        if (!cancelled) setListings(data.listings ?? []);
      })
      .catch(() => {
        if (!cancelled) setListings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, debounced.q, debounced.tag, sort]);

  const counts = useMemo(() => {
    const c: Record<ListingKind | "all", number> = {
      all: listings.length,
      agent: 0,
      tool: 0,
      workflow: 0,
    };
    for (const l of listings) c[l.kind] += 1;
    return c;
  }, [listings]);

  return (
    <>
      <section
        aria-label="filters"
        className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
      >
        <div className="flex flex-wrap gap-1">
          {(["all", "agent", "tool", "workflow"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                kind === k
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {KIND_LABELS[k]}
              <span className="ml-1 text-[10px] opacity-70">
                {counts[k]}
              </span>
            </button>
          ))}
        </div>

        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search listings…"
          className="flex-1 min-w-[160px] rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
        />

        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag"
          className="w-28 rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
        />

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ListingSort)}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
        >
          {(["recent", "installs", "rating"] as const).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </section>

      {loading && listings.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">
          Loading listings…
        </p>
      ) : listings.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">
          No listings match your filters yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <li key={l.id}>
              <Link
                href={`/marketplace/${l.id}`}
                className="block h-full rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 hover:shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${kindBadgeClass(
                      l.kind,
                    )}`}
                  >
                    {l.kind}
                  </span>
                  <span className="text-xs text-neutral-500">
                    ★ {formatRating(l.ratingAvg)}
                    <span className="ml-1 opacity-70">
                      ({l.ratingCount})
                    </span>
                  </span>
                </div>
                <h3 className="line-clamp-1 font-semibold">{l.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-neutral-600">
                  {l.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>{l.installCount} installs</span>
                  {l.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {l.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Tiny local debounce so we don't reach for a util lib.
function useDebounced<T>(value: T, delay: number): T {
  const [state, setState] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setState(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return state;
}

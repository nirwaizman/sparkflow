"use client";

/**
 * Renders the contacts table with checkbox selection and a bulk-action
 * bar. The bar drives three endpoints:
 *   - PATCH /api/contacts/[id]  (per-row for the tag add/remove sweep)
 *   - POST  /api/contacts/enrich
 *   - DELETE /api/contacts/[id]
 *
 * Tag add/remove is done client-side then flushed per-row so we don't
 * need a dedicated bulk-tag endpoint on the web layer — the store's
 * `bulkTag` primitive backs the PATCH calls.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Contact } from "@sparkflow/crm";

export function BulkContactsActions({
  contacts,
}: {
  contacts: ReadonlyArray<Contact>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const allSelected = useMemo(
    () => contacts.length > 0 && selected.size === contacts.length,
    [contacts, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  }

  function bulkPatch(patchFor: (c: Contact) => Partial<Contact>, verb: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setMsg(null);
    startTransition(async () => {
      const byId = new Map(contacts.map((c) => [c.id, c] as const));
      let ok = 0;
      for (const id of ids) {
        const contact = byId.get(id);
        if (!contact) continue;
        const patch = patchFor(contact);
        const res = await fetch(`/api/contacts/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) ok += 1;
      }
      setMsg(`${verb} ${ok}/${ids.length} contact(s).`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function applyTag(add: boolean) {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    bulkPatch(
      (c) => {
        const current = new Set(c.tags);
        if (add) current.add(tag);
        else current.delete(tag);
        return { tags: [...current] };
      },
      add ? "Tagged" : "Untagged",
    );
    setTagInput("");
  }

  function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete ${ids.length} contact(s)? This cannot be undone.`)
    ) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      let ok = 0;
      for (const id of ids) {
        const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
        if (res.ok) ok += 1;
      }
      setMsg(`Deleted ${ok}/${ids.length} contact(s).`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function enrichSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/contacts/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        contacts?: unknown[];
        failures?: unknown[];
        error?: string;
      };
      if (!res.ok) {
        setMsg(data.error ?? `enrich failed (${res.status})`);
        return;
      }
      setMsg(
        `Enriched ${data.contacts?.length ?? 0}/${ids.length} contact(s)${
          data.failures?.length ? `, ${data.failures.length} failure(s)` : ""
        }.`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-neutral-50 px-3 py-2 text-xs">
        <span className="font-medium">{selected.size} selected</span>
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="tag..."
          className="w-32 rounded border px-2 py-1"
          disabled={pending}
        />
        <button
          type="button"
          onClick={() => applyTag(true)}
          disabled={pending || selected.size === 0 || !tagInput.trim()}
          className="rounded border px-2 py-1 font-medium hover:bg-white disabled:opacity-50"
        >
          Add tag
        </button>
        <button
          type="button"
          onClick={() => applyTag(false)}
          disabled={pending || selected.size === 0 || !tagInput.trim()}
          className="rounded border px-2 py-1 font-medium hover:bg-white disabled:opacity-50"
        >
          Remove tag
        </button>
        <button
          type="button"
          onClick={enrichSelected}
          disabled={pending || selected.size === 0}
          className="rounded border px-2 py-1 font-medium hover:bg-white disabled:opacity-50"
        >
          Enrich
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={pending || selected.size === 0}
          className="rounded border border-rose-300 px-2 py-1 font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Delete
        </button>
        {msg ? (
          <span className="ml-auto text-neutral-600" role="status">
            {msg}
          </span>
        ) : null}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="w-8 py-2">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={toggleAll}
              />
            </th>
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2">Company</th>
            <th className="py-2">Tags</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} className="border-b hover:bg-neutral-50">
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${c.name}`}
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
              </td>
              <td className="py-2">
                <Link
                  href={`/contacts/${c.id}`}
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {c.name}
                </Link>
                {c.title ? (
                  <div className="text-xs text-neutral-500">{c.title}</div>
                ) : null}
              </td>
              <td className="py-2 text-neutral-700">{c.email ?? "—"}</td>
              <td className="py-2 text-neutral-700">{c.company ?? "—"}</td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {c.tags.length === 0 ? (
                    <span className="text-xs text-neutral-400">—</span>
                  ) : (
                    c.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800"
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

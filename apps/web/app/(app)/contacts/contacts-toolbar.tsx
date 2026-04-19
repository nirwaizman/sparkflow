"use client";

/**
 * Search + tag filter + CSV import/export controls for the contacts list.
 * Pushes its state into the URL so the server component re-fetches.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

export function ContactsToolbar({
  initialQ,
  initialTag,
  knownTags,
}: {
  initialQ: string;
  initialTag: string;
  knownTags: ReadonlyArray<string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [tag, setTag] = useState(initialTag);
  const [importing, startImport] = useTransition();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyFilters(nextQ: string, nextTag: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (nextQ) params.set("q", nextQ);
    else params.delete("q");
    if (nextTag) params.set("tag", nextTag);
    else params.delete("tag");
    router.push(`/contacts${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    applyFilters(q.trim(), tag.trim());
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    setImportMsg(null);
    startImport(async () => {
      try {
        const res = await fetch("/api/contacts/import", {
          method: "POST",
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as {
          created?: number;
          updated?: number;
          errors?: { row: number; message: string }[];
          error?: string;
        };
        if (!res.ok) {
          setImportMsg(data.error ?? `import failed (${res.status})`);
          return;
        }
        const errCount = data.errors?.length ?? 0;
        setImportMsg(
          `Imported: ${data.created ?? 0} new, ${data.updated ?? 0} updated${
            errCount ? `, ${errCount} row error(s)` : ""
          }.`,
        );
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (err) {
        setImportMsg(err instanceof Error ? err.message : "import failed");
      }
    });
  }

  const exportUrl = (() => {
    const params = new URLSearchParams();
    if (initialQ) params.set("q", initialQ);
    if (initialTag) params.set("tag", initialTag);
    const qs = params.toString();
    return `/api/contacts/export${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name, email, company"
            className="mt-1 w-64 rounded-md border px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Tag
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="lead, priority..."
            list="crm-known-tags"
            className="mt-1 w-40 rounded-md border px-3 py-1.5 text-sm"
          />
          <datalist id="crm-known-tags">
            {knownTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button
          type="submit"
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
        >
          Apply
        </button>
        {(initialQ || initialTag) && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setTag("");
              applyFilters("", "");
            }}
            className="rounded-md border px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Clear
          </button>
        )}
      </form>
      <div className="ml-auto flex items-center gap-2">
        <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">
          {importing ? "Importing…" : "Import CSV"}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            disabled={importing}
            className="hidden"
          />
        </label>
        <a
          href={exportUrl}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
        >
          Export CSV
        </a>
      </div>
      {importMsg ? (
        <p className="w-full text-xs text-neutral-600">{importMsg}</p>
      ) : null}
    </div>
  );
}

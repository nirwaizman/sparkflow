"use client";

/**
 * Client form that POSTs to /api/contacts and navigates to the new
 * contact's detail page on success.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type FieldKey =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "title"
  | "industry"
  | "notes"
  | "tags";

const FIELDS: ReadonlyArray<{
  key: FieldKey;
  label: string;
  type: "text" | "email" | "textarea";
  placeholder?: string;
}> = [
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "company", label: "Company", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "industry", label: "Industry", type: "text" },
  {
    key: "tags",
    label: "Tags",
    type: "text",
    placeholder: "comma-separated, e.g. lead, priority",
  },
  { key: "notes", label: "Notes", type: "textarea" },
];

export function NewContactForm() {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    name: "",
    email: "",
    phone: "",
    company: "",
    title: "",
    industry: "",
    notes: "",
    tags: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(key: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!values.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    const tags = values.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const body = {
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      company: values.company.trim() || null,
      title: values.title.trim() || null,
      industry: values.industry.trim() || null,
      notes: values.notes.trim() || null,
      tags,
    };
    startTransition(async () => {
      try {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          contact?: { id: string };
          error?: string;
        };
        if (!res.ok || !data.contact) {
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        router.push(`/contacts/${data.contact.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {FIELDS.map((field) => (
        <label key={field.key} className="block text-sm">
          <span className="block text-xs font-medium text-neutral-600">
            {field.label}
            {field.key === "name" ? " *" : ""}
          </span>
          {field.type === "textarea" ? (
            <textarea
              value={values[field.key]}
              onChange={(e) => set(field.key, e.target.value)}
              rows={4}
              placeholder={field.placeholder}
              className="mt-1 w-full rounded-md border px-3 py-2"
              disabled={pending}
            />
          ) : (
            <input
              type={field.type}
              value={values[field.key]}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="mt-1 w-full rounded-md border px-3 py-2"
              disabled={pending}
            />
          )}
        </label>
      ))}
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={pending || !values.name.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Create contact"}
        </button>
      </div>
    </form>
  );
}

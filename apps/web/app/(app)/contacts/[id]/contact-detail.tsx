"use client";

/**
 * Detail + edit view for a single contact.
 *
 * The left column hosts an inline edit form (PATCH /api/contacts/[id]).
 * The right column renders the activity timeline — each row links to
 * the related message/meeting/task in the rest of the product. For now
 * these are stub links, per the product spec.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Contact, ContactActivity } from "@sparkflow/crm";

const KIND_LABEL: Record<ContactActivity["kind"], string> = {
  message: "Message",
  meeting: "Meeting",
  task: "Task",
};

const KIND_STYLES: Record<ContactActivity["kind"], string> = {
  message: "bg-sky-100 text-sky-800",
  meeting: "bg-violet-100 text-violet-800",
  task: "bg-emerald-100 text-emerald-800",
};

function tagsToString(tags: ReadonlyArray<string>): string {
  return tags.join(", ");
}

export function ContactDetail({
  contact,
  activity,
}: {
  contact: Contact;
  activity: ReadonlyArray<ContactActivity>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    title: contact.title ?? "",
    industry: contact.industry ?? "",
    notes: contact.notes ?? "",
    tags: tagsToString(contact.tags),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMsg("Name is required.");
      return;
    }
    setMsg(null);
    const patch = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      title: form.title.trim() || null,
      industry: form.industry.trim() || null,
      notes: form.notes.trim() || null,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };
    startTransition(async () => {
      try {
        const res = await fetch(`/api/contacts/${contact.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setMsg(data.error ?? `Update failed (${res.status})`);
          return;
        }
        setMsg("Saved.");
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Unknown error");
      }
    });
  }

  function enrich() {
    setMsg(null);
    startTransition(async () => {
      const res = await fetch("/api/contacts/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [contact.id] }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(data.error ?? `Enrich failed (${res.status})`);
        return;
      }
      setMsg("Enriched. Reloading…");
      router.refresh();
    });
  }

  function remove() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this contact? This cannot be undone.")
    ) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(data.error ?? `Delete failed (${res.status})`);
        return;
      }
      router.push("/contacts");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
      <section className="md:col-span-3">
        <h1 className="mb-1 text-2xl font-semibold">{contact.name}</h1>
        <p className="mb-6 text-sm text-neutral-500">
          {[contact.title, contact.company].filter(Boolean).join(" · ") ||
            "No role set"}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Name *"
            value={form.name}
            onChange={(v) => setForm((p) => ({ ...p, name: v }))}
            disabled={pending}
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm((p) => ({ ...p, email: v }))}
            disabled={pending}
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
            disabled={pending}
          />
          <Field
            label="Company"
            value={form.company}
            onChange={(v) => setForm((p) => ({ ...p, company: v }))}
            disabled={pending}
          />
          <Field
            label="Title"
            value={form.title}
            onChange={(v) => setForm((p) => ({ ...p, title: v }))}
            disabled={pending}
          />
          <Field
            label="Industry"
            value={form.industry}
            onChange={(v) => setForm((p) => ({ ...p, industry: v }))}
            disabled={pending}
          />
          <Field
            label="Tags"
            value={form.tags}
            onChange={(v) => setForm((p) => ({ ...p, tags: v }))}
            placeholder="comma-separated"
            disabled={pending}
          />
          <label className="block text-sm">
            <span className="block text-xs font-medium text-neutral-600">
              Notes
            </span>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
              rows={4}
              className="mt-1 w-full rounded-md border px-3 py-2"
              disabled={pending}
            />
          </label>
          {msg ? (
            <p className="text-xs text-neutral-600" role="status">
              {msg}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={enrich}
              disabled={pending}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              Enrich with AI
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="ml-auto rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </form>
      </section>

      <aside className="md:col-span-2">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Activity
        </h2>
        {activity.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-neutral-500">
            No activity yet. Messages, meetings and tasks involving this
            contact will appear here.
          </p>
        ) : (
          <ol className="space-y-3">
            {activity.map((a) => (
              <li
                key={a.id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLES[a.kind]}`}
                  >
                    {KIND_LABEL[a.kind]}
                  </span>
                  <time className="text-xs text-neutral-500">
                    {a.occurredAt.toLocaleString()}
                  </time>
                </div>
                <p className="mt-1 text-neutral-800">{a.summary}</p>
                {a.link ? (
                  <a
                    href={a.link}
                    className="mt-1 inline-block text-xs text-indigo-700 hover:underline"
                  >
                    Open →
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: "text" | "email";
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-medium text-neutral-600">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 w-full rounded-md border px-3 py-2"
      />
    </label>
  );
}

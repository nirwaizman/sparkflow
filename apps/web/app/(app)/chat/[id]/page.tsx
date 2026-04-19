/**
 * /chat/:id — the single-conversation view.
 *
 * Server Component. The `(app)` layout already enforces auth + loads the
 * session; here we forward the `id` to the client shell. `id === "new"`
 * is treated as a fresh conversation by `<ChatShell />`.
 *
 * When routed from the workspace home super-composer we also receive
 * `?q=...&mode=...` — those are handed to a tiny client bridge
 * (`<PrefillHandler />`) that stores them in localStorage for the
 * composer to pick up, then scrubs the query string. We cannot modify
 * `chat-shell.tsx` as part of this change, so the round-trip is via
 * storage rather than props.
 */
import { ChatShell } from "@/components/chat/chat-shell";
import { PrefillHandler } from "./prefill-handler";

type SearchParams = { q?: string | string[]; mode?: string | string[] };

function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const q = firstValue(sp.q);
  const mode = firstValue(sp.mode);

  return (
    <>
      <PrefillHandler q={q} mode={mode} />
      <ChatShell conversationId={id} />
    </>
  );
}

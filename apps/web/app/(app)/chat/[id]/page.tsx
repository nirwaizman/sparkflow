/**
 * /chat/:id — the single-conversation view.
 *
 * Server Component. The `(app)` layout already enforces auth + loads the
 * session; here we only forward the `id` to the client shell. `id === "new"`
 * is treated as a fresh conversation by `<ChatShell />`.
 */
import { ChatShell } from "@/components/chat/chat-shell";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatShell conversationId={id} />;
}

import type { ChatMessage as ChatMessageType } from "@sparkflow/shared";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`rounded-3xl border p-4 shadow-sm ${
        isUser ? "border-blue-400/30 bg-blue-500/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-slate-300">
        <span>{isUser ? "You" : "SparkFlow"}</span>
        {message.mode ? (
          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px]">
            {message.mode}
          </span>
        ) : null}
      </div>

      <div className="whitespace-pre-wrap text-sm leading-7 text-slate-50">{message.content}</div>

      {message.sources?.length ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Sources</p>
          <div className="space-y-2">
            {message.sources.map((source, idx) => (
              <a
                key={`${source.url}-${idx}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
              >
                <p className="text-sm font-medium text-slate-100">
                  [{idx + 1}] {source.title}
                </p>
                <p className="mt-1 text-xs text-slate-300">{source.snippet}</p>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

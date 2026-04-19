import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Upload } from 'lucide-react';

/**
 * Translucent center-screen quick-prompt window.
 * Auto-focuses on mount, Escape hides, Enter submits, streams results inline.
 */
export function QuickPrompt() {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abortRef.current?.abort();
        void window.sparkflow.window.hideQuick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function submit() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setAnswer('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for await (const chunk of window.sparkflow.chat.stream({ prompt: text, signal: ctrl.signal })) {
        setAnswer((prev) => prev + chunk);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    try {
      setBusy(true);
      await window.sparkflow.chat.uploadFiles(files);
      setAnswer(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex h-screen w-screen flex-col p-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div
        className={`flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-2xl backdrop-blur-xl transition ${
          dragOver ? 'ring-2 ring-sky-400' : ''
        }`}
      >
        <div className="flex items-start gap-3 border-b border-white/10 p-4">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask SparkFlow anything…  (Enter to send, Shift+Enter for newline, Esc to dismiss)"
            rows={2}
            className="flex-1 resize-none bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !prompt.trim()}
            className="rounded-lg bg-sky-500 p-2 text-white disabled:opacity-40"
            aria-label="Send"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 text-sm text-white/90">
          {error ? (
            <div className="text-red-400">Error: {error}</div>
          ) : answer ? (
            <pre className="whitespace-pre-wrap font-sans">{answer}</pre>
          ) : (
            <div className="flex items-center gap-2 text-white/40">
              <Upload className="h-4 w-4" /> Drop files into the window to upload.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

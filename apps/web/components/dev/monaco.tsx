"use client";

/**
 * Thin wrapper around `@monaco-editor/react`.
 *
 * - Dark theme (`vs-dark`).
 * - `automaticLayout` so the editor resizes with its container (RTL-safe —
 *   we also force `direction: ltr` on the wrapper since code should always
 *   render LTR regardless of the surrounding app's direction).
 * - Loader dynamic to avoid pulling Monaco into the server bundle.
 */
import dynamic from "next/dynamic";

// Typed as `any` because `@monaco-editor/react` types are only present when
// the package is installed. The wrapper's own prop surface is strongly typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = dynamic<any>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  () => import("@monaco-editor/react" as any).then((m: any) => m.default),
  { ssr: false, loading: () => <EditorSkeleton /> },
);

function EditorSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e] text-xs text-neutral-500">
      Loading editor…
    </div>
  );
}

type MonacoProps = {
  path: string;
  value: string;
  language?: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  height?: string | number;
};

// Crude extension → Monaco language id mapping.
function languageFor(path: string, override?: string): string {
  if (override) return override;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
      return "python";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
      return "shell";
    default:
      return "plaintext";
  }
}

export function Monaco({
  path,
  value,
  language,
  onChange,
  readOnly,
  height = "100%",
}: MonacoProps) {
  const options = {
    fontSize: 13,
    minimap: { enabled: false },
    automaticLayout: true,
    tabSize: 2,
    scrollBeyondLastLine: false,
    readOnly: !!readOnly,
    wordWrap: "on" as const,
    smoothScrolling: true,
    renderLineHighlight: "line" as const,
  };

  return (
    <div className="h-full w-full" style={{ direction: "ltr" }}>
      <MonacoEditor
        height={height}
        theme="vs-dark"
        path={path}
        language={languageFor(path, language)}
        value={value}
        onChange={(v: string | undefined) => onChange(v ?? "")}
        options={options}
      />
    </div>
  );
}

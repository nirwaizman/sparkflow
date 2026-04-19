/**
 * Starter templates for the AI Developer studio.
 *
 * Each template is a flat array of files with POSIX paths (no leading slash).
 * The first file tends to be the natural "entry" — the studio uses
 * `STARTER_ENTRIES` to pre-populate the entry field when switching templates.
 */
export type StarterFile = { path: string; content: string };

export type StarterKey =
  | "blank"
  | "express-api"
  | "react-vite"
  | "python-script"
  | "data-analysis";

export const STARTER_META: Record<
  StarterKey,
  { label: string; language: "ts" | "js" | "python"; entry: string }
> = {
  blank: { label: "Blank", language: "ts", entry: "index.ts" },
  "express-api": {
    label: "Express API",
    language: "js",
    entry: "server.js",
  },
  "react-vite": {
    label: "React + Vite",
    language: "ts",
    entry: "src/main.tsx",
  },
  "python-script": {
    label: "Python script",
    language: "python",
    entry: "main.py",
  },
  "data-analysis": {
    label: "Data analysis notebook",
    language: "python",
    entry: "analysis.py",
  },
};

export const STARTERS: Record<StarterKey, StarterFile[]> = {
  blank: [
    {
      path: "index.ts",
      content:
        "// Blank TypeScript starter.\n// Ask the AI assistant on the right to generate something.\n\nexport function hello(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(hello(\"world\"));\n",
    },
    {
      path: "README.md",
      content:
        "# Blank project\n\nA minimal TypeScript starter. Edit `index.ts` or ask the AI to scaffold something.\n",
    },
  ],

  "express-api": [
    {
      path: "server.js",
      content: [
        "// Minimal Express API. Run: `node server.js`",
        "import express from \"express\";",
        "",
        "const app = express();",
        "app.use(express.json());",
        "",
        "app.get(\"/\", (_req, res) => {",
        "  res.json({ ok: true, service: \"express-api\" });",
        "});",
        "",
        "app.get(\"/hello/:name\", (req, res) => {",
        "  res.json({ message: `Hello, ${req.params.name}!` });",
        "});",
        "",
        "const port = Number(process.env.PORT ?? 3000);",
        "app.listen(port, () => {",
        "  console.log(`listening on :${port}`);",
        "});",
        "",
      ].join("\n"),
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "express-api",
          version: "0.0.1",
          private: true,
          type: "module",
          scripts: { start: "node server.js" },
          dependencies: { express: "^4.19.2" },
        },
        null,
        2,
      ) + "\n",
    },
    {
      path: "README.md",
      content:
        "# Express API\n\n```bash\nnpm install\nnpm start\n```\n",
    },
  ],

  "react-vite": [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: "react-vite-app",
          private: true,
          version: "0.0.1",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
            preview: "vite preview",
          },
          dependencies: {
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            "@vitejs/plugin-react": "^4.3.0",
            typescript: "^5.5.0",
            vite: "^5.4.0",
          },
        },
        null,
        2,
      ) + "\n",
    },
    {
      path: "index.html",
      content: [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"UTF-8\" />",
        "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
        "    <title>React + Vite</title>",
        "  </head>",
        "  <body>",
        "    <div id=\"root\"></div>",
        "    <script type=\"module\" src=\"/src/main.tsx\"></script>",
        "  </body>",
        "</html>",
        "",
      ].join("\n"),
    },
    {
      path: "src/main.tsx",
      content: [
        "import React from \"react\";",
        "import { createRoot } from \"react-dom/client\";",
        "import { App } from \"./App\";",
        "",
        "createRoot(document.getElementById(\"root\")!).render(",
        "  <React.StrictMode>",
        "    <App />",
        "  </React.StrictMode>,",
        ");",
        "",
      ].join("\n"),
    },
    {
      path: "src/App.tsx",
      content: [
        "import { useState } from \"react\";",
        "",
        "export function App() {",
        "  const [count, setCount] = useState(0);",
        "  return (",
        "    <main style={{ fontFamily: \"system-ui\", padding: 24 }}>",
        "      <h1>Hello from React + Vite</h1>",
        "      <button onClick={() => setCount((c) => c + 1)}>",
        "        count is {count}",
        "      </button>",
        "    </main>",
        "  );",
        "}",
        "",
      ].join("\n"),
    },
    {
      path: "vite.config.ts",
      content: [
        "import { defineConfig } from \"vite\";",
        "import react from \"@vitejs/plugin-react\";",
        "",
        "export default defineConfig({",
        "  plugins: [react()],",
        "});",
        "",
      ].join("\n"),
    },
  ],

  "python-script": [
    {
      path: "main.py",
      content: [
        "# Python starter script.",
        "# Ask the AI assistant on the right to modify this file.",
        "",
        "def greet(name: str) -> str:",
        "    return f\"Hello, {name}!\"",
        "",
        "",
        "if __name__ == \"__main__\":",
        "    print(greet(\"world\"))",
        "",
      ].join("\n"),
    },
    {
      path: "requirements.txt",
      content: "# Add runtime deps here, one per line.\n",
    },
  ],

  "data-analysis": [
    {
      path: "analysis.py",
      content: [
        "\"\"\"Tiny data-analysis starter.",
        "",
        "Uses only the Python standard library so it runs without installs.",
        "Ask the AI to switch to pandas / numpy / matplotlib and write tests.",
        "\"\"\"",
        "from __future__ import annotations",
        "",
        "import csv",
        "import io",
        "import statistics",
        "",
        "SAMPLE = \"\"\"\\",
        "date,product,revenue",
        "2024-01-01,widget,120",
        "2024-01-02,widget,180",
        "2024-01-03,gizmo,240",
        "2024-01-04,gizmo,90",
        "2024-01-05,widget,300",
        "\"\"\"",
        "",
        "",
        "def summarize(csv_text: str) -> dict:",
        "    reader = csv.DictReader(io.StringIO(csv_text))",
        "    rows = [r for r in reader]",
        "    revenues = [float(r[\"revenue\"]) for r in rows]",
        "    by_product: dict[str, float] = {}",
        "    for r in rows:",
        "        by_product[r[\"product\"]] = by_product.get(r[\"product\"], 0.0) + float(r[\"revenue\"])",
        "    return {",
        "        \"count\": len(rows),",
        "        \"total\": sum(revenues),",
        "        \"mean\": statistics.fmean(revenues) if revenues else 0.0,",
        "        \"by_product\": by_product,",
        "    }",
        "",
        "",
        "if __name__ == \"__main__\":",
        "    import json",
        "    print(json.dumps(summarize(SAMPLE), indent=2))",
        "",
      ].join("\n"),
    },
    {
      path: "README.md",
      content:
        "# Data analysis\n\nStdlib-only starter that summarizes a tiny CSV. Ask the AI to upgrade to pandas + plots.\n",
    },
  ],
};

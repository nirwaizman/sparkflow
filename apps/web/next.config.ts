import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: [
    "@sparkflow/shared",
    "@sparkflow/llm",
    "@sparkflow/ui",
    "@sparkflow/auth",
    "@sparkflow/db",
    "@sparkflow/observability",
    "@sparkflow/rag",
    "@sparkflow/memory",
  ],
  // postgres (postgres-js) and pino ship Node built-in imports; keep them out of the client bundle.
  serverExternalPackages: ["postgres", "pino", "pino-pretty", "langfuse", "posthog-node"],
};

export default nextConfig;

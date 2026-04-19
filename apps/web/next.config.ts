import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
    "@sparkflow/agents",
    "@sparkflow/tools",
    "@sparkflow/billing",
    "@sparkflow/compliance",
    "@sparkflow/crm",
    "@sparkflow/meetings",
    "@sparkflow/marketplace",
    "@sparkflow/realtime",
    "@sparkflow/growth",
    "@sparkflow/public-api",
    "@sparkflow/enterprise",
    "@sparkflow/entitlements",
    "@sparkflow/tasks",
    "@sparkflow/workflows",
  ],
  // postgres (postgres-js) and pino ship Node built-in imports; keep them out of the client bundle.
  serverExternalPackages: [
    "postgres",
    "pino",
    "pino-pretty",
    "langfuse",
    "posthog-node",
    "playwright",
    "@e2b/code-interpreter",
  ],
};

export default withNextIntl(nextConfig);

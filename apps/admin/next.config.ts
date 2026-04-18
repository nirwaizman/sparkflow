import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: [
    "@sparkflow/shared",
    "@sparkflow/ui",
    "@sparkflow/auth",
    "@sparkflow/db",
    "@sparkflow/observability",
  ],
  serverExternalPackages: ["postgres", "pino", "pino-pretty", "langfuse", "posthog-node"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: ["@sparkflow/shared", "@sparkflow/llm"],
};

export default nextConfig;

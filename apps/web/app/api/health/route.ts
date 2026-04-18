import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: process.env.NEXT_PUBLIC_APP_NAME ?? "SparkFlow",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      tavily: Boolean(process.env.TAVILY_API_KEY),
      serpapi: Boolean(process.env.SERPAPI_API_KEY),
    },
    searchProvider: process.env.SEARCH_PROVIDER ?? "demo",
  });
}

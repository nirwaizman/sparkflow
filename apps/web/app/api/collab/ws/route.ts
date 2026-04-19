/**
 * /api/collab/ws — Yjs websocket broker *stub*.
 *
 * Status: documentation-only.
 *
 * Next.js 15 App Router route handlers do not expose a stable
 * `Upgrade: websocket` hook. The Edge runtime does not support raw
 * sockets, and the Node runtime handler receives a `Request`, not the
 * raw `IncomingMessage`/`ServerResponse` pair y-websocket's
 * `utils.setupWSConnection` needs. We therefore ship a standalone
 * broker under `apps/realtime-server/` and this route exists only to:
 *
 *   1. Return a 426 Upgrade Required on plain HTTP (matches the
 *      behavior of a real WS endpoint, helps smoke-tests notice the
 *      misconfiguration).
 *   2. Return, on GET, a small JSON document pointing operators at the
 *      standalone broker. This is what `createYDoc` hits in
 *      production via `NEXT_PUBLIC_REALTIME_WS_URL`.
 *
 * If / when Next ships first-class WebSocket handlers we can swap this
 * file for a real broker using `y-websocket/bin/utils` without the
 * client having to change.
 *
 * TODO(wp-collab): replace with real WS upgrade once Next.js exposes it
 *                  (or switch to a custom server.js). Until then: run
 *                  `pnpm -C apps/realtime-server dev` alongside
 *                  `pnpm -C apps/web dev` during local development.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function brokerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_REALTIME_WS_URL ??
    process.env.REALTIME_WS_URL ??
    "ws://localhost:1234"
  );
}

export function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "Yjs broker runs as a standalone process. See apps/realtime-server.",
    brokerUrl: brokerUrl(),
    protocol: "yjs/y-websocket",
  });
}

export function POST() {
  return new NextResponse(
    "Upgrade Required: this endpoint requires a WebSocket upgrade. " +
      "Point your Yjs client at the standalone broker URL instead.",
    {
      status: 426,
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
      },
    },
  );
}

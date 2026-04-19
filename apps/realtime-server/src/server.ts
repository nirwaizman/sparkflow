/**
 * Standalone Yjs websocket broker.
 *
 * Next.js 15 route handlers can't cleanly hijack the WebSocket upgrade,
 * so we run the broker as its own tiny Node process. It wraps the
 * reference `setupWSConnection` from `y-websocket/bin/utils` and exposes
 * it on an HTTP server.
 *
 * Env:
 *   PORT — port to listen on, default 1234.
 *   HOST — bind address, default 0.0.0.0.
 *
 * TODO(auth): currently we accept any connection. Before shipping to
 *             prod, validate the `?token=…` query param against Supabase
 *             JWT or the `shared_links` table (read-only rooms get a
 *             server-side read-only Y.Doc snapshot instead of a
 *             collaborative session).
 */
import http from "node:http";
import { WebSocketServer } from "ws";
// y-websocket ships the reference broker in its `bin/utils` module.
// The `.cjs` suffix is what the package actually publishes; importing
// the bare path works under Node's ESM resolution because `ws` and the
// rest of the broker are CommonJS.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- y-websocket has no published types for this entry.
import { setupWSConnection } from "y-websocket/bin/utils";

const PORT = Number(process.env.PORT ?? 1234);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, protocol: "yjs/y-websocket" }));
    return;
  }
  res.writeHead(426, {
    "content-type": "text/plain",
    Upgrade: "websocket",
    Connection: "Upgrade",
  });
  res.end("Upgrade Required");
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (conn, req) => {
  // `setupWSConnection` expects the raw `ws` + `IncomingMessage` pair.
  // It reads the room from the URL path (e.g. `/conversation:abc`).
  setupWSConnection(conn, req);
});

server.on("upgrade", (req, socket, head) => {
  // `ws` handles the handshake then hands the socket to `wss.connection`.
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[realtime-server] listening on ws://${HOST}:${PORT}`);
});

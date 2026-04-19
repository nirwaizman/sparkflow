# @sparkflow/realtime

Yjs-based realtime primitives shared between the web app and the
standalone broker.

## Modules

- `provider/yjs` — `createYDoc({ roomId, token })` factory that wires a
  `Y.Doc`, a `y-websocket` provider, and an `Awareness` instance.
- `presence` — `setLocalUser`, `broadcastCursor`, `broadcastSelection`,
  `subscribePresence`. Thin helpers over `Awareness`.
- `share/links` — `createShareLink`, `resolveShareLink`,
  `revokeShareLink`. CRUD over the `shared_links` table.

## Environment

- `NEXT_PUBLIC_REALTIME_WS_URL` — broker URL used by the client.
  Defaults to `ws://localhost:1234` to match `apps/realtime-server`.

## Not exported on purpose

- The broker server itself — see `apps/realtime-server`. We keep the
  broker outside this package so the browser bundle never pulls in
  `ws` / `node:http`.

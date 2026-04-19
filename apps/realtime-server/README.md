# @sparkflow/realtime-server

Standalone Yjs WebSocket broker. The Next.js app routes realtime
traffic here rather than through a Next route handler because Next 15
does not expose a stable WebSocket upgrade hook.

## Running

```bash
pnpm -C apps/realtime-server dev    # ws://localhost:1234
```

Point the web app at it:

```
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:1234
```

## Production

Run this process under a supervisor (pm2, systemd, a Fly worker,
a Cloud Run container, …) and set `PORT` / `HOST` via env.

## TODO

- Authenticate the `?token=` query param (Supabase JWT / share-link
  slug).
- Persist docs to Postgres or object storage for recovery after
  restart (reference: `y-leveldb`, `y-redis`).
- Metrics: connection count, room count, bytes in/out.

# @sparkflow/chrome-extension

SparkFlow's Manifest V3 Chrome extension: a side panel chat, a context-menu
shortcut to ask SparkFlow about the current page, and a popup with quick
actions. All traffic is bound to the SparkFlow web backend configured in the
options page.

## Features

- **Side panel chat** (Chrome's built-in side panel API) that streams from
  `POST /api/chat/stream` on the configured SparkFlow backend.
- **Context menu** "Ask SparkFlow about this page" on any page — captures the
  current text selection + page URL and opens the side panel prefilled.
- **Popup** with the current default model and quick actions (Open chat,
  Summarize page, Explain selection).
- **Options page** for backend URL, API token, and default model. Token is
  stored in `chrome.storage.local` and sent as `Authorization: Bearer …`.
- **Content script** exposes the active selection to the extension when
  requested.

## Project layout

```
apps/chrome-extension/
├── manifest.json              # MV3 manifest (side_panel, options_page, …)
├── package.json
├── tsconfig.json
├── vite.config.ts             # @crxjs/vite-plugin build
├── popup.html / sidepanel.html / options.html
└── src/
    ├── background.ts          # service worker: context menu + side panel
    ├── content.ts             # content script: selection reader
    ├── lib/
    │   ├── backend.ts         # fetch wrapper + SSE chat stream
    │   └── messages.ts        # typed extension messages
    ├── popup/Popup.tsx
    ├── sidepanel/SidePanel.tsx
    ├── options/Options.tsx
    └── types/                 # narrow chrome/react shims (delete post-install)
```

## Build

From the monorepo root:

```bash
pnpm install
pnpm -C apps/chrome-extension build
```

Watch mode for development:

```bash
pnpm -C apps/chrome-extension dev
```

Type-check only:

```bash
pnpm -C apps/chrome-extension exec tsc --noEmit
```

The build output is written to `apps/chrome-extension/dist`.

## Load into Chrome

1. Run `pnpm -C apps/chrome-extension build` (or `dev`).
2. Open `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and pick `apps/chrome-extension/dist`.
5. Click the SparkFlow action, then **Settings** to open the options page.
6. Set the backend URL, paste your API token, and save.
7. Click the action again and choose **Open chat side panel**, or right-click
   any page and pick **Ask SparkFlow about this page**.

## Backend contract

- `POST /api/chat/stream` — SSE stream. Accepts
  `{ model, messages, context, stream: true }`. Emits `data: {"delta":"…"}`
  frames and a terminating `data: [DONE]`.
- `GET /api/health` — used by the options "Test connection" button.

Authentication is a bearer token from `chrome.storage.local` sent on every
request.

## Notes

- `src/types/chrome-shim.d.ts` and `src/types/react-shim.d.ts` are narrow
  stand-ins so `tsc --noEmit` passes before `pnpm install` populates
  `@types/chrome`, `@types/react`, and `@types/react-dom`. **Delete them after
  installing dependencies.**
- Icons under `public/icons/*.png` must be supplied before shipping; the
  manifest references 16/32/48/128px variants.

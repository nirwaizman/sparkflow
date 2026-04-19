# @sparkflow/desktop

SparkFlow's desktop companion — an Electron 33 tray app that gives you a
system-wide quick prompt (`Option+Space` / `Alt+Space`), drag-and-drop file
uploads, and sandboxed read/write access to a workspace folder.

## Requirements

- Node 20+
- pnpm 9+
- The SparkFlow web app running locally (defaults to `http://localhost:3000`),
  or any reachable deployment — configurable from **Preferences**.

## Run it

```bash
# from the repo root, after `pnpm install`
pnpm -C apps/desktop dev
```

Vite boots on port 5193, `vite-plugin-electron` compiles the main & preload
processes into `dist-electron/`, and Electron spawns automatically. The window
is hidden by default — look for the SparkFlow icon in the menu bar / tray, or
press **Option+Space**.

## Package

```bash
pnpm -C apps/desktop build
```

Produces a distributable via `electron-builder` (macOS `.dmg`, Windows NSIS
installer, Linux AppImage — configured in `package.json`).

## Architecture

- `electron/main.ts` — tray, global shortcut, BrowserWindow management,
  IPC handlers (`prefs:*`, `fs:read`, `fs:writeSafe`).
- `electron/preload.ts` — `contextBridge` exposing `window.sparkflow`
  (`chat`, `fs`, `prefs`, `window`, `shell`).
- `src/App.tsx` — hash-router between `/quick` and `/preferences`.
- `src/components/QuickPrompt.tsx` — translucent center-screen prompt that
  streams `/api/chat/stream` and accepts drag-and-drop uploads to `/api/files`.
- `src/components/Preferences.tsx` — backend URL, API token, workspace folder,
  auto-launch toggle.

## Security notes

- `contextIsolation: true`, `nodeIntegration: false`.
- `fs:read` / `fs:writeSafe` refuse any path that escapes the user-selected
  workspace folder (validated with `path.relative`).
- Auto-launch is opt-out and stored via `app.setLoginItemSettings`.

## TODOs

- Replace the empty tray icon with a real 16x16 / 32x32 template image.
- Wire `electron-updater` into the **Check for Updates…** menu item.
- Swap the ad-hoc JSON prefs store for `electron-store` if we need migrations.
- Delete `src/types/electron-shim.d.ts` once `pnpm install` has populated
  `node_modules` (the shim only exists so `tsc --noEmit` passes pre-install).

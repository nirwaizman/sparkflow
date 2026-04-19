# @sparkflow/office

Microsoft Office task-pane add-in for SparkFlow. A single React app, built with
Vite, that runs inside **Word**, **Excel**, and **PowerPoint** and calls the
SparkFlow web backend for AI actions.

Feature parity target: Genspark Office integration.

## Layout

```
apps/office/
  manifest.xml          # Office add-in manifest (Word + Excel + PowerPoint)
  index.html            # Task-pane entry; loads office.js + React bundle
  vite.config.ts        # Vite dev server on https://localhost:5173
  tsconfig.json
  src/
    main.tsx            # React bootstrap
    TaskPane.tsx        # Host detection + backend URL config
    lib/backend.ts      # fetch() client, backend URL stored in localStorage
    word/WordPane.tsx
    excel/ExcelPane.tsx
    powerpoint/PptPane.tsx
```

## Actions

- **Word**: Draft, Continue writing, Rewrite selection, Summarize document
- **Excel**: Analyze selection, Generate formula, Chart suggestion, Fill down with AI
- **PowerPoint**: Design this slide, Add slide about..., Polish deck

All actions `POST` to `${backend}/api/<host>/<action>`. The backend URL
defaults to `http://localhost:3001` and is editable from the task pane
(persisted to `localStorage` under `sparkflow.backendUrl`).

## Dev / sideload

From the repo root:

```bash
pnpm install
pnpm -C apps/office dev
```

`office-addin-debugging start manifest.xml` will:

1. Install a local dev HTTPS cert (first run only).
2. Start the Vite dev server at `https://localhost:5173`.
3. Sideload the manifest into the host you pick (Word / Excel / PowerPoint)
   and open the task pane.

### Manual sideload

If automated sideloading fails:

- **Mac**: copy `manifest.xml` into
  `~/Library/Containers/com.microsoft.<host>/Data/Documents/wef/` and relaunch
  the host app. (`<host>` is `Word`, `Excel`, or `Powerpoint`.)
- **Windows**: share the folder containing `manifest.xml`, then add it under
  *File → Options → Trust Center → Trusted Add-in Catalogs*.
- **Office on the web**: *Insert → Add-ins → Upload My Add-in → Browse…* and
  select `manifest.xml`.

### Debugging

- Open the task-pane DevTools: right-click inside the pane and choose
  *Inspect* (desktop) or use `office-addin-debugging` output.
- Network calls to the backend appear in the DevTools Network tab — confirm
  the `Backend URL` field at the top of the pane points at a reachable
  `/api` route.
- Office API quirks: `Office.onReady` must resolve before any `Word.run` /
  `Excel.run` / `Office.context.document.*` call. `TaskPane.tsx` gates
  rendering on this.

## Typecheck

```bash
pnpm -C apps/office exec tsc --noEmit
```

## TODOs

- Each pane starts with `/// <reference types="office-js" />` so `tsc` can
  find the `Office` / `Word` / `Excel` globals before `@types/office-js` is
  installed. Once `pnpm install` has run and types resolve via
  `tsconfig.json#compilerOptions.types`, drop those reference directives.
- Replace `icon-16.png` / `icon-32.png` / `icon-64.png` / `icon-80.png`
  placeholders referenced by `manifest.xml` with real SparkFlow branding
  assets served from the dev/prod origin.
- Wire the backend `/api/word/*`, `/api/excel/*`, `/api/powerpoint/*` routes
  in `apps/web` — the client contract is defined inline in each pane.

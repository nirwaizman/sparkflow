# Assets

Place the production icon/splash artwork here before shipping:

- `icon.png` — 1024x1024, opaque square (App Store / Play Store icon).
- `splash.png` — 1242x2436 or larger, transparent background recommended.
- `adaptive-icon.png` — 1024x1024, Android adaptive icon foreground.
- `favicon.png` — 48x48, web favicon (optional).

`app.json` already points at `./assets/icon.png` and `./assets/splash.png`.
These are placeholders — Expo will log a warning if the files are missing but
`expo start` still works.

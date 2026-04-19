# @sparkflow/mobile

SparkFlow mobile client. Expo SDK 52, React Native 0.76, Expo Router, NativeWind.

Tabs: **Chat / Files / Tasks / Settings**. Dark theme by default, Hebrew/English
bidirectional text support everywhere.

## Setup

```bash
pnpm install                    # from the monorepo root
pnpm -C apps/mobile typecheck   # sanity
```

After `pnpm install`, **delete `src/types/expo-shim.d.ts`** — it is a temporary
placeholder so `tsc --noEmit` works before dependencies are installed. See the
TODO at the top of that file.

## Running in a simulator

Prerequisites (one-time):

- Xcode + iOS Simulator
- Android Studio + an Android emulator image
- `pnpm install` at the repo root

Then from this directory:

```bash
pnpm start        # Metro / Expo dev server with QR code
pnpm ios          # build + launch the iOS simulator
pnpm android      # build + launch the Android emulator
```

The Settings tab is where you point the app at your backend:

- **Backend URL** — e.g. `http://192.168.1.20:3000` for a dev laptop, or your
  hosted URL. iOS Simulator can use `http://localhost:3000`. Android emulator
  needs `http://10.0.2.2:3000`.
- **Auth token** — a bearer token, stored with `expo-secure-store` (Keychain on
  iOS, EncryptedSharedPreferences on Android).

The Chat tab streams from `POST {backend}/api/chat/stream` using the Vercel AI
SDK data-stream protocol; see `lib/chat-stream.ts`.

## TestFlight

High-level flow — run inside `apps/mobile`:

1. Install EAS CLI once: `pnpm add -g eas-cli` (or use `npx eas-cli`).
2. `eas login`
3. `eas build:configure` — generates `eas.json` the first time.
4. Ensure `app.json` has your real `ios.bundleIdentifier` and you have an
   Apple Developer account attached to the project (App Store Connect app
   record created ahead of time).
5. `eas build --platform ios --profile production`
   - EAS handles provisioning profiles + signing.
   - Output is an `.ipa`.
6. `eas submit --platform ios --latest`
   - Uploads the build to App Store Connect.
   - It appears under TestFlight -> Builds after Apple finishes processing
     (usually 10-30 minutes).
7. In App Store Connect, add internal testers (or a public link) under
   TestFlight. Testers install via the TestFlight app on iOS.

For OTA JS-only updates between binary builds use `eas update`.

## Project layout

```
app/
  _layout.tsx              Root stack + SafeAreaProvider + dark background
  index.tsx                Redirect -> /(tabs)/chat
  (tabs)/
    _layout.tsx            Tab bar config
    chat.tsx               Streaming chat against /api/chat/stream
    files.tsx              Pick + upload to /api/files
    tasks.tsx              List + enqueue /api/tasks
    settings.tsx           Backend URL + token (secure store)
lib/
  backend.ts               fetch() wrapper + config persistence
  chat-stream.ts           Data-stream protocol consumer
src/
  global.css               Tailwind entry
  types/expo-shim.d.ts     TEMPORARY - delete after pnpm install
```

## Styling

NativeWind 4 with a small palette defined in `tailwind.config.js`. Most screens
use RN StyleSheet objects inline (works before `pnpm install`); `className` is
available everywhere once NativeWind is resolved.

## Hebrew / English bidi

- All user-facing `TextInput` and `Text` components set
  `textAlign: "auto"` and `writingDirection: "auto"`, so Hebrew strings render
  RTL and English strings render LTR inside the same chat.
- The root layout calls `I18nManager.allowRTL(true)` so Hebrew-locale devices
  mirror the nav chrome naturally.

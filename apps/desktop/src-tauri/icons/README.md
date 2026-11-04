# App icons

Generated from the iOS app icon (`apps/ios/Sources/PostAnkiIOS/Assets.xcassets/AppIcon.appiconset/icon-1024.png`), inset on a transparent canvas with rounded corners to match macOS icon sizing.

Regenerate with `npx tauri icon <1024px png>` from `apps/desktop`, then delete the `android/`, `ios/`, `Square*` and `StoreLogo.png` outputs; the app ships only the files listed in `tauri.conf.json`.

`../icons-dev` holds the same icon with an orange DEV band. `src-tauri/tauri.dev.conf.json` applies it (plus the name "Post Anki Dev" and a `.dev` bundle id, so it runs beside the release app) through `npm run tauri:build:dev`. The release build uses only `icons/`.

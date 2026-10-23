# W1 1c: Mac app icon and accent colour

Done. Mac target only; iOS target and its settings untouched.

- New `Sources/PostAnkiMac/Assets.xcassets/` with `AppIcon.appiconset` (10 macOS PNG slots, resized with `sips -z` from a 1024 master drawn by a throwaway Swift script kept in the scratchpad: blue rounded tile, white card glyph) and `AccentColor.colorset` (light and dark values).
- `project.yml`, Mac target `settings.base`: `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`, `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor`. `xcodegen generate` run once.

## Checks
- `xcodebuild ... -scheme PostAnkiMac -derivedDataPath /tmp/dd-icon CODE_SIGNING_ALLOWED=NO build`: BUILD SUCCEEDED.
- Built app Resources contain `Assets.car` and `AppIcon.icns`; Info.plist has `CFBundleIconName = AppIcon`.
- iOS scheme not rebuilt (no iOS file or setting changed). Visual Dock/Finder check is manual.

## Defaults
- Accent: blue (light sRGB 0.25/0.38/0.95, dark lighter 0.38/0.51/1.0).
- Glyph: a flashcard with two text lines on a stacked card, flat style.
- Staged only the asset catalog and project.yml.

END-OF-REPORT

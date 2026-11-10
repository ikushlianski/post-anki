# Production apps always talk to the production server

User rule: "The only way Post Anki can look at a dev or localhost server is when it is not production." A production build must never use a saved, launch-argument or fallback server address other than production.

## Incident
- The installed Mac app (Release, now unsandboxed for self-update) read `apiBaseURL = http://127.0.0.1:5560` from `~/Library/Preferences/com.ikushlianski.postankimac.plist`. Debug runs (`apps/ios/scripts/run-mac.sh`, `run-mac-local.sh`) were always unsandboxed, share the bundle id, and wrote that file. The app could not launch against production.
- Server address resolution: `APIClient.baseURLString` / `resolveBaseURL(launchArgument:saved:fallback:)` in `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient.swift`; fallback from Info.plist `PostAnkiDevAPIURL` (set in `Sources/PostAnkiMac/Launch/MacLaunchCheck.swift` and `Sources/PostAnkiIOS/PostAnkiIOSApp.swift`); Settings edits it in `Sources/Shared/SettingsScreen.swift`; the Share extension reads the published copy (`shared-access.swift`).

## Target
- New build setting `POSTANKI_PRODUCTION` exposed as Info.plist key `PostAnkiProduction` on the Mac app, the iPhone app and their share extensions (follow how `PostAnkiDevAPIURL` is wired in `apps/ios/project.yml`).
  - Mac: YES for the Release configuration, NO for Debug.
  - iPhone: YES when `apps/ios/scripts/install-iphone.sh` runs `VARIANT=prod`, NO for `VARIANT=dev` and for Debug.
  - CI Mac build in `.github/workflows/release.yml` is Release, so it gets YES.
- When production: the resolved address is always `APIClient.productionBaseURLString`; saved, launch-argument and fallback values are ignored (not deleted). Publish that to the shared copy so the Share extension follows.
- Settings: in a production build, don't offer editing the server address (show it read-only or hide the field), following the existing Settings layout.
- Not production: behaviour unchanged.
- Tests (Swift Testing, existing PostAnkiAPI package tests or Mac smoke tests): production ignores saved localhost, launch argument and fallback; non-production keeps today's order.

## Constraints
- Stage only by explicit path, never commit. One xcodebuild at a time, `-derivedDataPath build-agent`. Run only touched tests (`swift test --filter ...` in the package if that's how its tests run, plus `apps/ios/scripts/run-mac.sh --test` once). Confirm the iOS target builds (`xcodebuild -scheme PostAnkiIOS -destination 'generic/platform=iOS' -derivedDataPath build-agent build CODE_SIGNING_ALLOWED=NO`).

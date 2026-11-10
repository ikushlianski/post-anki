# Mac self-update from GitHub Releases (no Sparkle, no signing keys)

Goal: the Mac app checks GitHub Releases hourly, offers "Update to vX", downloads the CI-built zip, replaces itself in place and relaunches.

## Evidence (facts read from the repo)
- Installed `~/Applications/Post Anki.app`: Apple Development, team HXJTYD6A7J, sandbox true, no app group, no keychain group, version 0.1.0 (1). Local.xcconfig sets only team + style, so POSTANKI_SHARING_SUFFIX is empty and Release uses `apps/ios/Config/PostAnkiMac.entitlements` (sandbox, network.client, user-selected.read-only). No restricted entitlements.
- `Config/PostAnkiMac.debug.entitlements` is already `app-sandbox=false`; the unsandboxed variant is proven to run.
- Token: `Packages/PostAnkiAPI/Sources/PostAnkiAPI/TokenStore.swift` uses a generic-password item with no access group when sharing is off, so it is a login-keychain item whose access list is tied to the creating app's signature (assumption: I could not read the keychain; a hook blocks it).
- Local data lives in the sandbox container (`~/Library/Containers/com.ikushlianski.postankimac`): UserDefaults (server address, zoom, shortcut, menu bar) and Application Support queues (`pending-decision-queue.swift`, `PendingAnswerQueue.swift`, `PendingGradeQueue.swift`).
- Runner: `macos-26` is arm64 with Xcode 26.6 (same as local); standard runners are free on public repos. Sources: https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/ , https://docs.github.com/en/billing/concepts/product-billing/github-actions

## Decisions (with why)
1. CI signs ad-hoc (`CODE_SIGN_IDENTITY=-`), uses the existing non-shared `PostAnkiMac.entitlements` variant. Ad-hoc plus restricted entitlements (app group, keychain-access-groups) would be rejected at launch; the non-shared variant has none, so it launches.
2. Drop the sandbox for the Mac Release entitlements (`app-sandbox` false). A sandboxed process cannot write `~/Applications`, and its children inherit the sandbox, so no helper script can swap the bundle. Sandboxed apps also get `com.apple.quarantine` on files they create (https://eclecticlight.co/2025/12/08/who-decides-to-quarantine-files/, key reference https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html), and an ad-hoc quarantined app is blocked by Gatekeeper on every update. Unsandboxed apps do not set quarantine unless they opt in, so URLSession + `ditto` produce a clean, launchable bundle.
3. In-place install by a detached `/bin/sh` script: wait for our PID to exit, move old bundle aside, `ditto` the new one in, `open` it, restore old on failure. If the bundle's parent folder is not writable, or the swap fails, fall back to revealing the new app in Finder with a plain message.
4. Versioning: tag `v0.1.N` (N = release workflow run number) is the single source. CI passes `MARKETING_VERSION=0.1.N CURRENT_PROJECT_VERSION=N` on the xcodebuild line (no repo commit). The app compares dotted-integer tuples of the tag against `CFBundleShortVersionString`.
5. The app lists `GET https://api.github.com/repos/ikushlianski/post-anki/releases?per_page=10` (not `/latest`, which can point at a release whose zip is not yet attached) and takes the first non-draft, non-prerelease with an asset matching `^PostAnkiMac-.*\.zip$`. Unauthenticated limit is 60/h per IP (https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api); hourly is 24/day.
6. The Mac asset is built only when `apps/ios/**` changed in the push, to avoid an update offer (and a keychain prompt) on every API-only deploy.
7. Install is always a user click ("Install and restart"); no silent installs.
8. Updater is off in DEBUG, under test hosts (`MacMenuBar.isHostingTests`), and when the bundle path contains `/Build/Products/`.

## Data consequences (blunt)
- Sandbox -> unsandboxed moves local data. UserDefaults and the offline queues do not follow; zoom, shortcut, menu-bar toggle, window frame, a saved server address and any unsent queued grades/drafts are lost once. Default: no migration code. Mitigation: before installing the first updater build, open the old app online so queues flush.
- Debug and Release share bundle id and, once unsandboxed, the same `~/Library/Preferences` plist, so a saved localhost address from a dev run now also applies to the installed app. Accepted.
- Dev-signed to ad-hoc: the keychain token's access list trusts the dev-signed app, not the ad-hoc one. Expect a keychain prompt after the first CI update; "Always Allow" records this build's cdhash, so every later update prompts again (https://github.com/coralogix/cx-cli/issues/285 shows the same pattern). A stable self-signed certificate would stop it but is a signing key, which was ruled out. If the user denies, the app reads no token and shows sign-in; re-sign-in may hit a duplicate item (to verify; step 9 handles it).
- Same-bundle-id, different-signature container access may show macOS's "access data from other apps" prompt; moot after unsandboxing because the new app does not use the container. To verify.

## Residual risks
- No signature check by decision: anyone who can publish to this repo's releases (or hijack the GitHub account) ships code that runs on the Mac after one click. Checks done are integrity/sanity only: size equals API size, bundle id, version strictly newer and equal to the tag, `codesign --verify --strict` (seal intact, not authenticity).
- macOS App Management protection may stop a spawned script from replacing the app bundle; fallback in decision 3 covers it. To verify.
- Each push touching `apps/ios` makes a release, so a prompt and re-auth per update remains the cost of "no keys".

## Steps: CI (`.github/workflows/release.yml`)
1. Move `concurrency` from workflow level to the `release` job so a long macOS job does not block or replace queued tag jobs. Give the new job `concurrency: {group: release-mac, cancel-in-progress: false}`.
2. In `release` job add output `tag` and `ios_changed` (`git diff --name-only ${{ github.event.before }} ${{ github.sha }} -- apps/ios` non-empty; checkout with `fetch-depth: 0`; treat an all-zero `before` as changed).
3. New job `mac-app`: `needs: release`, `if: needs.release.outputs.ios_changed == 'true'`, `runs-on: macos-26`, `timeout-minutes: 30`. Steps: checkout; `brew install xcodegen` (skip if present); `cd apps/ios && xcodegen generate`; `xcodebuild build -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -configuration Release -destination 'platform=macOS' -derivedDataPath build CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= MARKETING_VERSION=0.1.N CURRENT_PROJECT_VERSION=N`.
4. Sanity step: PlistBuddy prints version and bundle id and fails if the version is not `0.1.N`; `codesign -dv` and `codesign --verify --deep --strict` the app.
5. `ditto -c -k --keepParent build/Build/Products/Release/PostAnkiMac.app PostAnkiMac-N.zip`; `gh release upload "$tag" PostAnkiMac-N.zip` (job already has `contents: write`, `GH_TOKEN: ${{ github.token }}`).

## Steps: app (`apps/ios`)
6. `Config/PostAnkiMac.entitlements`: set `com.apple.security.app-sandbox` false (keep network client). Leave the `.shared` variant and the Share extension untouched. Update the README line "It is sandboxed with outgoing network access only" and add an "Updates" section.
7. New folder `Sources/PostAnkiMac/Update/` (Mac-only, per the Mac registry pattern; XcodeGen globs it): `mac-update-version.swift` (parse `vX.Y.Z`, compare tuples), `mac-update-release.swift` (Codable GitHub release, newest eligible release with matching asset), `mac-update-bundle-check.swift` (pure check of an Info.plist dictionary against current version, expected tag, bundle id), `mac-update-install-script.swift` (renders the shell script, safely quoting paths such as `Post Anki.app`), `mac-update-installer.swift` (URLSession download to a temp dir, size check, `ditto -x -k`, bundle check, `codesign --verify`, write script, launch detached, flush queues via `PendingQueueFlusher.flushAll()` with a short timeout, terminate), `mac-update-checker.swift` (`@MainActor @Observable`; state idle/checking/available(release)/downloading/failed(message); `start()` runs a check at launch then a `Task.sleep(for: .seconds(3600))` loop; also checks on `didBecomeActive` if the last check is over an hour old; User-Agent and `Accept: application/vnd.github+json` headers; network errors are silent for the timer and shown only for manual checks).
8. UI: `mac-update-banner.swift` (non-blocking top inset in `MacRootView.swift`: "Post Anki 0.1.N is available" with Install and Later; Later hides it for that version until next launch); `mac-update-settings-section.swift` added to `MacGeneralSettingsPane` in `Settings/MacSettingsView.swift` (current version via `BuildInfo.versionText`, "Check for updates" button, status line, Install button); `MacCommands.swift` gets "Check for Updates..." after the About item. Start the checker from `PostAnkiMacApp.init()` next to `MacQueueFlushTrigger.shared.start()`.
9. `TokenStore.writeItem`: when update fails with `errSecAuthFailed`/`errSecInteractionNotAllowed`, delete the item then add (only if manual check shows the duplicate-item case; otherwise skip this step).
10. `.claude/skills/release-postanki/SKILL.md` step 5: add the same `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` stamp from the latest `gh release list --limit 1` tag, so a locally installed build does not offer a downgrade-to-CI update. Add a line that the Mac app otherwise updates itself from the release.

## Tests (Swift Testing, `apps/ios/Tests/PostAnkiMacRegistryTests/`, `@testable import PostAnkiMac`, `should...` names)
- `mac-update-version-tests.swift`: `v0.1.9` < `v0.1.10` (numeric, not string order), equal not newer, malformed tags (`latest`, `v1`, `v0.1.x`) rejected, tag vs `0.1.0` marketing version.
- `mac-update-release-tests.swift`: parse a trimmed real GitHub JSON fixture; skip drafts and prereleases; skip a newer release with no matching zip and pick the older one that has it; ignore non-matching asset names; empty list gives no update.
- `mac-update-bundle-check-tests.swift`: reject wrong bundle id, version not newer, version not equal to tag, missing keys; accept the good case.
- `mac-update-install-script-tests.swift`: paths with spaces and quotes stay single-argument; script waits for the PID and restores the old bundle on failure.
- Not unit-tested (manual): URLSession download, `ditto`, relaunch, Gatekeeper, keychain.
- Run only touched files: `xcodebuild test -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -destination 'platform=macOS' -only-testing:PostAnkiMacRegistryTests CODE_SIGNING_ALLOWED=NO` (one at a time).

## Manual check
1. Push to main touching `apps/ios`; confirm the workflow adds `PostAnkiMac-N.zip` to `vN`; download it with `gh release download` (no quarantine) and run `xattr` + `codesign -dv` + `spctl -a -vv` for the record.
2. Install the first updater build locally (release-postanki step 5, after queues are empty), then publish a newer release.
3. In the app: Settings -> Check for updates shows the newer version; Install; app quits and the new version opens; `BuildInfo.versionText` matches; no Gatekeeper dialog; note keychain and App Management prompts and whether sign-in survives.
4. Repeat a second update to confirm the keychain prompt count; test Later, offline, and an unwritable install folder (fallback shows the new app in Finder).

## Defaults chosen
- Unsandboxed Release: only way to swap own bundle and avoid quarantine without keys.
- No data migration from the old container: small local state, server holds the real data; costs less than reading another container.
- Compare release tag to marketing version, not build number: tag is the source of truth.
- Mac build only when `apps/ios` changed: fewer update offers and keychain prompts.
- Per-user click to install: no silent code execution from the network.
- No SHA file or minisign: no key by decision, and a hash from the same release adds no authenticity.

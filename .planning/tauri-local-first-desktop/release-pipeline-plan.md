---
type: spec
branch: learn-from-doc-site
task: release-pipeline-and-updater (Tauri Mac app)
complexity: complex
state: draft
updated: 2026-10-29
---
# Spec: Mac desktop release pipeline and in-app Update

State is `draft` on purpose: the new dependencies below need the owner's approval, and the Apple and secret setup must exist before anything can be built.

### Summary
Pushing a tag such as `desktop-v0.1.1` makes GitHub build the Mac app, sign it with the owner's Developer ID, have Apple notarize it, and publish it with a signed update file on GitHub Releases, at no cost beyond Apple's $99/year. The installed app quietly checks that file when it starts. When a newer signed version exists, an "Update to X.Y.Z" menu appears in the Mac menu bar. Clicking it downloads, checks and installs the new version, then restarts the app. Sign-in and other saved data are kept, because they live outside the app bundle and the app identifier never changes.

### The ask
> Goal: Pushing a version tag produces a signed, notarized Mac build on a free release page, and the running app tells me a newer version exists and updates itself when I click Update.
> Criteria: A tagged release builds, signs and notarizes the Mac app in CI with no manual step. The release publishes the app and the update manifest to free hosting. The app shows an Update button only when a newer signed version exists, and installing it keeps local data. No signing key or Apple credential is stored in the repo; they live only in CI secrets.
(`.planning/tauri-local-first-desktop/todo.md:9-16`)

### Facts the plan rests on
- Fact: repo `ikushlianski/post-anki` is PUBLIC (`gh repo view --json visibility`, run 2026-10-29). Default branch is `ikushlianski/admin-settings-for-post-anki` (`gh api repos/ikushlianski/post-anki`).
- Fact: `.github/workflows/release.yml:5-30` runs on every push to `main` and creates a GitHub release tagged `v0.1.<run_number>`. It is branch-triggered, not tag-triggered. No other workflow uses tags. No releases or remote tags exist today (`gh release list` returned `[]`; `git ls-remote --tags origin` empty).
- Fact: tauri-action warns that if `latest.json` points at `releases/latest/download/...`, it "can cause issues if your repo contains releases that do not include updater bundles" (https://github.com/tauri-apps/tauri-action README, "Tips"). The `v0.1.N` releases from `release.yml` are exactly such releases, so the docs' default endpoint `releases/latest/download/latest.json` (https://v2.tauri.app/plugin/updater/) must not be used here.
- Fact: today the desktop window loads a bundled loader page and then navigates to the remote site `https://postanki.ilya.online` (`apps/desktop/src-tauri/frontend-dist/app.js:16-45`). The only capability grants `core:default` with no `remote.urls` (`apps/desktop/src-tauri/capabilities/default.json:1-6`), so the remote page has no native bridge (`apps/desktop/CLAUDE.md:27`). A button inside the web page cannot call the updater.
- Fact: the updater plugin needs Rust 1.90 or newer (https://v2.tauri.app/plugin/updater/, "Supported Platforms"). `apps/desktop/src-tauri/Cargo.toml:7` declares `rust-version = "1.77.2"`.
- Fact: the updater can be driven entirely from Rust (`app.updater()?.check()`, `download_and_install`, then `app.restart()`), and updates are verified against the public key before installation, which cannot be disabled (https://v2.tauri.app/plugin/updater/, "Signing updates" and "Checking for Updates").
- Fact: by default the updater only accepts a version greater than the current one (same page, "Allowing downgrades").
- Fact: latest `tauri-plugin-updater` is 2.14.1 (crates.io API, updated 2026-10-28). Tauri core in the lockfile is 2.11.6 (`apps/desktop/src-tauri/Cargo.lock:3059-3060`). Latest tauri-action release is `action-v1.0.0`, 2026-06-29 (GitHub API).
- Fact: this Mac is Apple Silicon (`uname -m` = `arm64`).
- Fact: GitHub environments can restrict which tags may deploy to them ("Selected branches and tags", Ref type Tag) (https://docs.github.com/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment, https://github.blog/changelog/2023-10-06-actions-secure-deployment-rollouts-to-protected-environments-based-on-select-tag-patterns/).
- Signing, notarization, price and hosting facts are in `.planning/.runs/2026-10-28/tauri-investigation/signing-report.md` and are not repeated here.

### Tag naming
- Tag format `desktop-v<semver>`, e.g. `desktop-v0.1.1`. Workflow trigger: `push: tags: ['desktop-v*']`.
- Fact: Tauri's own example uses a prefixed tag `app-v__VERSION__` (tauri-action README). Assumption: the `desktop-` prefix keeps these tags apart from `release.yml`'s `v0.1.N` tags and from any future iOS tags, and makes the environment tag rule (`desktop-v*`) precise.
- One more fixed tag, `desktop-updater`, holds the live update manifest (see "Manifest hosting"). It does not match `desktop-v*`, so it never triggers a build.
- The version in the tag must equal the version in `tauri.conf.json`, `src-tauri/Cargo.toml` and `apps/desktop/package.json`; the workflow fails otherwise.

### Workflow stages (`.github/workflows/desktop-release.yml`)
One job on `macos-latest` (Apple Silicon), `environment: desktop-release`, `permissions: contents: write`, `concurrency: { group: desktop-release, cancel-in-progress: false }`, same style as `deploy.yml` (checkout@v4, setup-node@v4 with Node 22 and npm cache, `npm ci`).

1. Guard: tag version equals all three version fields; tag matches `desktop-v<semver>`. Fail fast otherwise.
2. Toolchain: `rustup update stable` and `rustup target add aarch64-apple-darwin` (preinstalled rustup, no extra action). Node 22, `npm ci`.
3. Write the App Store Connect key from secret to `$RUNNER_TEMP/AuthKey.p8` and export `APPLE_API_KEY_PATH`. The file is deleted in an `if: always()` final step.
4. Check the signing identity variable begins with `Developer ID Application:` (this replaces the docs' `grep "Apple Development"` step, which picks the wrong certificate type).
5. Build, sign, notarize, staple and upload with `tauri-apps/tauri-action` (v1, pinned to a full commit SHA because this job holds signing keys): `projectPath: apps/desktop`, `args: --target aarch64-apple-darwin`, `tagName: desktop-v__VERSION__`, `releaseName: Post Anki Desktop v__VERSION__`, `releaseDraft: true`, `uploadUpdaterJson: true`. Env: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `GITHUB_TOKEN`.
   - Assumption: when `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` are set, Tauri's bundler imports the certificate into a temporary keychain itself (the macOS signing page tells you to set exactly those two variables for CI). To verify on the first run; fallback is the docs' keychain-import step with the grep corrected to `Developer ID Application`.
6. Verify on the runner, before anything is public: `codesign --verify --deep --strict` on the `.app`; `spctl -a -vv` reports a notarized Developer ID source; `xcrun stapler validate` on the `.app` and on the `.app` extracted from the update `.tar.gz`; the draft's `latest.json` (fetched with `gh`) has `version` equal to the tag, a `darwin-aarch64` entry whose URL points at this tag (not `releases/latest`), and a non-empty signature. A small repo script does the manifest checks.
7. Publish: `gh release edit <tag> --draft=false --latest=false` so the desktop release never takes the "Latest" badge from `release.yml`'s stream.
8. Go live: create `desktop-updater` once if missing (prerelease, not latest), refuse if its current manifest version is newer than or equal to this one, then upload this `latest.json` to it with `--clobber`. This is the only step that makes installed apps see the update, so it runs last.
9. Smoke check: unauthenticated `curl` of the public manifest URL and of the update bundle URL inside it both return 200.

Fact: standard GitHub-hosted runners are free for public repos (signing-report.md section c). Assumption: one macOS build plus notarization takes roughly 10 to 20 minutes; no cost on a public repo.

### CI secrets and variables (names only)
GitHub environment `desktop-release`, deployment rule: tags matching `desktop-v*` only. Secret names use the `DESKTOP_` prefix, following `deploy.yml`'s `PROD_` prefix convention, and are mapped to the exact env names Tauri reads.

| Name | Kind | Maps to env | What it holds |
|---|---|---|---|
| `DESKTOP_APPLE_CERTIFICATE` | secret | `APPLE_CERTIFICATE` | base64 of the exported Developer ID Application `.p12` |
| `DESKTOP_APPLE_CERTIFICATE_PASSWORD` | secret | `APPLE_CERTIFICATE_PASSWORD` | `.p12` export password |
| `DESKTOP_APPLE_SIGNING_IDENTITY` | variable | `APPLE_SIGNING_IDENTITY` | `Developer ID Application: <Name> (<TEAMID>)`; not secret |
| `DESKTOP_APPLE_API_ISSUER` | secret | `APPLE_API_ISSUER` | App Store Connect issuer ID |
| `DESKTOP_APPLE_API_KEY` | secret | `APPLE_API_KEY` | App Store Connect key ID |
| `DESKTOP_APPLE_API_PRIVATE_KEY` | secret | written to a file, path in `APPLE_API_KEY_PATH` | contents of the `.p8` |
| `DESKTOP_TAURI_SIGNING_PRIVATE_KEY` | secret | `TAURI_SIGNING_PRIVATE_KEY` | updater private key contents |
| `DESKTOP_TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secret | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | updater key password |

Fallback if the owner prefers Apple ID over an API key: `DESKTOP_APPLE_ID`, `DESKTOP_APPLE_PASSWORD` (app-specific password) and `DESKTOP_APPLE_TEAM_ID` replace the three `APPLE_API_*` rows (Fact: both credential sets are listed on https://v2.tauri.app/distribute/sign/macos/, "Notarization"; the Apple ID set needs `APPLE_TEAM_ID`, which Tauri's CI example omits).

### Updater key handling
- The owner generates the key pair on this Mac with `npx tauri signer generate -w ~/.tauri/post-anki-desktop.key`, with a password. The private key and password go into the password manager plus one offline backup, then into the two secrets above. Nothing is written inside the repo.
- The public key is not secret and is committed in `tauri.conf.json` under `plugins.updater.pubkey` (Fact: "This public key can be uploaded and shared safely", updater page).
- Losing the private key means installed apps can never update again; they would need a manual reinstall (Fact, updater page). Rotation is possible later by setting a new public key at runtime (Fact, updater page "Public key"), but not planned.
- `.gitignore` gets guard patterns for `*.p12`, `*.p8`, `*.key` and `*.key.pub` under `apps/desktop`, so a stray copy cannot be committed by accident.

### Manifest hosting
- Updater endpoint (single entry): `https://github.com/ikushlianski/post-anki/releases/download/desktop-updater/latest.json`.
- Each version's assets (`.dmg`, `.app.tar.gz`, `.app.tar.gz.sig`, its own `latest.json`) live on its `desktop-v<version>` release; the rolling `desktop-updater` release holds only the current `latest.json`, whose URL points at the versioned release.
- Why not `releases/latest/download/latest.json`: see the tauri-action warning in Facts. Why not GitHub Pages or S3: they add a second publishing target and setup for no gain at one-person scale.
- Fact: GitHub Releases has no bandwidth or total-size limit and a 2 GiB per-file cap (signing-report.md section c). Fact: assets are public only while the repo is public (same report). If the repo goes private, the endpoint returns 404 and the app simply sees "no update" (see Risks).

### Where the Update button lives
- In the macOS menu bar, as its own top-level menu titled "Update to X.Y.Z" with one item, "Install and Restart". It appears only after a successful check finds a newer signed version and is absent otherwise.
- Why the menu bar: the window shows the remote website, which has no native bridge by design. The menu is native, so the updater stays entirely in Rust, the webview gets no updater permission, and the capability file does not change. Assumption: this matches the security rule "keep sign-in, HTTP, SQLite and sync in Rust" (`apps/desktop/CLAUDE.md:30`).
- States of that menu: "Install and Restart" (ready), "Downloading update..." (disabled, during download), "Update failed, try again" (clickable, after a download or install error). After a successful install the app restarts itself.
- Assumption (to verify): the custom menu is built from Tauri's default macOS menu plus the extra submenu, so the standard Edit menu (copy, paste) and Quit keep working. Replacing the whole menu would break copy and paste in the webview on macOS.
- When the local single-page UI from the local-first plan lands, a React banner can call two Rust commands over the same update state. Not part of this ticket.

### How data survives updates
- The updater replaces only the `.app` bundle (Fact: macOS update artifact is a `.tar.gz` of the app bundle, updater page "Building").
- Assumption: everything the app stores lives outside the bundle, in folders keyed by the bundle identifier (`~/Library/Application Support/online.ilya.postanki.desktop`, `~/Library/WebKit/online.ilya.postanki.desktop` and similar), so it survives a bundle swap. Today that is the web session cookies and site storage of the remote page; later the PowerSync SQLite file and Keychain token.
- Rule: the identifier `online.ilya.postanki.desktop` (`apps/desktop/src-tauri/tauri.conf.json:5`) and `productName` never change. Changing either would orphan saved data.
- Assumption: Keychain items saved later through `keyring` keep working across updates without prompts because every version is signed by the same Developer ID team. Not verifiable until the token-storage work exists.
- Verified manually on the second release (see Scenario 3).

### Exact new dependencies for owner approval
| Where | Dependency | Version | Why | Cost |
|---|---|---|---|---|
| Rust (`src-tauri/Cargo.toml`, macOS/desktop target only) | `tauri-plugin-updater` | 2.14.1 (current on crates.io) | check, verify, download, install | free, official |
| GitHub Actions | `tauri-apps/tauri-action` | v1 (`action-v1.0.0`), pinned to commit SHA | build, sign, notarize, upload, generate `latest.json` | free, official |
| Rust toolchain | minimum Rust raised to 1.90 | n/a | required by the updater plugin | free |

Not added: `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` (no JavaScript side; restart is `app.restart()` in Rust core), `tauri-plugin-dialog` (the menu is the button), any Rust cache action (minutes are free on a public repo).

### Scenarios

SCENARIO 1: Tag push ships a signed, notarized release — asked
The owner bumps the version and pushes `desktop-v0.1.1`; GitHub produces a public release with a downloadable app that opens on a Mac without any warning.
What to verify:
- The release page shows a disk image and an update bundle for 0.1.1 and the run had no manual step.
- The downloaded app opens with no "unidentified developer" or "damaged" warning.
- A tag whose version differs from the app's version fails before building.
- The main-branch `v0.1.N` releases keep their "Latest" badge.
Manual verification (real environment):
- [ ] Download the disk image in a browser, install, open; Gatekeeper allows it.

SCENARIO 2: The app offers an update only when a newer signed one exists — asked
On start the app checks the update file; the "Update to X.Y.Z" menu appears only if that version is newer and correctly signed.
What to verify:
- Same version or older: no Update menu.
- Newer version: the menu appears with the right version number.
- Offline, missing file or broken file: no menu, the app works normally.
- A file signed with a different key is rejected and nothing is installed.

SCENARIO 3: Clicking Update installs, restarts and keeps data — asked
The owner clicks "Install and Restart"; the app downloads, installs, restarts on the new version and is still signed in.
What to verify:
- The menu shows a downloading state, then the app restarts on the new version.
- The web session (signed in) and window still work after the restart.
- A failed download shows "Update failed, try again" and the old version keeps running.
Manual verification (real environment):
- [ ] Install 0.1.1 from its disk image, sign in, release 0.1.2, update from the menu, confirm still signed in.

SCENARIO 4: No key or Apple credential ever sits in the repo — asked
Signing material lives only in the GitHub environment and is usable only by `desktop-v*` tag runs.
What to verify:
- A search of the repo finds no private key, certificate or password.
- A run on any other branch or tag cannot read the environment's secrets.
- The temporary Apple key file is removed at the end of every run, including failed ones.

SCENARIO 5: A broken release never reaches installed apps — added (kept: Scenario 2 cannot be trusted without it)
If signing, notarization or the manifest check fails, the live update file is not touched.
What to verify:
- A failure at any step before "go live" leaves the live update file on the previous version.
- Re-running an older tag cannot move the live update file backwards.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| Update menu state (Rust, pure) | check outcome (none, newer version, error), install progress events | menu shown or hidden, its title, item label and enabled flag | SCENARIO 2, SCENARIO 3 |
| Release version guard (repo script, pure) | tag name, three version fields | ok or a named mismatch | SCENARIO 1 |
| Manifest check (repo script, pure) | new `latest.json`, tag, current live `latest.json` | ok, or why it must not go live (wrong version, URL not on this tag, empty signature, not newer) | SCENARIO 1, SCENARIO 5 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | None | None | `.github/workflows/desktop-release.yml`; `scripts/desktop-release/` guard; `apps/desktop/src-tauri/tauri.conf.json` bundle and version; `Cargo.toml` and `package.json` versions |
| SCENARIO 2 | `apps/desktop/src-tauri/src/updates/` check and menu state; `main.rs` registers plugin and starts the check | None (menu is native) | `tauri.conf.json` `plugins.updater` |
| SCENARIO 3 | `apps/desktop/src-tauri/src/updates/` install and restart | None | None |
| SCENARIO 4 | None | None | `desktop-release.yml` environment and cleanup; `.gitignore` guards |
| SCENARIO 5 | None | None | `desktop-release.yml` stage order; `scripts/desktop-release/` manifest check |

### Files to create
```
.github/workflows/desktop-release.yml          tag-triggered Mac build, sign, notarize, verify, publish, go live
scripts/desktop-release/
  check-desktop-release.mjs                    version guard and manifest check (CLI over two pure functions)
  check-desktop-release.test.mjs               vitest, co-located
apps/desktop/src-tauri/src/updates/
  mod.rs                                       wires the module
  update_state.rs                              pure menu-state deriver with Rust unit tests (Rust needs snake_case module files)
  update_menu.rs                               builds default menu plus Update submenu, handles the click
  update_check.rs                              start-up check, download, install, restart
```

### Files to modify
```
apps/desktop/src-tauri/tauri.conf.json   add bundle.createUpdaterArtifacts=true, macOS targets app+dmg, plugins.updater (pubkey, one endpoint), version; identifier and productName must not change
  used by: tauri build/dev; tests: none
apps/desktop/src-tauri/Cargo.toml        add tauri-plugin-updater for desktop targets, rust-version 1.90, version
  used by: cargo; tests: none
apps/desktop/src-tauri/src/main.rs       register updater plugin, start the update module in setup; no networking of its own beyond that
  used by: binary entry; tests: none
apps/desktop/package.json                version kept equal to tauri.conf.json
  used by: root workspaces (package.json:16,30-31); tests: frontend-dist/probe.test.js unaffected
apps/desktop/src-tauri/capabilities/default.json   no change (explicitly no updater permission)
.gitignore                               guard patterns for key and certificate files under apps/desktop
apps/desktop/CLAUDE.md                   "Signing and release" and "Updater" sections describe the real pipeline, endpoint and secrets
docs/architecture/tauri-desktop-app.md   "New infrastructure" and "Rollout" describe the release workflow and updater
```

### Risk & rollout
- Installed apps trust one updater key forever; losing it forces every install to be replaced by hand. Backup is an owner step.
- If the repo turns private, update checks silently find nothing. Mitigation if that day comes: publish desktop releases to a separate public releases-only repo through tauri-action's `owner`/`repo` inputs (Fact: inputs exist, tauri-action README); untested.
- Nothing can run until the owner enrolls with Apple and creates the environment and secrets; the workflow fails at step 4 or 5 without them, harmlessly.
- Rollback: delete the bad version's release and re-upload the previous `latest.json` to `desktop-updater`; installed apps that already updated stay on the bad version until a newer fix ships (the updater refuses downgrades by default).

### Decisions made autonomously
- Tag `desktop-v<semver>` — avoids `release.yml`'s `v0.1.N` and follows Tauri's prefixed example.
- Rolling `desktop-updater` release as the endpoint — `releases/latest` is owned by `release.yml`'s stream; leaves that workflow untouched.
- Desktop releases published with "not latest" — keeps the main-branch release stream's badge.
- Apple Silicon only — owner's Mac is arm64; halves build time; an Intel entry can be added later.
- App Store Connect API key over Apple ID — revocable, scoped to Developer access, not tied to the personal Apple ID password; Apple ID set documented as fallback.
- Update logic and button in Rust plus the native menu — the remote page has no bridge and must not get one.
- Check once at start only — that is what the task asks; a "Check for Updates" item is cut.
- GitHub environment with a tag rule and `DESKTOP_` secret prefix — follows `deploy.yml`'s `environment: prod` and `PROD_` convention and limits secrets to release tags.
- tauri-action pinned to a commit SHA while other actions use version tags — this job holds signing keys.
- `.dmg` for first install, `.app.tar.gz` for updates — the default Tauri macOS outputs.

### Implementation order
1. Release version guard and manifest check — red-green-refactor, covers SCENARIO 1, SCENARIO 5.
2. Update menu state deriver with unit tests — covers SCENARIO 2, SCENARIO 3.
3. Updater plugin, start-up check, menu wiring, install and restart (after dependency approval) — SCENARIO 2, SCENARIO 3.
4. Config: updater artifacts, public key, endpoint, Rust 1.90, version sync, `.gitignore` guards — SCENARIO 1, SCENARIO 4.
5. Workflow file — SCENARIO 1, SCENARIO 4, SCENARIO 5.
6. Docs updates in `apps/desktop/CLAUDE.md` and the architecture doc.
7. Owner runs the first two releases and the manual checks.

### What the owner must do by hand
1. Enroll in the Apple Developer Program as an individual ($99/year).
2. In Keychain Access create a certificate signing request; in Certificates, IDs & Profiles create a "Developer ID Application" certificate; install it; export it with its key as `.p12` with a strong password; base64 it (`openssl base64 -A -in cert.p12 -out cert-base64.txt`). Note the identity string from `security find-identity -v -p codesigning`.
3. In App Store Connect, Users and Access, Integrations, create a team API key with Developer access; download the `.p8` (one chance only); note the Key ID and Issuer ID.
4. Run `npx tauri signer generate -w ~/.tauri/post-anki-desktop.key` with a password; store private key and password in the password manager plus one offline copy; hand over the public key text for `tauri.conf.json`.
5. In the GitHub repo settings create environment `desktop-release`, set deployment rule to tags `desktop-v*`, add the seven secrets and one variable from the table. Delete local `.p12`, `.p8` and base64 copies afterwards.
6. Approve the three dependency rows above.
7. Keep the repo public, or accept the private-repo risk above.
8. Release: bump the version in the three files, commit, push the commit and the `desktop-v<version>` tag (agents never push). Install the first release from its disk image into Applications; release once more to test the Update menu.

### Scope boundary
- Cut: "Check for Updates" menu item and periodic background checks (ask says on start).
- Cut: native confirmation dialog on start (would need `tauri-plugin-dialog`).
- Cut: React Update banner inside the future local UI.
- Cut: Intel and universal builds, Windows, Linux.
- Cut: release notes text in the update file beyond what tauri-action generates.
- Cut: changes to `release.yml`.
- Out of scope per ticket: the local-first data layer.

### Consistency gate (inline)
Deriver to scenario, scenario to files, tag to scope boundary, summary and risk checks: PASS. Not promoted to `confirmed` because dependency approval and owner setup are outstanding.

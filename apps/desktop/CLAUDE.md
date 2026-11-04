# Tauri desktop app (apps/desktop)

Rules for any AI working in this folder. Tauri v2. Rust is the native core; the UI is the React web app in a system webview.

## Cost rule

The whole stack stays free at one-person scale. Propose before adding any paid service, plan or dependency.

| Part | Cost | Source |
|---|---|---|
| Tauri, Tauri plugins | Free, open source | n/a |
| PowerSync Open Edition (self-hosted) | Free, source-available; all SDKs, Sync Streams, config-file setup; no web dashboard, no email support | https://www.powersync.com/pricing |
| PowerSync Cloud Free | $0: 2 GB synced/month, 500 MB hosted, 50 peak clients, 2 instances. Deactivated after inactivity (page says 1 week in one place, 2 weeks in another) | https://www.powersync.com/pricing |
| PowerSync Cloud Pro | From $49/month; not allowed without approval | https://www.powersync.com/pricing |
| Updater hosting | Static `latest.json` on S3 or GitHub Releases. The updater page states no price | https://v2.tauri.app/plugin/updater/ |
| Apple Developer Program | $99/year, confirmed on Apple's pages. No Apple page states a separate notarization or certificate fee ("no extra fee" is an inference from Apple's membership table). Required for Developer ID signing and notarization | https://developer.apple.com/programs/ |
| Update hosting | GitHub Releases: no stated bandwidth limit, 2 GiB per file. Works while the repo is public; a private repo may need an auth workaround (untested) | signing-report.md |
| PowerSync production hosting | Cloud Run in the owned `post-anki` project at min 0 is free only if it sleeps most of the month (about 50 connected hours); always-on is about $44/month (estimate); Cloud Free deactivates when idle | powersync-report.md |

PowerSync Cloud Free deactivates idle projects, which suits an app used daily but not a rarely opened one. Prefer self-hosted Open Edition for production.

## Security rules

- CSP is off unless `app.security.csp` is set in `src-tauri/tauri.conf.json`. It is currently `null`; set a restrictive policy before shipping. Allow only hosts we own; no CDN scripts. Add `'wasm-unsafe-eval'` to `script-src` only if WebAssembly is used. Tauri adds hashes and nonces for bundled scripts and styles at build time. Source: https://v2.tauri.app/security/csp/
- Capabilities live in `src-tauri/capabilities/*.json`. Security boundaries follow window labels, not titles. A window listed in several capabilities gets the merged permissions. Source: https://v2.tauri.app/security/capabilities/
- Every command registered through `invoke_handler` is open to all windows by default. Restrict commands with `AppManifest::commands` in `build.rs`.
- Remote content gets no native access unless a capability sets `remote.urls`. Grant none. Keep scopes minimal.
- Capabilities do not protect against insecure Rust code, wrong scope checks in commands, webview zero-days or supply-chain attacks. Validate every command input in Rust.
- The API token is never baked into the binary, written to localStorage or kept in a `.env` file shipped with the app. Hold it in the macOS Keychain through a small Rust command using the `keyring` crate (v4.2.0, maintained, free; needs no Apple membership). Do not use Stronghold: a Tauri maintainer's notice (plugins-workspace issue #3494) says it will not exist in Tauri v3.
- Keep sign-in, HTTP, SQLite and sync in Rust so the token never reaches the webview. Then the webview needs only `connect-src ipc: http://ipc.localhost`, no http-plugin scope, no `remote.urls`, and a capability listing only our own commands. Dropping `core:default` is untested. Drafts: `.planning/.runs/2026-10-28/tauri-investigation/security-report.md`.
- Webview-side API calls send `Origin: tauri://localhost`, which the API's CORS list rejects (403), and a browser `fetch` cannot read the `set-auth-token` header. Calling from Rust avoids both.

## Updater

- Updates must be signed; this cannot be disabled. The public key goes in `tauri.conf.json`; the private key signs artifacts and is never shared or committed. Losing it blocks updates for installed apps.
- Set `TAURI_SIGNING_PRIVATE_KEY` in the environment when building; `.env` files are ignored for it.
- The `signature` field holds the contents of the `.sig` file, not a path or URL.
- Every platform entry in `latest.json` must be complete, because the whole file is validated before the version check.
- Source: https://v2.tauri.app/plugin/updater/

## Local store (tested on this Mac, scratch apps, nothing synced)

- PowerSync's Tauri plugin (`@powersync/tauri-plugin` 0.0.6, crate `tauri-plugin-powersync` 0.1.1, alpha) keeps SQLite as a file in Rust and passed insert, read, `watch()` and persistence. Create the app data dir in Rust startup first, or the open fails with `CANTOPEN`. Its backend connector must be written in Rust.
- `@powersync/web` default IndexedDB backend failed in the macOS webview (CORS error from a shared worker on `tauri://localhost`). With an explicit OPFS backend (OPFSCoopSyncVFS or AccessHandlePoolVFS, multi-tab off) it passed.
- `tauri-plugin-sql` and `tauri-plugin-powersync` cannot share one Cargo graph (both link `sqlite3`). Pick one.
- Not tested: real sync, a signed `.app` plus auto-update keeping its data, Windows and Linux. Details: `.planning/.runs/2026-10-28/tauri-investigation/powersync-report.md`.

## Sharing the web UI

- Recommended: a second Vite build of `apps/web` as a single-page app (`spa: { enabled: true }`), with a build-time shim that runs each `createServerFn` handler in the browser against the API with a Bearer token. 262 server functions in 54 files; the web server's shared secret must never ship.
- Replace separately: the cookie middleware in `start.ts`, `/api/auth`, `/api/electric-shape` and the export route. The API's CORS list needs the Tauri origin unless calls go through Rust.
- Details and the grouping of the 262 functions: `.planning/.runs/2026-10-28/tauri-investigation/react-ui-report.md`.

## Signing and release

Developer ID signing, notarization and the signed updater use env vars from Tauri's macOS signing docs. Tauri's GitHub Actions example greps for "Apple Development" instead of "Developer ID Application" and omits `APPLE_TEAM_ID` and `TAURI_SIGNING_*`; do not copy it as is. Details: `.planning/.runs/2026-10-28/tauri-investigation/signing-report.md`.

## Styling and Storybook

- Tailwind v4 is the styling approach (`@tailwindcss/vite`, entry `src/tailwind.css`). New UI uses Tailwind classes, not inline `style` objects.
- Colors come from the CSS variables in `src/theme.css`. `src/tailwind.css` maps them to utilities (`bg-surface`, `text-muted`, `border-border`, `text-accent`, `bg-danger`). Do not add a second palette.
- Dark mode follows the system setting. `:root[data-theme="dark"]` or `"light"` forces it, which Storybook's toolbar uses.
- Stories live beside the component as `<name>.stories.tsx`. Titles: `Desktop/Pages/<Screen>` for whole screens, `Desktop/Components/<Piece>` for pieces.
- Per-story Tauri responses go in `parameters.tauriMocks`: `{ command: value }` or `{ command: (args) => value }`. Return `{ __error: reason }` to reject with `reason`. The decorator in `.storybook/preview.ts` installs them before render and clears them on unmount. Commands with no mock reject.
- Run Storybook with `npm run storybook` from `apps/desktop`. It serves on port `6007` by default; set `STORYBOOK_PORT` to change it. The dev-port registry has no Storybook role for this project. Static build: `npm run build-storybook`.
- Stories render with a mock `@tauri-apps/api/core` (`.storybook/stubs/tauri-core.ts`). Add canned responses there when a story needs a new command.

## Project rules

- Check `~/.claude/devports/` before allocating a port.
- Never push. Commit only your own files with explicit pathspecs.
- Do not add dependencies or delete the SwiftUI Mac target (`apps/ios`, `PostAnkiMac`) without proposing first.
- Run `npx tsc --noEmit` once when the task is complete.

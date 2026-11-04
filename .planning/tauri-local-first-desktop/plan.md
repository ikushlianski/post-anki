# Tauri local-first desktop: build proposal (awaiting approval)

Status: nothing below is installed. Dependencies need the owner's yes first.

## Shape
- Rust owns sign-in, token (macOS Keychain), HTTP to the prod API and PowerSync sync. The webview holds no token.
- Local store: PowerSync Tauri plugin (alpha). SQLite lives in Rust.
- UI: second single-page Vite build of `apps/web`, with a build-time shim for the server functions.
- Location: rework `apps/desktop` in place. The SwiftUI Mac target stays untouched.

## Proposed dependencies (all free)
| Where | Package | Why |
|---|---|---|
| Rust | `tauri-plugin-powersync` 0.1.1 | local SQLite plus sync, passed the spike |
| Rust | `keyring` 4.2.0 | token in the macOS Keychain |
| Rust | `reqwest` (rustls) | sign-in and API calls from Rust |
| JS | `@powersync/tauri-plugin` 0.0.6 | webview side of the plugin |
| JS | `@tauri-apps/api` | invoke Rust commands |

Not used: `tauri-plugin-sql` (clashes with the PowerSync plugin on `sqlite3`), Stronghold (dropped in Tauri v3).

## Build order
1. Throwaway proof in a scratch folder: sign in, Keychain, one subjects screen from the local database.
2. Strict CSP and a minimal capability file in `apps/desktop`.
3. SPA build of `apps/web` and the server-function shim, one feature area at a time.
4. API change: add the Tauri origin to the CORS list, only if any call is made from the webview.

## Open
- Notarization fee: no Apple page states one; only the $99/year membership is confirmed.
- Real sync to production is untested.

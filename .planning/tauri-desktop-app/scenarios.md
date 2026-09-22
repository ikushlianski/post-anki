---
type: scenarios
branch: tauri-desktop-app
task: Build a Tauri desktop app for Post Anki wrapping the same web app / reusing the same apps/api backend
state: confirmed
updated: 2026-07-17
---
# Scenarios: Tauri desktop app for Post Anki

## Business Scenarios

SCENARIO 1: Launching Post Anki as a native desktop app

A user opens Post Anki from their dock/Applications folder (or Start menu) instead of a browser
tab. A chromeless native window opens showing the same subjects/curricula board they'd see on
the web — same account, same data, nothing separate to set up.

What to verify:
- The app window opens and loads the deployed `apps/web` origin (no local frontend bundled).
- No visible browser chrome (address bar, tabs, bookmarks bar) — reads as a native app.
- Data shown matches what's visible opening the same URL in a regular browser — zero divergence,
  because it's the same origin, same server, same database.

SCENARIO 2: Launching with no network reachable

A user opens the desktop app with no internet connection, or while `apps/web`'s Cloud Run
instance is cold-starting/unreachable. Instead of a blank white window, they see a clear
"can't reach Post Anki" state they can retry from.

What to verify:
- A visible error/retry state renders on webview navigation failure — never a blank window.
- Retrying (button, or relaunching the app) re-attempts the load once connectivity returns.

SCENARIO 3: Quitting and reopening changes nothing extra

Quitting and relaunching the app behaves like closing and reopening a browser tab pointed at the
same URL. The desktop shell itself introduces no new client-side credential or account concept —
whatever session state the site sets (if any) persists in the webview's own storage exactly the
way a browser profile would.

What to verify:
- Relaunch reloads the same URL and shows the same account/data state as before quitting.
- No new local credential/secret file is written by the desktop shell itself.

## Technical/Architectural Scenarios

SCENARIO 4: The desktop shell never becomes a second holder of API_SHARED_SECRET

Because this shell only ever displays `apps/web`'s existing origin (whose Node server is the sole
holder of `API_SHARED_SECRET`), the Tauri app itself carries zero `apps/api` credential and makes
zero direct request to `apps/api`.

What to verify:
- `apps/desktop`'s source (Rust config + package files) contains no reference to
  `API_SHARED_SECRET` or any `apps/api` base URL.
- `tauri.conf.json`'s configured window URL points at `apps/web`'s origin, never at `apps/api`'s.

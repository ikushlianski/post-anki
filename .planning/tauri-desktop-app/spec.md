---
type: spec
branch: tauri-desktop-app
task: Build a Tauri desktop app for Post Anki wrapping the same web app / reusing the same apps/api backend
complexity: medium
state: confirmed
updated: 2026-07-17
---
# Spec: Tauri desktop app for Post Anki

Goal: give Post Anki a native desktop presence (dock icon, own window, no browser chrome) that
shows the exact same account and data as the web app, without standing up any new backend and
without introducing a new client-side credential. This is a wrapper, not a rebuild: `apps/web`
and `apps/api` are unchanged by this pass.

### Phases
```
Phase 1 — Business Logic: SKIPPED — purely a packaging/wrapper app; no business rule changes.
Phase 2 — User Experience: ACTIVE (light) — new native launch/offline/relaunch scenarios only.
Phase 3 — Architecture: ACTIVE — new deployable artifact + an explicit security decision.
```

Single phase implementation.

### Derivers

Not applicable — no business logic or pure computation is introduced. This is a shell/config
layer around an already-existing, unchanged frontend and backend.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 — native launch | None | None (reuses `apps/web` as-is) | `apps/desktop/src-tauri/tauri.conf.json` — window URL config |
| SCENARIO 2 — offline/unreachable | None | None | `apps/desktop/src-tauri/src/main.rs` — navigation-failure handler shows retry state |
| SCENARIO 3 — quit/relaunch | None | None | `apps/desktop/src-tauri/tauri.conf.json` — no local storage/credential added |
| SCENARIO 4 — no second secret holder | None | None | `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/package.json` — no `API_SHARED_SECRET`/`apps/api` reference anywhere in this package |

### Files to create

```
apps/desktop/
  package.json                    — @post-anki/desktop; scripts: tauri, tauri:dev, tauri:build
  .env.example                    — DESKTOP_APP_URL (documents dev vs release default)
  src-tauri/
    Cargo.toml                    — Tauri crate, package name post-anki-desktop
    tauri.conf.json               — app.windows[0].url = ${DESKTOP_APP_URL}; window title
                                     "Post Anki"; no CORS/allowlist entries for apps/api
    src/main.rs                   — Tauri entry point; on-navigation-failure handler renders a
                                     retry state instead of leaving a blank window
    icons/                        — Tauri's default template icon set for v1 (placeholder;
                                     follow-up to swap in real brand icons, see todo.md)
docs/architecture/tauri-desktop-app.md — architecture doc + Mermaid diagram (new; no existing
                                     doc covers a native desktop shell)
```

### Files to modify

```
package.json                      — + "apps/desktop" to workspaces array; + npm scripts
                                     dev:desktop / build:desktop (mirrors existing
                                     dev:api / dev:web / dev:bot convention)
.gitignore                        — + apps/desktop/src-tauri/target/ (Rust build artifacts)
```

Nothing under `apps/web/` or `apps/api/` changes — that is itself a scenario-4 acceptance check,
not an oversight.

### Data model changes

Not applicable.

### Documentation changes

New — `docs/architecture/tauri-desktop-app.md` will be published during implementation, since no
existing doc covers a native desktop shell. It documents the webview-wrapper architecture, the
security decision (below), and a Mermaid flow diagram, following the same
`docs/architecture/<slug>.md` convention as `docs/architecture/local-first-electric-sync.md`.

### Decisions made autonomously

1. **Webview-wrapper, not a native API client — chosen over a new Vite/React frontend calling
   `apps/api` directly.** "Wrapping the same web app... reusing the same apps/api backend...
   without a separate backend" is satisfied transitively: `apps/web` already talks to `apps/api`
   for every request, so wrapping `apps/web` in a native shell reuses `apps/api` with zero new
   code. The alternative (new frontend + new per-user auth) is a legitimate *future* shape but
   was not required by this item and would have added a security-relevant change (new
   auth-guarded routes on every existing `apps/api` endpoint) unjustified by anything asked for
   here. Reversibility broke the tie: the wrapper is trivially replaceable later; a new auth
   surface bolted onto a deliberately single-user, currently-loginless app is not something to
   commit to on inference alone. See `architecture.md`'s Security decision for the full reasoning
   and what a future direct-API slice would need to add.
2. **No CORS/auth changes to `apps/api` or `apps/web`.** Since the shell only ever displays
   `apps/web`'s existing origin, no new request path is created and no existing route needs to
   accept a new credential type.
3. **`DESKTOP_APP_URL` is the one build-time config value.** Release builds default to the
   production origin; local development overrides it to point at `vite dev` — the same env-driven
   pattern this repo already uses for `API_BASE_URL` in `apps/web`.
4. **Placeholder app icons for v1.** Tauri's default template icon set ships in v1; swapping in
   real Post Anki branding is cosmetic follow-up work, not a blocker (`todo.md`).
5. **No CI/release/code-signing pipeline in this pass.** This machine has no Rust toolchain to
   validate a build against, and code signing needs external accounts/certificates outside this
   repo's IaC — both deferred to a follow-up item (`todo.md`).
6. **Auto-confirmed without a human review gate.** This plan was authored and confirmed
   autonomously as part of a grand-loop run with no human present, per that run's explicit
   override of `plan-ie`'s normal confirmation step. Every fork above had a safe, reversible
   default consistent with existing repo conventions, so none required escalation.

### Implementation order

1. `apps/desktop/package.json` + `src-tauri/Cargo.toml` + `tauri.conf.json` scaffold (from the
   standard Tauri v2 template), configured with `DESKTOP_APP_URL`.
2. `src-tauri/src/main.rs` — wire the navigation-failure → retry-state handler (SCENARIO 2).
3. Root `package.json` workspaces + npm scripts; `.gitignore` entry for `src-tauri/target/`.
4. `docs/architecture/tauri-desktop-app.md` — publish the architecture doc + diagram.
5. Verify per the Definition of Done below; record what could and couldn't be proven on this
   machine.

### Scope boundary

Out of scope this pass: any new frontend code (the shell reuses `apps/web` as-is); any change to
`apps/api` or its auth (`authorized()` in `apps/api/src/server.ts` is untouched); a direct-to-
`apps/api` desktop client with its own login/session tokens (documented as a future decision in
`architecture.md`, not built); Electric/local-first wiring on desktop (that proof-of-concept is
still web-only and its own Cloud Run deploy hasn't even run yet, per
`.planning/local-first-electric-sync/todo.md`); Windows/Linux builds (config-only, untested on
those OSes from this machine); CI, release packaging, code signing, and auto-update (all
`todo.md`); real brand icons (placeholder for v1).

### Definition of Done — per layer

**Frontend / desktop-shell layer:**
- `apps/desktop/src-tauri/tauri.conf.json` parses as valid JSON
  (`node -e "JSON.parse(require('fs').readFileSync('apps/desktop/src-tauri/tauri.conf.json','utf8'))"`
  exits 0) and its configured window URL resolves to the production `apps/web` origin for a
  release build (grep the config/env file, don't hardcode a check that can't run here).
- `apps/desktop`'s source contains zero occurrences of `API_SHARED_SECRET` or an `apps/api` base
  URL (`grep -rn "API_SHARED_SECRET\|apps/api" apps/desktop` returns nothing) — this is
  SCENARIO 4's acceptance check.
- **Cannot be verified on this machine:** actually launching the shell (`cargo tauri dev`) or
  producing a native binary (`cargo tauri build`) requires the Rust toolchain, which this machine
  does not have (`cargo`/`rustc`/`rustup` all confirmed missing). State this explicitly rather
  than inventing a substitute check — the real proof is a developer running `cargo tauri dev` on
  a machine with Rust installed and confirming the window opens showing the live Post Anki board,
  and that killing network access shows the retry state from SCENARIO 2 instead of a blank
  window.

**Backend layer:**
- No backend change is part of this task's Definition of Done, by design (see Decisions made
  autonomously #1–2). Proof this constraint was respected: `git diff --stat -- apps/api` between
  this branch and its base is empty, and `cd apps/api && npx tsc --noEmit` still passes with the
  same result as before this task started (no regression, because nothing changed).

**Infrastructure layer:**
- No new cloud infrastructure. Proof: `git diff --stat -- infra` between this branch and its base
  is empty — no Pulumi changes, no `pulumi up` needed or run.
- The one piece of "infrastructure" this task does touch — the local Rust/Cargo build
  environment for `apps/desktop/src-tauri` — **cannot be provisioned or verified on this
  machine** (no Rust toolchain). This is explicitly deferred to a developer machine with Rust
  installed, or to a future CI workflow (itself out of scope here, see `todo.md`).

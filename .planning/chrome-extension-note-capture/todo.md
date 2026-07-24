---
type: todo
branch: chrome-extension-note-capture
task: Chrome extension for quick note/link capture into post-anki's hierarchy
state: open
updated: 2026-07-11
---

# Todo: Chrome extension note capture

## Decisions to make
Nothing to decide — all decisions made during planning.

## To review / clarify
- **SCENARIO 11's finalize/reject mechanism**: does reusing existing
  `confirmCurriculum` (whole-curriculum accept) composed with existing
  `deleteModule` (per-item reject before confirming) actually satisfy "AI
  suggests, I click a button to finalize or reject" — or is a dedicated
  per-suggestion accept/reject UI expected? Raise explicitly in grill-me
  before treating SCENARIO 11 as fully specified.

## Manual steps
- **Seed production DB (SCENARIO 12).** Deferred — could not obtain
  `PROD_DATABASE_URL`. It's a GitHub Actions secret (write-only, unreadable
  via `gh` or any API) backing a Neon Postgres project/branch nicknamed
  "cool-night" (per `.inbox/TODOS.md:15`). To unblock: log into neon.tech,
  copy the "cool-night" project's connection string, and either paste it
  directly or add a Neon MCP server to Claude Code's config. Seed content
  lives in `seed-data.md` (1 subject, 14 curricula, ~51 modules) and is
  editable before running.
- **`EXTENSION_ID` env var** — only known once the extension is packed/loaded
  in Chrome for the first time; set it in `apps/api`'s CORS config
  (local `.env` and the `PROD_*` GitHub secret / Pulumi config for
  production) after that.
- **Extension token generation** — after SCENARIO 9 ships, generate the first
  real token from the admin-settings screen and paste it into the extension's
  options page before the extension can make any authenticated request.

## Post-deploy checks
- Confirm CORS rejects a request from a plain `https://` origin (not just
  that it accepts the extension's) — a quick manual `fetch` from a browser
  console against `api.postanki.ilya.online` from a non-extension tab should
  fail.
- Confirm a revoked extension token is rejected on its very next use, not
  just on subsequent ones (no caching of "was valid" state).

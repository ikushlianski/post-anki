# post-anki e2e — registered in verification-repo

**post-anki is registered in `verification-repo`** as `projects/post-anki/post-anki/`
(see that repo's `projects/post-anki/post-anki/docs/runbook.md` for the full app
runbook). The test content — `lib/`, `db/` (renamed from this repo's old
`lib/db.ts` + `forbidden-targets.ts`), `global-setup.ts`, `mock-openrouter/`,
`mock-docs-site/`, `features/`, and `playwright.post-anki.config.ts` — lives
there now, not in this folder.

**What stays here, and why:** `docker-compose.yml`, `scripts/run.sh`, `.env`,
and `.env.example` stay in this repo because `scripts/run.sh` drives `npm run
db:migrate -w @post-anki/api`, which only resolves inside this repo's own npm
workspaces — it can't be moved without re-deriving cross-repo workspace
resolution for no behavioral gain. `npm run dev:pw` (this repo's own
`package.json` script) is still the real, working entrypoint; it now hands off
to verification-repo's own installed Playwright binary pointed at
`playwright.post-anki.config.ts` there.

## Status: registered, suite GREEN

```bash
npm run dev:pw                              # whole suite (docker up → migrate → boot e2e stack → run)
npm run dev:pw -- add-subject               # filter by path/name
HEADED=true npm run dev:pw -- add-subject   # watch it
npm run e2e:db:down                         # stop the local Postgres
```

`dev:pw` (`e2e/scripts/run.sh`): brings up local Postgres (docker, host **:5436**, ephemeral
tmpfs), migrates the api schema into it, then hands off to verification-repo's Playwright config,
whose `webServer` entries boot an **e2e api on :8031** (pointed at local Postgres), **web on
:3100**, the local mock OpenRouter server on **:4999**, and the local mock docs site on **:4998**,
run the tests, and tear the servers down. Local config in `e2e/.env` (copy from `.env.example`).
No collision with normal dev (:8030/:3000).

**Cold-start gotcha (solved):** vite dev compiles modules on first hit, and `window.__TSR_ROUTER__`
(the hydration signal actions wait on) is set slightly before the form's React handlers attach — so
a cold first click raced into a no-op native submit. Fixed by a Playwright **`global-setup.ts`**
(now in verification-repo) that opens a browser and warms the client bundle + the create server-fn
before any test runs, plus `waitForHydration` in actions. Preserved verbatim across the migration —
do not simplify it away.

## Principles preserved → post-anki adaptation

| /e2e principle | Here |
|---|---|
| Run against a dedicated e2e stack, URL from env (not hard-coded) | `PROJECT_DEV_SERVER_URL ?? http://localhost:3100`; stack = webServer entries in verification-repo's `playwright.post-anki.config.ts` |
| Stage discovered from `.sst/stage` | No SST → URL from env; no stage concept |
| **Local DB only**, `assertTargetAllowed` + `FORBIDDEN_TARGETS`, never the shared DB | Persistence layer connects to **local Docker Postgres only**; forbidden list contains the Neon/Supabase/RDS hosts — refuses if `E2E_DATABASE_URL` points at cloud |
| Two-layer assertions: UI (`getByTestId`) + persistence | UI `getByTestId` + **Postgres row asserts** (local pg client) |
| Stateless feature → UI-only asserts | Read-only pages (concerns/decide nav, not yet built) would assert UI only |
| testids in the source component, drive via `getByTestId` only | `data-testid` already present on subject + curriculum forms (`apps/web/src/subject/*`, `apps/web/src/curriculum/create-curriculum-form.tsx`); add more per action as needed |
| Synthetic fixtures only | `features/*/fixtures/mock-data/*` in verification-repo — fake subjects/sources |
| Auth: setup-project storageState **or** cookie-mint | **Neither** — web is single-owner, no browser login; BFF→API bearer is server-side env. Tests just load the app |
| `captureProof` after each `expect`; `pauseForHuman` headed-only | In verification-repo's project `lib/` (project-local) + `@verify-core/actions/*` (shared framework code, no local duplicate) |
| Actions: typed, one flow, block on real signals, throw `ActionFailure` | `features/<feature>/actions/*.action.ts` + barrel, in verification-repo |
| `@<TICKET>` title tag; organized by behavior; **never** `test.skip` | Tag `@e2e` + a per-scenario id (no Linear/MAT tickets here); no skips |

## What's actually registered

- **subject** (`features/subject/` in verification-repo) — `createSubject` action,
  `add-subject` test: UI card appears + `subjects` row persisted.
- **curriculum** (`features/curriculum/` in verification-repo):
  - `parse-curriculum` test, API-driven: stubbed architect reaches `status: ready`
    with the mock's module titles, `modules` rows persist. No UI action.
  - `study-technology-doc-url` test — `studyTechnology` action drives the doc-URL
    + level form; asserts the curriculum grounds on a `llms_txt` source (never
    `web_research`), and that the picked level's tier starts pre-included while
    the other two start excluded.

Scenarios from the original build plan covering curriculum lifecycle/confirm,
module/topic shape, probe cold-start, read-only nav, and daily push are **not
yet built** — this is an honest gap, not a silent one.

## Local-DB safety wiring (the core adaptation)

The app's normal DB is **cloud Neon** — the framework must never mutate it. So the e2e stack runs
its **own local Postgres**:
- `docker compose -f e2e/docker-compose.yml up -d` → Postgres on `localhost:5436`.
- API booted with `DATABASE_URL=<local Postgres>` + `db:migrate` against it.
- Web talks to that API. UI writes land in **local** Postgres.
- Test persistence layer connects to the same local DB; `assertTargetAllowed` refuses if the host
  matches a `FORBIDDEN_TARGETS` entry (`neon.tech`, `aws.neon.tech`, `pooler.supabase.com`,
  `rds.amazonaws.com`) or isn't in the local allowlist. So a misconfig that points e2e at Neon
  **fails closed**.

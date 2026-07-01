# post-anki e2e — collocated, verification-repo principles

Playwright e2e suite living **inside this repo** (`e2e/`), authored by the rules of the
`/e2e` skill but self-contained (no verification-repo project registration).

## Status: foundation + first test GREEN ✅

```bash
npm run dev:pw                    # whole suite (docker up → migrate → boot e2e stack → run)
npm run dev:pw -- add-subject     # filter by path/name
HEADED=true npm run dev:pw -- add-subject   # watch it
npm run e2e:db:down               # stop the local Postgres
```

`dev:pw` (`e2e/scripts/run.sh`): brings up local Postgres (docker, host **:5436**, ephemeral
tmpfs), migrates the api schema into it, then Playwright's `webServer` boots an **e2e api on
:8031** (pointed at local Postgres) and **web on :3100**, runs the tests, tears the servers down.
Config in `e2e/.env` (copy from `.env.example`). No collision with normal dev (:8030/:3000).

**Cold-start gotcha (solved):** vite dev compiles modules on first hit, and `window.__TSR_ROUTER__`
(the hydration signal we wait on) is set slightly before the form's React handlers attach — so a
cold first click raced into a no-op native submit. Fixed by a Playwright **`global-setup.ts`** that
opens a browser and warms the client bundle + the create server-fn before any test, plus
`waitForHydration` in actions. Three consecutive cold runs pass.

## Principles preserved → post-anki adaptation

| /e2e principle | Here |
|---|---|
| Run against the regular dev stack, URL from env (not hard-coded) | `PROJECT_DEV_SERVER_URL ?? http://localhost:3000`; stack = `npm run dev` |
| Stage discovered from `.sst/stage` | No SST → URL from env; no stage concept |
| **Local DB only**, `assertTargetAllowed` + `FORBIDDEN_TARGETS`, never the shared DB | Persistence layer connects to **local Docker Postgres only**; forbidden list contains the **Neon host** — refuses if `DATABASE_URL` points at cloud |
| Two-layer assertions: UI (`getByTestId`) + persistence | UI `getByTestId` + **Postgres row asserts** (local pg client) |
| Stateless feature → UI-only asserts | Read-only pages (concerns/decide nav) assert UI only |
| testids in the source component, drive via `getByTestId` only | Add `data-testid` to `apps/web/src` components as each action needs them (FE has **zero** today) |
| Synthetic fixtures only | `e2e/fixtures/mock-data/*` — fake subjects/sources |
| Auth: setup-project storageState **or** cookie-mint | **Neither** — web is single-owner, no browser login; BFF→API bearer is server-side env. Tests just load the app |
| `captureProof` after each `expect`; `pauseForHuman` headed-only | Ported into `e2e/lib` |
| Actions: typed, one flow, block on real signals, throw `ActionFailure` | Ported; `e2e/features/<feature>/actions/*.action.ts` + barrel |
| `@<TICKET>` title tag; organized by behavior; **never** `test.skip` | Tag `@e2e` + a per-scenario id (no Linear/MAT tickets here); no skips |

## Folder structure (proposed — top-level `e2e/`)

```
e2e/
  playwright.config.ts          baseURL from env, workers=1, trace on, screenshot on failure
  docker-compose.yml            local Postgres for the e2e stack
  lib/
    action-failure.ts           ported verbatim
    pause-for-human.ts          ported verbatim
    capture-proof.ts            framed success screenshot → proof/<feature>/<scenario>.png
    forbidden-targets.ts        FORBIDDEN = Neon host(s); local-only allowlist
    assert-target-allowed.ts    refuses cloud DB before any pg connection
    db.ts                       local pg client + assert helpers (rowExists, countWhere)
  features/
    curriculum/
      actions/                  createSubject, createCurriculum, confirmCurriculum, probeTopic…
      fixtures/mock-data/       synthetic subject + pasted-source fixtures
      tests/<scenario-slug>/    test.ts + scenario.md
  proof/                        gitignored success screenshots
```

## Local-DB safety wiring (the core adaptation)

The app's normal DB is **cloud Neon** — the framework must never mutate it. So the e2e stack runs
its **own local Postgres**:
- `docker compose -f e2e/docker-compose.yml up -d` → Postgres on `localhost:5433`.
- API booted with `DATABASE_URL=postgres://…localhost:5433…` + `db:migrate` against it.
- Web `npm run dev` → talks to that API. UI writes land in **local** Postgres.
- Test persistence layer connects to the same local DB; `assertTargetAllowed` refuses if the host
  matches a `FORBIDDEN_TARGETS` Neon entry. So a misconfig that points e2e at Neon **fails closed**.

## Basic suite (happy-path, behavior-organized)

1. **Subject create** — create a subject → it appears in the list + **row in `subjects`**.
2. **Curriculum from sources** — create curriculum with pasted text → appears `curating`/`ready` + **row in `curricula`** (status asserted).
3. **Lifecycle** — `ready` curriculum → Confirm → badge `confirmed` + **status persisted**.
4. **Shape** — add a module / add a topic → visible + **rows persisted**.
5. **Probe (cold-start)** — confirmed zero-gap topic → opener question renders; answer → a gap is discovered/closed (UI chip + **gap row** asserts).
6. **Read-only nav** — `/concerns` and `/decide` load with their headings (UI-only; stateless).
7. **Daily push** — `/today` renders the push card or the empty state.

Each becomes one `@e2e` test under `features/curriculum/tests/`. LLM-dependent steps (parse, probe
eval) block on real UI signals with generous timeouts; no fixed sleeps.

## Build order

- **P0 Foundation**: install Playwright; `lib/` (port helpers + pg); `docker-compose.yml`; `playwright.config.ts`; npm scripts (`e2e`, `e2e:view`); orchestration (compose up → migrate → ready).
- **P1 First feature**: `curriculum` actions + fixtures + scenarios 1–3 + the `data-testid`s they need in `apps/web/src`. Run headed, then headless.
- **P2 Broaden**: scenarios 4–7.

## Open decisions (confirm before P0)

- **Location**: top-level `e2e/` (proposed) vs `apps/web/e2e/`.
- **Local Postgres now** (enables two-layer persistence asserts) vs UI-only first.
- **Ticket tag** scheme (no Linear/MAT here): `@e2e` + scenario id, or tie to GitHub issues.

---
type: playwright
branch: gap-mastery-cascade-delete
task: "Clean up orphaned gap_mastery rows left behind by gap/topic/module/curriculum deletion"
state: confirmed
target-project: post-anki
target-feature: none (repository-layer fix, no UI feature folder applies)
actions-snapshot-date: 2026-07-30
updated: 2026-07-30
---

# Playwright readiness — gap_mastery cascade delete

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — Deleting a topic, module, or curriculum no longer leaves invisible, unbounded rows behind in
  the database — data cleanup is now complete, not partial, whenever a learner (or the app) removes
  part of their curriculum. → S1

**UX scenarios**
- None. This item has zero user-visible surface: deleting a topic/module/curriculum already looks
  and behaves identically today from the app's screens whether the orphaned row exists or not, and
  that stays true after the fix — the change is entirely inside the database, not on any page.

**Not e2e (verified at unit/integration only)**
- S1 (gap_mastery cascade delete) — there is no UI-observable difference this defect produces:
  every reader of `gap_mastery` joins through `gaps`, so a Playwright browser test cannot detect an
  orphaned row in either direction. Verified as a `.integration.test.ts` against real local
  Postgres, mirroring `gap-mastery-concurrency.integration.test.ts` and the identical precedent
  already set in `.planning/generalize-gap-tracking/scenarios.md` SCENARIO 8.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: none — no `features/<feature>/` folder applies; this never drives the browser
- Target DB: local e2e docker Postgres (`e2e/docker-compose.yml`, `postanki_e2e` on port 5436) —
  same physical DB the Playwright e2e stack uses, but reached via `vitest --config
  vitest.integration.config.ts`, not via `dev:pw` / Playwright
- Dev server URL: N/A — the integration test never starts the web/api dev servers, it talks to
  Postgres directly via `pg.Client`, matching the existing `.integration.test.ts` precedent

## Action surface — snapshot

None consulted — no Playwright action is used or needed for this item.

## Scenario → action + state + testid map

### S1 — gap_mastery cascade delete

**Composes actions:** none (integration test, not a Playwright action composition)

**Action gaps:** none

**Pre-test state:** N/A (Playwright state-mock sense) — the integration test seeds its own rows
directly via raw SQL `INSERT` inside each test case, exactly like
`gap-mastery-concurrency.integration.test.ts`'s `seedScenery` helper. See `state-fixtures.md`.

**Required `data-testid` attributes:** none — no UI component involved.

**Fixture variants:** none.

**Vision check candidate:** no — nothing renders.

## Action gaps consolidated

None.

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | n/a (integration test, not e2e — direct DB) | real local e2e Postgres, no Playwright state class, no state-mock file — state is seeded inline per test case via raw SQL, matching `gap-mastery-concurrency.integration.test.ts` |

## Open questions

None carried forward — the four call sites, the shared helper's shape, and the transaction wrapping
are all fully specified in `scenarios.md`'s Acceptance block.

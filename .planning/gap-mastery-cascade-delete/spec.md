---
type: spec
branch: gap-mastery-cascade-delete
task: "Clean up orphaned gap_mastery rows left behind by gap/topic/module/curriculum deletion"
complexity: medium
state: confirmed
updated: 2026-07-30
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
  playwrightPlan: .planning/gap-mastery-cascade-delete/playwright.md
  stateFixtures: .planning/gap-mastery-cascade-delete/state-fixtures.md
---

# Spec: gap_mastery cascade delete

## What to do

`gap_mastery` (schema.ts:215) is a 1:1 sidecar to `gaps`, keyed by `gapId` as a plain `text` column
with a unique index — never a `.references()` foreign key, matching this schema's deliberate
convention of not using DB-level FKs for cross-table ids (see the existing comment on
`gapMastery.gapId` at schema.ts:226-228). Because there is no FK, there is no `ON DELETE CASCADE`,
and none of the four places that delete `gaps` rows also delete the matching `gap_mastery` row.
Every reader of `gap_mastery` joins through `gaps` (`listMasteryTrackedGapsAcrossSubjects` uses an
INNER JOIN), so an orphaned row is invisible today — not a correctness bug, but an unbounded,
silent leak that grows with every topic/module/curriculum deletion.

Fix: at each of the four `db.delete(gaps)` call sites, also delete the matching `gap_mastery` rows
for the gap ids being removed, in the same transaction as the rest of the deletion. Add one shared
helper (`deleteGapMasteryForGapIds`) in `gap-mastery.repo.ts` rather than duplicating the delete
four times.

## Decisions made autonomously

No human was present to review forks; every decision below had a safe, reversible, pattern-following
default, so none were escalated (per the recommended-default rule).

1. **Explicit in-transaction deletes, not an `ON DELETE CASCADE` FK.** Adding a real FK would mean a
   new migration and would contradict this schema's own documented convention of using plain `text`
   columns (no `.references()`) for every cross-table id, `gapMastery.gapId` included. Explicit
   deletes match the codebase as it stands today — lower risk, no migration.
2. **Wrap each of the four deletion functions in `getDb().transaction()`.** None of the four
   (`deleteTopic`, `deleteModule`, `deleteModules`, `clearCurriculumStructure`) currently run inside
   an explicit transaction — today's calls are sequential un-transacted awaits. The task's Definition
   of Done requires the `gap_mastery` delete happen "in the same transaction" as the rest, so this
   plan closes that pre-existing atomicity gap as part of the fix, using the exact
   `getDb().transaction(async (tx) => {...})` shape already established by
   `applyGapMasteryAttempt` in this same file (gap-mastery.repo.ts:142).
3. **"Gap deletion itself" (the fourth call site named in the task) maps to `topic.repo.ts`'s
   `deleteTopic`.** Code search confirms there is no standalone single-gap-delete function anywhere
   in the codebase — a `gaps` row's only deletion path is via its parent topic being deleted
   (`db.delete(gaps).where(eq(gaps.topicId, ...))` appears in exactly four places, listed below, and
   all four are topic-scoped). `deleteTopic` is the most directly "a gap's row gets deleted" call
   site among the four, so it fills that slot. This is a scope clarification, not an open fork.
4. **Proof is a real-Postgres `.integration.test.ts`, not a Playwright browser test.** There is no
   UI-observable difference an orphaned `gap_mastery` row produces — every reader joins through
   `gaps`, so the screen looks identical either way. This exactly mirrors the precedent already set
   in `.planning/generalize-gap-tracking/scenarios.md` SCENARIO 8 (a concurrency race verified the
   same way, for the same reason: a browser test structurally cannot observe or force the condition
   under test). See `apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts` for the
   harness shape being followed.
5. **No `architecture.md`.** No new service boundary, no infra change, no async-boundary shift — a
   bug fix at the repository layer, adding one helper function and wrapping four existing functions
   in transactions.

Plan auto-confirmed by grand-loop-playwright (no human present to review).

## Files to touch

```
apps/api/src/
├── gap/
│   ├── gap-mastery.repo.ts                                  # + deleteGapMasteryForGapIds(gapIds, db)
│   └── gap-mastery-cascade-delete.integration.test.ts        # NEW — the DB proof (4 cases, 1 file)
├── topic/
│   └── topic.repo.ts                                         # deleteTopic: wrap in tx, delete gap_mastery before gaps
├── module/
│   └── module.repo.ts                                        # deleteModule: same
└── curriculum/
    └── curriculum.repo.ts                                    # deleteModules + clearCurriculumStructure: same
```

## Derivers

None. This is a DB write-path fix (delete-then-delete), not a pure business-logic transformation —
there is no meaningful pure function to extract and unit-test separately from the DB call itself.
The one new function (`deleteGapMasteryForGapIds`) is a thin DB wrapper, proven by the integration
test directly rather than by a unit test with a mocked DB.

## Done when

- Deleting a topic (directly), a module, or a curriculum that owns a gap with an active
  `gap_mastery` row leaves zero rows in `gap_mastery` for that gap's id afterward.
- All four call sites share one helper function rather than four duplicated delete statements.
- Each of the four deletion functions performs its deletes (existing + the new `gap_mastery` delete)
  inside one DB transaction.
- Proven by `apps/api/src/gap/gap-mastery-cascade-delete.integration.test.ts`, run via
  `npm run test:integration -w @post-anki/api`, against real local Postgres — not inferred from
  code review alone.

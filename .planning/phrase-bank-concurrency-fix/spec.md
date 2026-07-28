---
type: spec
branch: phrase-bank-concurrency-fix
task: Close the phrase-bank's concurrency and data-integrity gaps — no real FK, no locking
complexity: medium
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/phrase-bank-concurrency-fix/playwright.md
  stateFixtures: .planning/phrase-bank-concurrency-fix/state-fixtures.md
---

# Spec: Phrase-bank concurrency and data-integrity fix

### What to do

Close three real races and one missing foreign key in the phrase-bank feature
(`docs/architecture/phrase-bank-mastery/review.md`, `/debrief` 2026-07-25), confirmed unchanged
against the actual code as of this planning session (2026-07-28):

1. Add a real `REFERENCES` FK from `phrases.targetPhraseBankEntryId` to `phrase_bank_entries.id`
   (currently a plain nullable `text()` column, despite `architecture.md` claiming it's already a
   real FK), plus two unique indexes: `phrases(subject_id, level, pack, sequence_number)` and
   `phrase_bank_entries(subject_id, level, pack, lower(phrase_text))`. One additive migration.
2. Wrap `generatePhraseBatch`'s write path — the authoritative `nextSequenceBase` read,
   `linkOrCreateTargetPhrases`, and `insertPhraseBatch` — in one `db.transaction()` guarded by
   `pg_advisory_xact_lock(hashtext(subjectId || level || pack))`, closing both the sequence-number
   race and the duplicate-phrase-bank-entry race with a single lock scope. The LLM call stays
   outside the lock (see `architecture.md`'s "Key design decision").
3. Wrap grading's `applyPhraseBankUpdates` read-compute-write sequence in one `db.transaction()`
   with a `SELECT ... FOR UPDATE` read (rows locked in `id` order to avoid deadlock), closing the
   lost-mastery-update race.

No API response shape changes. The pure mastery state machine in
`packages/core/src/phrase-bank/phrase-bank.ts` is untouched — this is entirely a persistence-layer
fix.

### Derivers

No new derivers. The existing pure state machine (`selectDuePhrases`,
`applyAttemptToPhraseBankEntry`, `matchExistingPhraseBankEntry` in
`packages/core/src/phrase-bank/phrase-bank.ts`) is unchanged by this plan — the races being closed
are all in the repo/orchestrator persistence layer around those derivers, not in the derivers
themselves.

### Files to touch

```
apps/api/src/db/
  schema.ts                                — phrases.targetPhraseBankEntryId gains .references();
                                              new uniqueIndex phrases(subject_id, level, pack,
                                              sequence_number); new uniqueIndex
                                              phrase_bank_entries(subject_id, level, pack,
                                              lower(phrase_text))
  migrations/00XX_*.sql                     — new, generated via `npm run db:generate:api`
  migrations.integration.test.ts            — new (SCENARIO 1)

apps/api/src/practice/
  phrase-bank.repo.ts                       — nextSequenceBase, matchExistingEntryId,
                                              createPhraseBankEntry gain an optional trailing
                                              executor param (default getDb()); new
                                              getPhraseBankEntriesByIdsForUpdate (or a `forUpdate`
                                              option on the existing function)
  practice.repo.ts                          — insertPhraseBatch gains the same optional executor
                                              param
  generate-phrase-batch.orchestrator.ts     — reorder: authoritative nextSequenceBase re-read +
                                              linkOrCreateTargetPhrases + insertPhraseBatch run
                                              inside getDb().transaction(...) with the advisory
                                              lock as the first statement
  grade-attempts.orchestrator.ts            — applyPhraseBankUpdates wraps read (FOR UPDATE) +
                                              compute + write in getDb().transaction(...)
  phrase-bank-concurrency.integration.test.ts — new (SCENARIO 2, 3, 4)

docs/architecture/phrase-bank-mastery/
  as-built.mmd, as-built.png                — regenerated to show the transaction/lock shape
                                              (see architecture.md's "Documentation changes")
```

### Files NOT touched (confirm explicitly — do not silently omit)

- `apps/web/` — nothing. No frontend code changes anywhere in this plan; SCENARIO 5's e2e proof
  reuses the existing UI and existing verification-repo actions unchanged.
- `packages/core/src/phrase-bank/phrase-bank.ts` — the pure derivers are untouched.
- `apps/api/src/practice/practice.controller.ts`, `router.ts`, `server.ts` — no route or response
  shape changes.
- No infrastructure/cloud resource files — this is an application-level Drizzle migration only.

### Data model changes

Additive only: one new FK constraint, two new unique indexes. No new tables, no new columns, no
column type changes, no data migration/backfill needed (the FK and indexes apply to existing
columns whose current values are expected — but not yet directly verified — to already satisfy
them; see architecture.md's "Pre-migration safety check").

### Documentation changes

`docs/architecture/phrase-bank-mastery/as-built.mmd` currently shows the unlocked, race-prone write
path as the as-built architecture — that's now out of date the moment this plan ships. During
implementation, regenerate `as-built.mmd`/`as-built.png` from `architecture.md`'s "Proposed shape"
diagram in this plan folder, so the published as-built diagram matches the shipped code rather than
describing a state review.md already flagged as wrong.

### Decisions made autonomously

This is an unattended planning run with no human available to answer interview questions; every
decision below was made using a safe, reversible default per the project's standing autonomy rule,
and is listed here instead of having blocked on a question.

1. **The advisory lock scope covers `linkOrCreateTargetPhrases` and the batch insert, but not the
   LLM call, even though `review.md`'s literal wording says "wrap `nextSequenceBase` + the batch
   insert."** Read literally, the current code order would hold a DB transaction (one of only 4
   pooled connections) open for the ~1-5s duration of the `agent.generate` call, which has no
   correctness benefit. The write-path ordering is changed so the authoritative sequence-number
   read happens after the LLM call returns, inside the lock — full reasoning in `architecture.md`.
   Reversible: purely an internal ordering change, no schema or API impact either way.
2. **`ON DELETE SET NULL` for the new FK**, not `CASCADE` or `RESTRICT`. Nothing in the app deletes
   a `phrase_bank_entries` row today (the mastery model archives via `status: "mastered"`, never
   deletes); `SET NULL` is the safest default if a future delete path is ever added — the dependent
   `phrases` row degrades to "untracked" rather than being deleted itself or blocking the delete.
   Reversible via a follow-up migration if a future feature needs different behavior.
3. **The new backend concurrency tests run against the project's existing e2e Postgres
   (`e2e/docker-compose.yml`, localhost:5436) via a new `*.integration.test.ts` naming convention**,
   excluded from the default fast `npm run test` run and invoked by a dedicated script — establishing
   this project's first real-DB test pattern (none existed before this plan; every existing test,
   including the current phrase-bank tests, is pure/mocked). Chosen over the persistent dev DB
   (localhost:5437) because the e2e DB is explicitly documented as disposable/tmpfs and already the
   project's designated "safe to mutate" local target; chosen over provisioning a third, dedicated
   test-only Postgres container because that would be new infrastructure surface for no added
   isolation benefit — each integration test generates its own random subjectId scope (no FK from
   `phrases`/`phrase_bank_entries`.subject_id to a `subjects` row exists, confirmed by grep), so
   tests don't collide with each other or with any other data already in that DB. Reversible: a
   later CI-hardening pass can move this to a dedicated ephemeral container without changing the
   test code itself.
4. **A lightweight target-DB safety guard is added to the new integration test file** — refusing to
   connect unless the resolved `DATABASE_URL` host is `localhost`/`127.0.0.1` — mirroring the
   existing `assertTargetAllowed` pattern already used in `verification-repo/projects/post-anki/
   post-anki/db/assert-target-allowed.ts`. This is a new, small piece of test-only code, not a
   production dependency; it exists purely so a misconfigured `DATABASE_URL` can never point a
   mutating integration test at Neon/prod.
5. **Consistency-gate auto-confirmation.** All consistency-gate checks passed with 0 gaps (see the
   gate run recorded in `discussion.md`); per the invoking task's explicit instruction for this
   unattended run, `state: draft` was flipped to `state: confirmed` in every plan file immediately
   once the gate passed, without a human review step in between. Plan auto-confirmed by grand-loop
   overnight planning run 2026-07-28 — no human reviewer available; every decision above used the
   project's documented recommended-default rule instead of blocking on a question.

### Implementation order

1. `apps/api/src/db/schema.ts` — FK + two unique indexes; `npm run db:generate:api` then review the
   generated SQL for the expression index (see architecture.md's caveat) before
   `npm run db:migrate:api` against local dev.
2. `apps/api/src/db/migrations.integration.test.ts` — SCENARIO 1's migration-diff proof, run first
   so the constraint's actual behavior is verified before anything is built on top of it.
3. `apps/api/src/practice/phrase-bank.repo.ts` + `practice.repo.ts` — add the optional executor
   parameter to the four functions listed in "Files to touch", no behavior change yet (default path
   unchanged).
4. `apps/api/src/practice/generate-phrase-batch.orchestrator.ts` — the transaction + advisory-lock
   rewrite — covers SCENARIO 2, SCENARIO 3.
5. `apps/api/src/practice/grade-attempts.orchestrator.ts` — the transaction + `FOR UPDATE` rewrite —
   covers SCENARIO 4.
6. `apps/api/src/practice/phrase-bank-concurrency.integration.test.ts` — SCENARIO 2, 3, 4's proofs.
7. Existing orchestrator unit tests (`generate-phrase-batch.orchestrator.test.ts`,
   `grade-attempts.orchestrator.test.ts`) re-run to confirm the mocked-agent, non-concurrent, default
   code path (no transaction-related regression for the ordinary single-call case) — these already
   exist and should need at most a signature-shape update, not new cases, since default parameters
   keep the existing call shape working.
8. `docs/architecture/phrase-bank-mastery/as-built.mmd`/`.png` regenerated.
9. SCENARIO 5's e2e test authored by `/write-playwright-tests` against the existing action library
   (no new actions needed).

### Scope boundary

Out of scope for this plan:
- The pure mastery deriver logic itself (`packages/core/src/phrase-bank/phrase-bank.ts`) — unchanged.
- The second, smaller issue `review.md` named but explicitly did not escalate: grading's phrase-bank
  bookkeeping not being wrapped in its own error handling / lacking an idempotency key on
  `POST /attempts`. Real, but a distinct concern (request-level error handling, not
  concurrency/data-integrity) — left as a candidate for its own future wishlist item.
- Any change to `apps/web/` — this plan is backend-only; see "Files NOT touched."
- Migrating existing English practice data into post-anki (separate, already-listed wishlist item;
  irrelevant here since this plan is additive-only and touches no existing row values).

### Definition of Done — per layer

**Backend** (the only real layer for this plan — see "Files NOT touched"; frontend and
infrastructure are explicitly **N/A**: no UI code changes anywhere in this plan, and no cloud
resource/IaC/deploy-pipeline change — the migration is an application-level Drizzle migration only)

- `npm run db:generate:api && npm run db:migrate:api` completes with no errors against a clean
  local schema and produces a migration adding the FK on `phrases.target_phrase_bank_entry_id`
  and the two unique indexes described above.
- **Migration-diff proof (SCENARIO 1):** `npx vitest run apps/api/src/db/migrations.integration.test.ts`
  — against a freshly migrated e2e Postgres instance (all migrations including the new one applied),
  a raw-SQL `INSERT` with a dangling `target_phrase_bank_entry_id` throws a foreign-key violation
  (Postgres error code `23503`); a raw-SQL `INSERT` duplicating an existing `(subject_id, level,
  pack, sequence_number)` throws a unique violation (`23505`); a raw-SQL `INSERT` duplicating an
  existing `(subject_id, level, pack, lower(phrase_text))` — including a case/whitespace-only
  variation — throws a unique violation; and a genuinely different `phrase_text` in the same scope
  inserts successfully (the index doesn't over-match).
- **Race 1 proof — sequence numbers (SCENARIO 2):** `npx vitest run
  apps/api/src/practice/phrase-bank-concurrency.integration.test.ts` — two concurrent calls to
  `generatePhraseBatch` for the identical `subjectId`/`level`/`pack` (fired via `Promise.all`
  against the real e2e-stack test DB, mocked Mastra agent, not a mocked DB) **both resolve
  successfully first (`Promise.all`, never `Promise.allSettled`, no swallowed rejection — this is
  its own required assertion, not implied by the row count alone; see `scenarios.md` SCENARIO 2 for
  why a test that tolerates one rejection would pass vacuously)**, then produce 20 `phrases` rows
  total whose `sequenceNumber` values are 20 distinct integers with no duplicates — asserted via a
  real `SELECT sequence_number, count(*) FROM phrases WHERE ... GROUP BY sequence_number HAVING
  count(*) > 1` returning zero rows.
- **Race 2 proof — duplicate phrase-bank entries (SCENARIO 3):** in the same test file, two
  concurrent `generatePhraseBatch` calls whose mocked-agent responses both introduce the identical
  new target-phrase text **both resolve successfully first (same non-negotiable assertion as
  above)**, then produce exactly one `phrase_bank_entries` row for that text in that
  subject/level/pack scope — asserted via a real `SELECT count(*) ... WHERE lower(phrase_text) =
  lower($1)` returning `1`, and both calls' inserted `phrases` rows pointing at that same entry id
  (not one pointing at a second, orphaned entry).
- **Race 3 proof — lost mastery update (SCENARIO 4):** in the same test file, a seeded
  `phrase_bank_entries` row (`status: "practicing"`, all counters 0,
  `lastCorrectAtSentenceCount: null`, `scheduledForSentenceCount: null`) linked to two `phrases`
  rows at `sequenceNumber` 1 and 9 — verified against the actual deriver
  (`packages/core/src/phrase-bank/phrase-bank.ts`) to be non-adjacent regardless of which
  transaction's row lock is granted first, see `scenarios.md` SCENARIO 4 for the worked proof —
  graded by two concurrent `gradeAttempts` calls each returning a mocked "correct" verdict, **both
  resolve successfully first**, then end with `correctCountInCycle` reflecting both attempts (`2`,
  not `1`) and `masteryStage: 2` — asserted via a real `SELECT` — and exactly 2
  `phrase_bank_appearances` rows exist for that entry; a subsequent third sequential correct attempt
  at `sequenceNumber: 20` (chosen to be non-adjacent to either possible outcome of the concurrent
  pair — see `scenarios.md`) advances the entry to `status: "mastered"`, proving the mastery
  threshold reads the correctly serialized counter, not a stale one.
- **Design-integrity requirement (implementation-time, checked in review, not a separate automated
  test):** every DB call made from inside the `db.transaction(async (tx) => {...})` bodies in both
  rewritten orchestrators must take `tx` explicitly — a function silently falling back to its
  default `getDb()` parameter while inside a locked transaction is a bug (risks pool starvation
  against the `max: 4` connection pool, not just a correctness gap), not an acceptable convenience.
  See `architecture.md` and `discussion.md`'s "Second-pass red-team findings," Finding 2.
- Existing orchestrator/repo unit tests still pass unmodified in behavior:
  `npx vitest run apps/api/src/practice/generate-phrase-batch.orchestrator.test.ts
  apps/api/src/practice/grade-attempts.orchestrator.test.ts apps/api/src/practice/phrase-bank.repo.test.ts`
  — confirms the default (non-transactional-caller) code path for every existing mocked-agent case
  is unaffected by the new optional executor parameters.
- `npx tsc --noEmit` clean (per this project's standing quality gate) across `apps/api`.

**Frontend** — N/A. No frontend files are touched by this plan (see "Files NOT touched"). SCENARIO
5's e2e test exercises the existing, unmodified UI purely as a regression check that nothing broke
for the ordinary single-user flow; it is not proof of any frontend change, because there is none.

**Infrastructure** — N/A. No new cloud resources, IaC, or deploy-pipeline changes. The schema change
is an application-level Drizzle migration, proven above under Backend.

**E2E regression (SCENARIO 5, not a backend-layer claim — proves the UI is unaffected):**
- `@phrase-bank-concurrency-fix.S5` passes: opening `/practice/:subjectId` for a fresh subject still
  auto-generates a batch (`generating-batch-message` clears, `phrase-card-0`..`9` render), and
  submitting a chunk still returns graded results (`phrase-result-0`..`N` render) with no error
  surfaced — run against the project's e2e stack (`:3100` web / `:8031` api / `:5436` postgres,
  mock-openrouter), migrated to the tip of `apps/api/src/db/migrations/` including this plan's new
  migration.

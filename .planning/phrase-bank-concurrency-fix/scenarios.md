---
type: scenarios
branch: phrase-bank-concurrency-fix
task: Close the phrase-bank's concurrency and data-integrity gaps
state: confirmed
updated: 2026-07-28
---

# Scenarios: Phrase-bank concurrency and data-integrity fix

Proof-mechanism summary (see `playwright.md` for the full per-claim mapping): SCENARIO 1-4 are
proven by real-DB **vitest integration tests** — a Playwright browser context cannot fire two
genuinely concurrent, deterministic API calls against the same subject/level/pack tuple with
mocked-but-controllable LLM output the way a direct orchestrator-function call with a mocked Mastra
agent can. SCENARIO 5 is the one Playwright **e2e** scenario in this plan: it proves the normal
single-user flow still works after the migration and locking land — it does not and cannot prove
the concurrency claims themselves.

---

## SCENARIO 1 — Migration adds a real FK and two unique indexes; the DB rejects violations

**Narrative:** Today `phrases.targetPhraseBankEntryId` is a plain nullable text column with no
`REFERENCES` clause, `phrases.sequenceNumber` has no unique constraint, and
`phrase_bank_entries.phraseText` has no unique constraint. After this migration, all three are
DB-enforced: a dangling `targetPhraseBankEntryId`, a duplicate `(subject_id, level, pack,
sequence_number)`, or a duplicate `(subject_id, level, pack, lower(phrase_text))` are all rejected
by Postgres, not silently accepted.

**Acceptance:**

Layers: BE — yes (migration + schema.ts). FE — None (no UI surface). Infra — None (application-level
Drizzle migration, no cloud resource change).

```
Code:
  - apps/api/src/db/schema.ts: phrases.targetPhraseBankEntryId gains
    .references(() => phraseBankEntries.id, { onDelete: "set null" }).
  - apps/api/src/db/schema.ts: new uniqueIndex on phrases(subjectId, level, pack, sequenceNumber).
  - apps/api/src/db/schema.ts: new uniqueIndex on phraseBankEntries(subjectId, level, pack,
    lower(phraseText)) — expression index; see architecture.md for the drizzle-kit-generation
    caveat and the hand-edit fallback if the expression isn't auto-emitted.
  - New migration file under apps/api/src/db/migrations/, generated via
    `npm run db:generate:api` (never hand-written, never pushed).

Behavior:
  - Applying the migration against a schema with existing clean data (no violations) succeeds with
    no errors.
  - Applying the migration against a schema with a pre-existing violation (any of the three) fails
    loudly — this is correct behavior, not a bug to work around; see architecture.md's
    "Pre-migration safety check."
  - After migration: INSERT INTO phrases (..., target_phrase_bank_entry_id) VALUES (..., 'a
    nonexistent id') fails with a foreign key violation.
  - After migration: two INSERTs into phrases with the same (subject_id, level, pack,
    sequence_number) — the second fails with a unique violation.
  - After migration: two INSERTs into phrase_bank_entries with the same subject_id/level/pack and
    phrase_text differing only by case/whitespace (e.g. "Get to the bottom of" vs "get to the
    bottom of ") — the second fails with a unique violation, matching
    matchExistingPhraseBankEntry's existing case-insensitive trimmed comparison.
  - Two INSERTs into phrase_bank_entries with the same subject_id/level/pack but genuinely
    different phrase_text succeed — the unique index must not over-match.

Integration:
  - None beyond the DB itself — this scenario has no orchestrator/repo code path, it's the schema
    contract the other three scenarios' fixes depend on.

Observability:
  - None — a failed migration surfaces as a normal drizzle-kit/psql error at deploy time; no new
    logging needed.

Tests:
  [ ] apps/api/src/db/migrations.integration.test.ts — migration-diff proof: applies all migrations
      including the new one against a fresh e2e Postgres instance, then attempts each of the three
      violating INSERTs above via a raw pg client and asserts each throws (error code 23503 for the
      FK, 23505 for both unique violations); also asserts the two "differs only by case" and "two
      genuinely different phrases" cases above.
```

---

## SCENARIO 2 — Concurrent batch generation never produces duplicate sequence numbers

**Narrative:** Two tabs (or two API callers) request a phrase batch for the identical
subject/level/pack at effectively the same moment. Before this fix, both could read the same `MAX
(sequence_number)` and hand out overlapping ranges, corrupting the adjacency arithmetic the mastery
rule depends on. After this fix, the second call's write serializes behind the first's — it either
waits and then computes a correct, non-overlapping range, or (never, per this design) fails
outright; either way, no two `phrases` rows for the same subject/level/pack ever share a
`sequenceNumber`.

**Acceptance:**

Layers: BE — yes. FE — None. Infra — None.

```
Code:
  - apps/api/src/practice/generate-phrase-batch.orchestrator.ts: generatePhraseBatch reorders so
    the authoritative nextSequenceBase re-read + linkOrCreateTargetPhrases + insertPhraseBatch run
    inside one getDb().transaction(async (tx) => {...}), opened with
    `SELECT pg_advisory_xact_lock(hashtext(subjectId || level || pack))` as its first statement.
  - apps/api/src/practice/phrase-bank.repo.ts: nextSequenceBase, matchExistingEntryId,
    createPhraseBankEntry gain an optional trailing executor parameter (defaults to getDb()) so the
    orchestrator can pass `tx`.
  - apps/api/src/practice/practice.repo.ts: insertPhraseBatch gains the same optional executor
    parameter.

Behavior:
  - Input: two calls to generatePhraseBatch(subjectId, level, pack) with the identical
    subjectId/level/pack, fired concurrently (Promise.all), each backed by a mocked Mastra agent
    returning BATCH_SIZE (10) items with no due-entry echoes and no newTargetPhrase (isolates this
    scenario from race 2 — SCENARIO 3 covers the phrase-bank-entry race specifically).
  - **Required first assertion (not optional, checked before anything else):** both calls resolve
    successfully — `await Promise.all([...])` must not throw. Use `Promise.all`, never
    `Promise.allSettled`, and do not wrap the call in a try/catch that swallows a rejection. This
    matters because SCENARIO 1's unique index alone (with no working lock) would make the *losing*
    call's insert throw a 23505 unique-violation — if the test tolerated that rejection and only
    checked "no duplicates among whatever rows exist," it would pass vacuously on 10 successful rows
    plus one silently-dropped call, without the lock ever having done anything. Asserting both calls
    resolve is what actually proves the lock serialized them instead of one of them just failing.
  - Output (checked only after the above holds): 20 phrases rows total exist for that
    subject/level/pack afterward, with sequenceNumber values forming a contiguous set of 20 distinct
    integers starting at 1 (order between the two calls' ranges is not asserted — either call may
    land first — only that the two ranges never overlap and together are exactly 20 distinct
    values).
  - Edge case: a third sequential (non-concurrent) call after the two concurrent ones resolve
    starts its own range at 21, not at some stale earlier max — i.e. the DB is left in a state a
    normal follow-up call reads correctly.
  - Negative assertion: no phrases row has a NULL sequenceNumber, and no two rows share one (a real
    SELECT sequence_number, count(*) ... GROUP BY sequence_number HAVING count(*) > 1 returns zero
    rows).

Integration:
  - Both concurrent calls run against a real Postgres instance (the e2e docker-compose DB on
    localhost:5436, migrated to the tip of apps/api/src/db/migrations/ including SCENARIO 1's new
    migration) — not mocked, not an in-memory DB substitute. The Mastra agent call is mocked (same
    `vi.mock("../mastra/mastra.js", ...)` pattern the existing orchestrator tests already use) so
    the test is deterministic and makes no live LLM call.

Observability:
  - None new — existing `log.info({ subjectId, batchId, count, dueCount }, "phrase_batch_generated")`
    still fires once per call; no change needed for this scenario.

Tests:
  [ ] apps/api/src/practice/phrase-bank-concurrency.integration.test.ts — SCENARIO 2 case: fires
      Promise.all([generatePhraseBatch(id, level, pack), generatePhraseBatch(id, level, pack)])
      against the real test DB with a mocked agent, then runs a real SELECT afterward asserting 20
      total rows, 20 distinct sequenceNumber values, no gaps beyond the expected 1..20 range, and
      the GROUP BY HAVING count(*) > 1 duplicate check returns zero rows.
```

---

## SCENARIO 3 — Concurrent batch generation never creates a duplicate phrase-bank entry for the same phrase text

**Narrative:** Two concurrent generate calls for the same subject/level/pack both have their
(mocked) agent introduce the identical new target phrase text (e.g. two tabs both happen to surface
"drowning in work" as a new idiom in the same moment). Before this fix, both could miss each other's
not-yet-committed row and each create their own `phrase_bank_entries` row for the same expression,
silently splitting the learner's future correct answers across two entries and never letting either
reach mastery. After this fix, the second call's lookup — running inside the same locked transaction
as SCENARIO 2's fix — sees the first call's committed row and links to it instead of creating a
duplicate.

**Acceptance:**

Layers: BE — yes. FE — None. Infra — None.

```
Code:
  - Same code changes as SCENARIO 2 — this scenario is proven by the same locked-transaction
    change; linkOrCreateTargetPhrases already runs inside the same tx as the authoritative
    sequence-number read and the batch insert (see architecture.md's "single lock scope" decision).
    No additional production code beyond SCENARIO 2's.

Behavior:
  - Input: two calls to generatePhraseBatch(subjectId, level, pack) fired concurrently, each
    backed by a mocked agent whose first generated item has newTargetPhrase.text set to the
    identical string ("drowning in work") and no due-entry echoes.
  - **Required first assertion, same reasoning as SCENARIO 2:** both calls resolve successfully
    (`Promise.all`, no swallowed rejection) before any row is inspected — otherwise a passing "only
    one entry exists" check would be trivially true if one call's insert never happened at all.
  - Output: exactly one phrase_bank_entries row exists afterward for that subject/level/pack with
    phrase_text = "drowning in work" (case-insensitive/trimmed match, per
    matchExistingPhraseBankEntry's existing comparison).
  - Output: both calls' inserted phrases rows that were meant to tag this phrase have
    target_phrase_bank_entry_id pointing at that single entry's id — neither is null, neither
    points at a second, orphaned entry.
  - Edge case: the same two-concurrent-calls test also includes items with genuinely different
    newTargetPhrase.text values (not just the duplicate) — those must each still get their own
    distinct phrase_bank_entries row; the fix must not over-merge unrelated new phrases into one.
  - Negative assertion: a real SELECT count(*) FROM phrase_bank_entries WHERE subject_id = $1 AND
    level = $2 AND pack = $3 AND lower(phrase_text) = lower('drowning in work') returns exactly 1,
    not 2.

Integration:
  - Same real-DB, mocked-agent setup as SCENARIO 2 — this is one test file covering both races,
    since they're closed by the same transaction/lock, run as two separate `it` cases (or one case
    asserting both properties) to keep each assertion's failure message specific to the race it's
    checking.

Observability:
  - None new.

Tests:
  [ ] apps/api/src/practice/phrase-bank-concurrency.integration.test.ts — SCENARIO 3 case: same
      Promise.all shape as SCENARIO 2, with mocked agent responses that introduce a shared new
      phrase text; asserts the single-entry count and the both-phrases-point-at-one-entry claim via
      real SELECTs after both calls resolve.
```

---

## SCENARIO 4 — Concurrent grading against the same phrase-bank entry never loses a mastery transition

**Narrative:** A phrase-bank entry has been recycled into two different batches (or two chunks) a
learner is grading around the same moment — e.g. two tabs, or two rapid submit clicks each hitting
their own request. Before this fix, both requests read the entry's current counters, compute their
own "+1 correct" transition independently, and the second `UPDATE` silently overwrites the first's
— a learner could earn "mastered" and have it quietly lost, or (the case this scenario proves
concretely) a correct answer's contribution to the mastery count vanishes because the second write
didn't know about the first. After this fix, the second grading call's read blocks behind the
first's `FOR UPDATE` lock and sees genuinely current state, so both correct answers are reflected.

**Acceptance:**

Layers: BE — yes. FE — None. Infra — None.

```
Code:
  - apps/api/src/practice/phrase-bank.repo.ts: getPhraseBankEntriesByIds gains a
    `forUpdate: boolean` option (or a sibling `getPhraseBankEntriesByIdsForUpdate` function) that
    appends `FOR UPDATE` and orders by id (deadlock-avoidance — see architecture.md).
  - apps/api/src/practice/grade-attempts.orchestrator.ts: applyPhraseBankUpdates wraps its
    read-compute-write sequence in getDb().transaction(async (tx) => {...}) — entries are read via
    the FOR UPDATE variant inside tx, applyPhraseBankAttempts (pure, unchanged) computes outcomes,
    updatePhraseBankEntryAfterAttempt and insertPhraseBankAppearance are called with tx.

Behavior:
  - Input: a phrase_bank_entries row seeded directly (not via a live batch — this is
    integration-test setup, not the subject under test) at status "practicing", masteryStage 0,
    correctCountInCycle 0, incorrectCountInCycle 0, lastCorrectAtSentenceCount null,
    scheduledForSentenceCount null — linked to two distinct phrases rows at sequenceNumbers 1 and 9.
  - **Verified against the actual deriver** (`packages/core/src/phrase-bank/phrase-bank.ts`,
    confirmed during this planning session, not assumed): adjacency is
    `attempt.sequenceNumber === entry.lastCorrectAtSentenceCount + 1`. Starting from
    `lastCorrectAtSentenceCount: null`, whichever of the two concurrent attempts (sequence 1 or 9)
    is processed first is never adjacent (nothing is adjacent to `null`) and always increments. The
    second-processed attempt then compares its own sequence number against the *first* attempt's
    now-committed `lastCorrectAtSentenceCount` (either 1 or 9, depending on which transaction's
    `FOR UPDATE` lock is granted first — not asserted, deliberately): sequence 1 would only be
    "adjacent" to a prior value of 0 (never happens here), and sequence 9 would only be adjacent to
    a prior value of 8 (never happens here). **Neither possible ordering ever produces an adjacent
    second attempt** — this seed is safe and deterministic regardless of DB lock-grant order.
  - Two concurrent calls to gradeAttempts, each grading one of the two linked phrases with a mocked
    agent verdict of "Ok" (correct), fired via Promise.all.
  - **Required first assertion, same reasoning as SCENARIO 2/3:** both calls resolve successfully
    before either the entry row or the appearances table is inspected.
  - Output: after both resolve, the entry's correctCountInCycle reflects both correct attempts (2),
    not 1 — the specific, concrete claim a naive unconditional-UPDATE race would fail (last-write-
    wins would leave it at 1, since both transactions would have read correctCountInCycle = 0 and
    each independently computed 1). masteryStage is also 2 (not 1), by the same reasoning.
  - Output: exactly 2 rows exist in phrase_bank_appearances for this entry afterward (one per
    graded attempt) — no attempt's grading was dropped even though the entry-row update serialized.
  - Edge case: a third, sequential (non-concurrent) correct attempt at **sequenceNumber 20**
    (chosen because it is non-adjacent to both possible final `lastCorrectAtSentenceCount` values
    the concurrent pair could have left behind — 1+1=2 and 9+1=10 — so this step is deterministic
    regardless of which concurrent call committed first) advances the entry from masteryStage 2 to
    masteryStage 3, and status to "mastered" — proving the serialized counter from the concurrent
    pair is what the mastery threshold check reads, not a stale/lost value.
  - Negative assertion: no phrase_bank_entries row for this id was left with correctCountInCycle < 2
    after both concurrent grades resolve.

Integration:
  - Real Postgres (same e2e DB target as SCENARIO 2/3), mocked Mastra agent for the grade-batch
    call (existing `vi.mock` pattern), real transactions and real row locks — the property under
    test is a genuine Postgres locking behavior, not something a mocked DB client could
    demonstrate.

Observability:
  - None new.

Tests:
  [ ] apps/api/src/practice/phrase-bank-concurrency.integration.test.ts — SCENARIO 4 case: seeds one
      phrase_bank_entries row + two linked phrases rows directly via SQL, fires
      Promise.all([gradeAttempts(...), gradeAttempts(...)]) against the real test DB, asserts
      correctCountInCycle = 2 and phrase_bank_appearances count = 2 via real SELECTs, then makes one
      more sequential gradeAttempts call and asserts status transitions to "mastered".
```

---

## SCENARIO 5 — Normal single-user practice loop is unaffected (e2e regression)

**Narrative:** After the migration and the two locked-transaction rewrites land, a single learner
using the app normally — one tab, no concurrency — must see no behavior change: a batch still
generates, answering and submitting a chunk still grades and shows results. This is the one scenario
in this plan that a Playwright browser-driven test can meaningfully prove; it does not attempt to
prove any of the concurrency claims above (SCENARIO 1-4 already do, at the integration-test layer).

**Acceptance:**

Layers: BE — yes (exercised through the real API). FE — yes (real UI, real rendering). Infra — None.

```
Code:
  - No new frontend code. Reuses the existing practice UI and the two existing verification-repo
    actions (generatePhraseBatch, answerAndSubmitChunk) unchanged.

Behavior:
  - Opening /practice/:subjectId for a subject with no prior phrase-bank state still auto-generates
    a first batch and renders phrase-card-0 through phrase-card-9, same as today.
  - Filling in answers and submitting a chunk still returns graded results
    (phrase-result-0..N) with no error surfaced to the UI.
  - No behavior asserted about recycled badges or mastered indicators here — those are governed by
    the pure deriver, already covered by phrase-bank-mastery's own scenario suite, and out of scope
    for a concurrency fix that doesn't touch the deriver.

Integration:
  - Runs against the project's dedicated e2e stack (localhost:3100 web / :8031 api / :5436
    Postgres, mock-openrouter for the LLM call) — the standard post-anki verification-repo target,
    per project.json. Requires the new migration to have been applied to this e2e DB as part of the
    stack's normal migration step (no special handling — it's just the newest migration in the
    existing chain).

Observability:
  - None new.

Tests:
  [x] @phrase-bank-concurrency-fix.S5 — e2e test written (unchecked; /write-playwright-tests
      authors it)
```

---
type: spec
branch: migrate-english-practice-data
task: Migrate existing English practice data from english-advanced into post-anki
complexity: medium
state: confirmed
updated: 2026-08-04
---
<!-- Plan auto-confirmed by grand-loop -->

# Spec: Migrate existing English practice data into post-anki

### Implementation Phases

Single phase implementation. No FE work exists (SCENARIO 2 relies entirely on already-shipped UI),
no new infra, and the backend surface is one script with a handful of small, independently testable
modules — not large enough to warrant a phase split the way `phrase-bank-mastery` needed one.

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|--------------------|
| `deriveActivePhraseBankStatus` | `masteryStage: number`, `mode: "mixed" \| "isolation"` | `"new" \| "practicing" \| "struggling"` — checked in this order: `mode === "isolation"` → `"struggling"` (checked first — an incorrect source attempt sets `mode: "isolation"` and can drop `masteryStage` to 0 in the same update, so checking stage first would misclassify a just-failed phrase as `"new"`); else `masteryStage === 0` → `"new"`; else `"practicing"` | SCENARIO 2 |
| `renumberActiveEntrySchedule` | `currentMaxSequence: number` | `{ lastCorrectAtSentenceCount: null; scheduledForSentenceCount: number }` — `scheduledForSentenceCount` is always `currentMaxSequence` exactly (not `+1` — the next live batch reads `nextSequenceBase` *before* inserting its own rows, so it sees this same unchanged max; storing `+1` would make the entry fail `scheduledForSentenceCount <= currentSequenceNumber` on that first batch and only become due one batch later than intended); `lastCorrectAtSentenceCount` is **always `null`, regardless of whether the source ever recorded a correct rep** — never `currentMaxSequence` (see Decision 15: `applyAttemptToPhraseBankEntry` computes `isAdjacent` as `attempt.sequenceNumber === lastCorrectAtSentenceCount + 1`, and the recycled entry's first post-import attempt lands at exactly `currentMaxSequence + 1` — setting `lastCorrectAtSentenceCount = currentMaxSequence` would make that first correct answer register as adjacent and silently suppress its mastery-stage advance) | SCENARIO 3 |
| `assignSequenceNumbersByCreatedAt` | `phrases: { id: string; createdAt: string }[]`, `startingBase: number` | Same phrases, each with a `sequenceNumber` assigned in ascending `createdAt` order starting at `startingBase + 1` | SCENARIO 1, SCENARIO 10 |
| `buildImportId` | `prefix: string`, `sourceKey: string` | Deterministic id string (`` `${prefix}_import_${sourceKey}` ``) — never `newId()`'s random suffix | SCENARIO 4 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 (batch-practice phrases/attempts visible) | `migrate-english-practice-data.orchestrator.ts`, `migrate-english-practice-data.repo.ts`, `migrate-english-practice-data.derive.ts` | None | None |
| SCENARIO 2 (phrase-bank entries visible in existing panel) | `migrate-english-practice-data.orchestrator.ts`, `migrate-english-practice-data.repo.ts`, `migrate-english-practice-data.derive.ts`, `migrate-english-practice-data.source-json.ts` | None — existing `phrase-bank-panel.tsx`/`phrase-bank.api.ts` need no change | None |
| SCENARIO 3 (imported active entries become due) | `migrate-english-practice-data.derive.ts` | None | None |
| SCENARIO 4 (idempotent re-run) | `migrate-english-practice-data.repo.ts`, `migrate-english-practice-data.derive.ts`, `migrate-english-practice-data.orchestrator.ts` | None | None |
| SCENARIO 5 (dry-run mode) | `migrate-english-practice-data.orchestrator.ts`, `scripts/migrate-english-practice-data.ts` | None | None |
| SCENARIO 6 (fails loudly on missing credentials) | `scripts/migrate-english-practice-data.ts`, `migrate-english-practice-data.repo.ts` | None | None |
| SCENARIO 7 (single level for phrase-bank entries) | `migrate-english-practice-data.orchestrator.ts`, `migrate-english-practice-data.repo.ts` | None | None |
| SCENARIO 8 (quiz/curriculum files excluded) | `migrate-english-practice-data.source-json.ts` (reads only the two named files) | None | None |
| SCENARIO 9 (crash-safe resumability, insert order) | `migrate-english-practice-data.repo.ts`, `migrate-english-practice-data.orchestrator.ts` | None | None |
| SCENARIO 10 (per-level sequence renumbering) | `migrate-english-practice-data.repo.ts`, `migrate-english-practice-data.derive.ts` | None | None |
| SCENARIO 11 (collision with a live entry) | `migrate-english-practice-data.repo.ts` (imports `matchExistingPhraseBankEntry` from `@post-anki/core`) | None | None |
| SCENARIO 12 (phrase-bank sequence read ordered after phrase import) | `migrate-english-practice-data.orchestrator.ts`, `migrate-english-practice-data.repo.ts` | None | None |

### Files to create

```
apps/api/scripts/
  migrate-english-practice-data.ts               — thin CLI entry only: parses --dry-run, reads
                                                     env vars, calls runMigration() from the
                                                     orchestrator below, prints its summary
                                                     (SCENARIO 5, SCENARIO 6) — mirrors
                                                     seed-domain-nodes.ts's own split between a
                                                     thin scripts/ entry and its real testable logic
                                                     under src/

apps/api/src/migrate-english-practice-data/
  migrate-english-practice-data.derive.ts         — pure derivers listed above
  migrate-english-practice-data.derive.test.ts    — co-located Vitest cases, business language
  migrate-english-practice-data.source-json.ts    — reads + parses active-phrases.json and
                                                     mastered-phrases.json from SOURCE_LEARNING_DIR
                                                     (SCENARIO 8 — never touches the other JSON
                                                     files in that directory); also runs the
                                                     cross-file slug-id collision check (SCENARIO 4)
  migrate-english-practice-data.repo.ts           — source Neon reads (settings/phrases/attempts,
                                                     read-only pool against SOURCE_DATABASE_URL) +
                                                     target Postgres existing-row checks, the
                                                     pre-insert `matchExistingPhraseBankEntry`
                                                     collision check (SCENARIO 11), the
                                                     `subjects.kind` flip with fail-loud prerequisite
                                                     check (SCENARIO 1), the `languagePracticeSettings`
                                                     upsert (Decision 9), and inserts (against
                                                     DATABASE_URL) — exported, testable functions, no
                                                     top-level side effects on import
  migrate-english-practice-data.orchestrator.ts   — exported `runMigration({ dryRun })` — the real
                                                     read → derive → write sequence, in the required
                                                     order (SCENARIO 7, SCENARIO 12: all of a
                                                     level's `phrases`/`attempts` inserted before
                                                     that level's phrase-bank entries read
                                                     `currentMaxSequence`), the whole live write
                                                     wrapped in one transaction (see Decision 13)
  migrate-english-practice-data.integration.test.ts
                                                   — idempotency proof: seeds a local Postgres with
                                                     source-shaped fixture rows + fixture JSON, runs
                                                     the migration twice, asserts the second run
                                                     creates zero new rows (SCENARIO 4, SCENARIO 9).
                                                     Lives under `src/` specifically because
                                                     `vitest.integration.config.ts`'s `include` is
                                                     `src/**/*.integration.test.ts` — a file under
                                                     `scripts/` would never be picked up by either
                                                     vitest config (verified directly against both
                                                     `apps/api/vitest.config.ts` and
                                                     `apps/api/vitest.integration.config.ts`)
```

### Files to modify

```
apps/api/
  package.json  — add "migrate:english-practice-data": "node
                  --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx
                  scripts/migrate-english-practice-data.ts" (dry-run: append -- --dry-run)
```

### Data model changes

Not applicable — every target table already exists (`subjects`, `languagePracticeSettings`,
`phrases`, `attempts`, `phraseBankEntries`, `phraseBankAppearances`), shipped by the
`phrase-bank-mastery` plan. This script performs one `UPDATE` (flip `subjects.kind`) and a series of
`INSERT`s guarded by existing-row checks — no `db:generate`/`db:migrate` step is part of this plan.

### Documentation changes

`docs/architecture/phrase-bank-mastery.md`'s "Scope boundary" section currently lists "migrating the
source app's real practice history" as explicitly out of scope for that plan. During implementation,
that section is updated (merged into the current-state narrative, not appended as a changelog entry)
to remove that line from the out-of-scope list and add a short paragraph describing that a one-time,
human-run import script (`apps/api/scripts/migrate-english-practice-data.ts`, real logic under
`apps/api/src/migrate-english-practice-data/`) now exists to populate this table set from the
retired source app, run manually with source credentials supplied by the operator. No other domain
doc references this gap (`docs/architecture/english-batch-practice/review.md` was checked and does
not mention the source app or a deferred migration), so this is the only file touched.

### Decisions made autonomously

Safe, reversible defaults — either resolved by `plan-ie`'s own reconciliation rule, or classified
`safe-default` by `fork-classifier-factory` (ten-criteria run recorded below each item):

1. **Curriculum/quiz content banks excluded from migration scope.** `quiz-bank.json`,
   `sentences-30-40*.json`, `work-phrases-advanced.json`, `index.json` are generated
   curriculum/quiz content, not user practice history — outside what the wishlist's own "done when"
   criterion asks to preserve. `fork-classifier-factory` verdict: `safe-default` (no criterion
   true — doesn't change any unspecified business behavior; a reasonable, reversible, pattern-
   following default exists and is exactly this exclusion).
2. **`phrase_bank_appearances.phraseId` uses a synthetic sentinel id — `` `pbahist_${entrySlug}_${index}` `` —
   never `newId()`'s random suffix, and deliberately NOT sharing the `phrase_import_` prefix real
   migrated `phrases` rows use.** Verified directly (`apps/api/src/practice/phrase-bank.repo.ts`,
   `packages/core/src/mastery/mastery-state.ts`) that `phraseId` on this table is write-only —
   nothing in the codebase ever reads it back for scheduling or display, so no fabricated `phrases`
   row is needed to back it (that would need invented `russian`/`referenceEnglish` text that never
   existed, polluting the real `phrases` table for a field nothing reads). The distinct `pbahist_`
   prefix (rather than reusing `phrase_import_`) keeps this sentinel visibly unrelated to a real
   phrase id — it deliberately does NOT match Decision 3's `_import_` rollback sweep, which is fine
   since the sentinel is never a row's own id and is deleted along with its parent
   `phrase_bank_appearances` row regardless of what value it holds. `fork-classifier-
   factory` verdict: `safe-default` (initially flagged `genuine-fork` before the write-only fact was
   confirmed by reading the repo/deriver code directly; reclassified once verified — see `todo.md`'s
   Resolved section).
3. **Deterministic, prefixed ids instead of `newId()`'s random suffix.** Every migrated row's own id
   (its real primary key — never to be confused with Decision 2's sentinel, which fills a *different*
   column) is `` `${prefix}_import_${sourceKey}` `` — `phrase_import_<source-phrase-uuid>`,
   `attempt_import_<source-attempt-uuid>`, `pbe_import_<source-slug>`, and
   `pba_import_<source-slug>_<index>` for a `phrase_bank_appearances` row's own id. Required for the
   idempotency guarantee (SCENARIO 4); `newId()`'s random suffix cannot support a natural-key
   existence check on a second run. A deliberate, documented deviation from the `newId()` convention
   every other post-anki write path uses, scoped only to this one-time script. A rollback (see
   `architecture.md`'s Rollout) sweeps every table's own id `LIKE '%_import_%'` — this covers all
   four tables' own rows uniformly; it does not need to touch Decision 2's `phraseId`-column
   sentinel at all, since that sentinel is never a row's own id and gets deleted along with its
   parent `phrase_bank_appearances` row regardless of what value it holds.
4. **`--dry-run` CLI flag, a deviation from `seed-subjects.ts`/`seed-domain-nodes.ts`'s existing
   convention (neither has one).** Required by this task explicitly, since live source credentials
   are not available in the planning/build environment — "code first, access later" needs a way to
   prove the mapping logic is correct without ever connecting to the live source database.
5. **`batchId` for migrated phrases is `` `import_${sourceBatchId}` ``.** `batchId` has no
   uniqueness constraint (a plain grouping label), so collision is not a real risk either way; the
   prefix is purely for human traceability back to the source batch when spot-checking.
6. **`phrases.createdAt`/`attempts.createdAt` are set explicitly from the source's original
   timestamps**, not defaulted to import time — historical dates stay accurate for anyone reading
   them later, and nothing about the target schema requires `createdAt` to reflect insert time.
7. **`phrase_bank_appearances.createdAt` is best-effort interpolated** between the source entry's
   `added` and `lastAttempt`/`masteredDate` fields (no per-appearance date exists in the source).
   Low-stakes: this column is display/provenance-only, confirmed unread by any live logic (see
   Decision 2's verification).
8. **Migrated `phrases` rows always get `targetPhraseBankEntryId: null`.** The source app never
   linked its batch-practice phrases to its separate phrase-bank concept — that link is a
   post-anki-only design introduced after the source app was already retired-in-practice. No source
   data exists to populate this field with, so `null` (untracked phrase) is the only honest value.
9. **`languagePracticeSettings` write is an upsert**, not a plain insert — `getOrCreatePracticeSettings`
   may have already lazily created a default (`B1_B2`/`General`) row for the English subject before
   this script ever runs (e.g. if the subject was opened once after its `kind` flip but before this
   migration). The script must overwrite that default with the source's real last-known level, not
   skip because a row already exists.
10. **Phrase-bank text collisions with a live entry reuse the live app's own matcher
    (`matchExistingPhraseBankEntry` from `@post-anki/core`), never overwrite live progress.**
    Surfaced by an independent `grill-plan-ie` red-team pass: the target schema's partial unique
    index on `(subjectId, level, pack, lower(trim(phraseText)))` (excluding mastered rows) is
    invisible to this script's deterministic-id existing-row check — if the subject is opened live
    even once between the `kind` flip (SCENARIO 1) and the actual migration run, a live-created
    entry could collide with an imported one and crash the insert with a unique-violation. Fixed by
    running the exact same case-insensitive/trimmed match the live generation orchestrator already
    uses before every phrase-bank entry insert; on a match, the live entry's own
    status/mastery/schedule fields are left untouched (it may carry real live progress) and only
    the imported `phrase_bank_appearances` history is attached to it (SCENARIO 11).
    `fork-classifier-factory` verdict: `safe-default` (reuses an existing, already-tested matching
    function and pattern; fully reversible — attached appearance rows can be deleted by their
    import-id prefix without touching the live entry).
11. **`index.json`'s cached stats are not used for verification — read the two phrase-bank JSON
    files' actual entry counts instead.** Also surfaced by the red-team pass and independently
    confirmed by reading the files directly: `learning/index.json` reports `active: 6,
    totalPhrases: 8`, but `learning/active-phrases.json` actually contains 12 active entries
    (`totalPhrases` is actually 14) — the cache is stale relative to the real source data. The
    dry-run/live-run sanity-check instructions (Definition of Done, `architecture.md`'s Rollout)
    tell the human to compare against the JSON files' own `phrases.length`, never `index.json`.
12. **A slug id appearing in both `active-phrases.json` and `mastered-phrases.json` fails the
    script loudly before any writes**, rather than letting the second one's existing-row check
    silently treat it as an idempotent skip (SCENARIO 4's added check). No collision exists in the
    current 14-entry source dataset (verified directly), but nothing in the source app enforces
    this structurally, so the check stays in the script rather than being assumed.
13. **The entire live write is wrapped in one database transaction, not per-table transactions.**
    Given the source dataset's small size (dozens of rows, not thousands — verified directly: 12
    active + 2 mastered phrase-bank entries, and however many historical `phrases`/`attempts` rows
    exist), true all-or-nothing atomicity is simpler to reason about and safer for a one-time import
    of real historical data than partial-completion-plus-resume: either the whole live run succeeds
    and every table reflects it together, or a crash rolls back to exactly the pre-run state, with
    nothing partially visible in between. The idempotency guarantee (deterministic ids, Decision 3)
    still matters independently of this: it makes a full re-run after any failure (including one
    before commit, in which case a re-run just repeats the same insert) or after a prior *completed*
    run (a no-op) safe, without requiring resumption logic mid-run.
14. **Complexity: Medium, not Complex.** No new tables/columns, no new service, no new infra; the
    real complexity is concentrated in a small number of pure, independently testable derivers, not
    spread across services or layers. `grill-plan-ie` was still dispatched alongside grill-me despite
    being optional at Medium, given this touches real historical user data and a subagent's
    fresh-eyes pass is cheap insurance for a script that only runs once. Between the dispatched
    `grill-plan-ie` subagent (live-entry text collision, stale `index.json` reference, cross-file
    id-collision guard, sequence-read ordering) and two further review passes (off-by-one in the
    due-scheduling default, clause-order bug in status derivation, `scripts/` vs `src/`
    vitest-include mismatch, then the `isAdjacent` mastery-suppression bug and the mastered-import
    dedupe gap below), 9 real gaps were found and folded in directly — none left as findings only in
    conversation.
15. **Imported active entries always get `lastCorrectAtSentenceCount: null`, never a renumbered
    value.** Verified directly (`packages/core/src/mastery/mastery-state.ts`,
    `packages/core/src/phrase-bank/phrase-bank.ts`): `lastCorrectAtSentenceCount` exists solely to
    compute `isAdjacent` (`attempt.sequenceNumber === lastCorrectAtSentenceCount + 1`) on the entry's
    *next* attempt, and a correct-but-adjacent attempt does **not** advance `masteryStage`
    (`nextMasteryStage = isAdjacent ? masteryStage : masteryStage + 1`). Because SCENARIO 3 makes a
    recycled imported entry due on the very next batch — whose first assigned `sequenceNumber` is
    exactly `currentMaxSequence + 1` — storing `lastCorrectAtSentenceCount: currentMaxSequence` would
    make that very next correct answer register as adjacent and silently suppress the mastery advance
    the learner just earned. `null` is not a loss of real information: the source counter space
    cannot honestly be mapped into the target's at all (the same reasoning `scheduledForSentenceCount`
    already required), and `null` guarantees `isAdjacent` is `false` on that next attempt, letting a
    genuine recycle-and-succeed event count normally. Found on a second independent review pass,
    after the first pass's own fix to `scheduledForSentenceCount` (Derivers table) made this
    consequence checkable.
16. **The SCENARIO 11 live-entry text-collision check applies only to imported active (non-mastered)
    entries, never to mastered imports.** Verified directly:
    `matchExistingPhraseBankEntry` only excludes *candidate* rows already at `status: "mastered"`
    from matching — it does not exclude a *mastered import* from matching against a live
    `practicing`/`struggling`/`new` candidate. `mastered-phrases.json` entries carry no
    `appearanceHistory` at all (confirmed directly: their JSON shape has no `recycleSchedule` field),
    so SCENARIO 11's "attach imported appearances instead of inserting" fallback would attach nothing
    and the entire mastered record would be silently dropped. A mastered import always inserts
    directly as its own row instead — schema-legal regardless of any live entry's text, since the
    partial unique index on `(subjectId, level, pack, lower(trim(phraseText)))` explicitly excludes
    `status = 'mastered'` rows from the uniqueness constraint entirely. Found on the same review
    pass as Decision 15.
17. **Consistency-gate auto-confirmation.** Per the invoking task's explicit instruction for this
    overnight run, `state: draft` is flipped to `state: confirmed` in every plan file immediately
    once the consistency gate passes with zero gaps, without a human review step in between — the
    three genuine forks below remain queued in `todo.md` for human review regardless of this
    confirmation, since confirming the *plan* is separate from resolving those specific judgment
    calls.

### Genuine forks — classified by `fork-classifier-factory`, human review required before a live run

These three decisions change user-visible behavior beyond what the wishlist item specified, and no
default exists that is unambiguously the only reasonable one — `fork-classifier-factory` verdict:
`genuine-fork` for all three. No backing GitHub issue exists for this wishlist item, so per that
skill's Step 6, each is recorded here with its reasoning and the default this plan implements
provisionally, and queued in `todo.md`'s "Decisions to make" for actual human sign-off — never
silently resolved. The script isolates each behind one small, named function (see Derivers table)
so a different rule is a one-function edit, not a rewrite.

1. **Active phrase-bank status derivation** (`deriveActivePhraseBankStatus`). The source has no
   direct `status` field — only `masteryStage` (0-3) and `mode` (`mixed`/`isolation`). Implemented
   default, isolation checked first: `mode === "isolation"` → `"struggling"` (the source app's own
   concept for "just got this wrong, needs isolated retry" is the closest semantic match); else
   `masteryStage === 0` → `"new"`; else → `"practicing"`.
2. **Phrase-bank level assignment** (SCENARIO 7). The source JSON phrase-bank entries carry no level
   at all. Implemented default: every migrated entry is assigned the single level recorded in source
   `settings.level` at export time — the only level signal that exists, and the one that keeps
   `languagePracticeSettings` and the migrated entries in a mutually consistent scope.
3. **Sequence renumbering / due-scheduling for imported active entries** (`renumberActiveEntrySchedule`,
   SCENARIO 3). The source's local JSON "sentence number" counter and post-anki's `sequenceNumber`
   are two unrelated counter spaces with no way to reconstruct a true merged historical timeline.
   Implemented default: every imported `"struggling"`/`"practicing"` entry becomes due on the very
   next batch generated after import (`scheduledForSentenceCount` set to the scope's post-import max
   `sequenceNumber` exactly, `lastCorrectAtSentenceCount` always `null` — Decision 15, needed so the
   entry's first post-import correct answer isn't wrongly treated as adjacent to a fabricated prior
   position and doesn't silently miss its mastery-stage advance), rather than attempting to fabricate
   a precise historical position the data cannot actually support. Imported `"new"` entries are
   excluded from due-selection entirely, matching how a live brand-new entry behaves.

### Implementation order

1. `/tdd deriveActivePhraseBankStatus` — covers SCENARIO 2
2. `/tdd renumberActiveEntrySchedule` — covers SCENARIO 3
3. `/tdd assignSequenceNumbersByCreatedAt` — covers SCENARIO 1, SCENARIO 10
4. `buildImportId` (trivial, tested alongside the above in the same file)
5. `migrate-english-practice-data.source-json.ts` — reads + validates the two phrase-bank JSON files
   only (SCENARIO 8), cross-file slug collision check (SCENARIO 4)
6. `migrate-english-practice-data.repo.ts` — source Neon reads, target existing-row checks, target
   inserts, `nextSequenceBase` query reuse, subject `kind` flip with fail-loud prerequisite check
   (SCENARIO 6, SCENARIO 9), and the pre-insert `matchExistingPhraseBankEntry` collision check
   against live entries imported from `@post-anki/core` (SCENARIO 11)
7. `migrate-english-practice-data.orchestrator.ts` — `runMigration({ dryRun })` wiring everything
   together in the required order — all of a level's `phrases`/`attempts` fully inserted before that
   level's phrase-bank entries read `currentMaxSequence` (SCENARIO 12), the whole live write in one
   transaction (Decision 13), `--dry-run` branch (SCENARIO 5), summary output
8. `scripts/migrate-english-practice-data.ts` — thin CLI entry: env vars, argv parsing, calls
   `runMigration`, prints its returned summary
9. `migrate-english-practice-data.integration.test.ts` — idempotency proof against locally seeded
   source-shaped fixtures (SCENARIO 4, SCENARIO 9 — this is the Backend Definition of Done proof
   available without live source credentials)
10. `apps/api/package.json` — wire the `migrate:english-practice-data` script
11. `docs/architecture/phrase-bank-mastery.md` — update Scope boundary per Documentation changes
    above

### Scope boundary

Out of scope for this plan:
- Actually connecting to or running the script against the live source Neon database — no live
  source credentials are available in this build environment (see `todo.md`'s Manual steps). The
  script is written complete and correct; a human runs it live once `SOURCE_DATABASE_URL` is
  supplied.
- Migrating `quiz-bank.json`, `sentences-30-40*.json`, `work-phrases-advanced.json` (Decision 1).
- Any change to the source app (`english-advanced`) itself — read-only throughout.
- Archiving the source repo/worktree — the wishlist item's own "done when" criterion places this
  after the migration has run and been confirmed live, which this plan cannot do without live
  credentials.
- Resolving the three genuine forks above with anything beyond a provisional, clearly-isolated
  default — final sign-off is a human decision, tracked in `todo.md`.

### Definition of Done — per layer

**Backend**
- Dry-run mode output (no live source credentials required — see `todo.md`'s Manual steps): running
  `npm run migrate:english-practice-data -w @post-anki/api -- --dry-run` against a locally seeded
  Postgres containing source-shaped fixture rows (the same fixtures the integration test below
  seeds) and a fixture `SOURCE_LEARNING_DIR` prints a per-table summary — e.g. `phrases: 12 to
  create, 0 already present`, `attempts: 12 to create, 0 already present`, `phrase_bank_entries: 6
  to create (4 active, 2 mastered), 0 already present`, `phrase_bank_appearances: 9 to create` —
  plus one sample derived row (a phrase-bank entry showing its derived `status`, `level`, and
  `scheduledForSentenceCount`), and issues zero `INSERT`/`UPDATE` statements (verified by asserting
  row counts are unchanged in the fixture database before/after the dry run). `--dry-run` still
  requires both `SOURCE_DATABASE_URL` and `DATABASE_URL` to be set and reachable, since it needs to
  read real current state from both to compute an accurate summary — it is not a no-connection mode
  (SCENARIO 6).
- Idempotency proof: `npx vitest run apps/api/src/migrate-english-practice-data/migrate-english-practice-data.integration.test.ts`
  — seeds a local Postgres with source-shaped fixture data (a fixture `settings`/`phrases`/
  `attempts` set plus fixture `active-phrases.json`/`mastered-phrases.json` content), runs the
  migration twice in sequence against it, and asserts: (a) the first run creates the expected row
  counts in every target table; (b) the second run creates exactly zero new rows in every target
  table (row counts identical before/after the second run); (c) every migrated `phrases` row has
  `targetPhraseBankEntryId: null`; (d) an imported `"struggling"`/`"practicing"` phrase-bank entry's
  `scheduledForSentenceCount` equals that level's post-import max `sequenceNumber` exactly (not
  `+1`), and its `lastCorrectAtSentenceCount` is `null` (never a renumbered value — Decision 15);
  (e) an imported `"new"` entry is excluded when `selectDuePhrases`/`dueEntriesForScope` is called
  against the post-import state, at any `currentSequenceNumber`; (f) simulating that recycled
  entry's first post-import correct attempt (calling `applyAttemptToPhraseBankEntry` directly with
  `sequenceNumber: scheduledForSentenceCount + 1`, `verdict: "Ok"`) advances its `masteryStage` by
  one — proving the `isAdjacent` suppression bug found during planning (Decision 15) does not
  reappear; (g) a mastered import whose text matches a live (non-imported) active entry in the
  fixture inserts as its own separate `phrase_bank_entries` row rather than being silently dropped
  by the SCENARIO 11 collision check (Decision 16).
- What live-run proof looks like once `SOURCE_DATABASE_URL` is supplied (not performed in this
  build): running the script live once, then `SELECT count(*) FROM phrases WHERE id LIKE
  'phrase_import_%'` (and the equivalent for `attempts`, `phrase_bank_entries`,
  `phrase_bank_appearances`) against the real target database returns counts matching the source
  JSON files' own actual entry counts (`active-phrases.json`'s and `mastered-phrases.json`'s
  `phrases.length`) at run time — never `learning/index.json`'s cached stats, which were confirmed
  stale during planning (it reports 6 active/8 total against the real files' 12 active/14 total; see
  Decision 11). A second live run of the same command reports zero newly created rows.

**Frontend**
N/A — not touched. `PhraseBankPanel`/`phrase-bank.api.ts` already query `GET
/subjects/:id/phrase-bank` scoped by `(subjectId, level, pack)` and render Active/Mastered exactly
as needed (verified directly: `apps/web/src/practice/phrase-bank-panel.tsx`,
`apps/web/src/practice/phrase-bank.api.ts`). As long as migrated rows land in the currently-active
`(level, pack)` scope (SCENARIO 7), they appear with zero new frontend code. Runtime proof (once a
live run has happened): loading `/practice/:subjectId` renders `data-testid="phrase-bank-panel"`
with the imported entries visible under Active/Mastered — no new frontend test is added by this
plan, since no frontend code changes.

**Infrastructure**
N/A — not touched. No new cloud resources, IaC, or deploy pipeline changes; this is a one-time,
manually-run application script against two existing Postgres connection strings, matching
`docs/architecture/phrase-bank-mastery.md`'s own "New infrastructure: None" precedent for this same
feature area.

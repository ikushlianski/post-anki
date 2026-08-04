---
type: scenarios
branch: migrate-english-practice-data
task: Migrate existing English practice data from english-advanced into post-anki
state: confirmed
updated: 2026-08-04
---
<!-- Plan auto-confirmed by grand-loop -->

# Scenarios: Migrate existing English practice data into post-anki

## Business Scenarios

SCENARIO 1: Historical batch-practice phrases and attempts become visible through the existing app, not just the database

The human runs the migration script against the source Neon database (`settings`, `phrases`,
`attempts`) and the target post-anki Postgres. Every historical translation drill and its graded
attempt becomes a normal row the rest of the app already knows how to read.

What to verify:
- Before any data is written, the existing "English" subject's `kind` is flipped from its seeded
  default (`architecture-mentor`) to `language-practice` — every practice endpoint 400s with
  `not_a_language_practice_subject` until this happens. The script fails loudly if no subject named
  "English" exists yet, rather than creating one.
- Every migrated `phrases`/`attempts` row satisfies the same constraints a live-generated row does:
  `domain` (`Tech`/`SmallTalk`/`Everyday`), `verdict` (`Ok`/`NeedsReview`/`NeedsDeepDive`), and
  `level` (`A1_A2`/`B1_B2`/`C1_C2`) pass through unchanged, since these enums are byte-for-byte
  identical between the source app and post-anki.
- `pack` is always `"General"` — the only pack the source data has, and the only one baked into the
  target's unique indexes and the phrase-bank UI's default query scope.

SCENARIO 2: Active and mastered phrase-bank entries from the JSON files appear in the existing Phrase Bank panel

The learner opens `/practice/:subjectId` after the migration has run. `PhraseBankPanel`'s existing
`GET /subjects/:id/phrase-bank` call (already wired, already tested) returns the migrated entries
grouped into Active/Mastered exactly as it already renders today.

What to verify:
- Migrated entries land under the same `(subjectId, level, pack)` scope the panel actually queries:
  `level` = the single level value read from the source `settings` table at export time (the only
  level signal the source data has — the JSON phrase-bank files carry no level per entry), `pack`
  = `"General"`.
- Every migrated active entry gets an explicit `status` (`new`/`practicing`/`struggling`) derived
  from the source's `masteryStage`/`mode` fields, checked in this order: a source phrase currently
  in isolation (`mode === "isolation"`, meaning the learner's most recent attempt at it was wrong —
  `phrase-selector.ts`'s `updateRecycleSchedule` sets this flag *and* can drop `masteryStage` back
  to 0 on the same incorrect attempt) always imports as `"struggling"`, checked before the
  `masteryStage === 0` case — otherwise a recently-failed phrase would misclassify as `"new"` and
  lose that signal entirely. Only once isolation is ruled out does `masteryStage === 0` map to
  `"new"`; everything else maps to `"practicing"`.
- Mastered entries import with `status: "mastered"`, `masteryStage: 3`, `masteredAt` set from the
  source's `masteredDate`.
- Zero new frontend code is required for this — it is a data-visibility outcome of the panel
  already querying by scope, not a new UI surface.

SCENARIO 3: Imported active, non-`new` phrase-bank entries become selectable for recycling on the next batch, not permanently stuck

After import, the learner generates a new practice batch. The existing generation orchestrator
reads `nextSequenceBase` for the scope (the max `sequenceNumber` *before* this new batch's rows are
inserted — verified in `generate-phrase-batch.orchestrator.ts`, both the early prompt-building read
and the authoritative in-transaction re-read use this same pre-insert value) and passes it as
`currentSequenceNumber` into `selectDuePhrases`, which selects entries whose `status` is
`"struggling"` or `"practicing"` (never `"new"` — `selectDueMasteryEntries` in
`packages/core/src/mastery/mastery-state.ts` filters on exactly those two statuses) and whose
`scheduledForSentenceCount <= currentSequenceNumber`.

What to verify:
- Every imported `"struggling"`/`"practicing"` entry's `scheduledForSentenceCount` is set to the
  scope's post-import max `sequenceNumber` **exactly** (not `+1`) — because the very next live batch
  reads `nextSequenceBase` *before* inserting anything new, that read returns this same unchanged
  max, so `scheduledForSentenceCount <= currentSequenceNumber` only holds on the next batch if the
  two values are equal. Storing `max + 1` would make the entry fail that comparison on the very next
  batch and only become due one batch later than intended.
- Imported `"new"` entries are never selected by `selectDuePhrases` regardless of their schedule
  fields — that status is excluded from due-selection entirely by design (matching how a live
  brand-new entry behaves before its first attempt), so this scenario does not claim they become due.
- `scheduledForSentenceCount` is never left pointing at a source-side counter value that has no
  meaning in the target's counter space (the source app's local JSON "sentence number" and
  post-anki's `sequenceNumber` are two unrelated counters; copying the raw source number verbatim
  would leave entries permanently unreachable or falsely overdue since the moment they were created).
- `lastCorrectAtSentenceCount` is always set to `null`, regardless of whether the source ever
  recorded a correct attempt for that entry — never the same value as `scheduledForSentenceCount`,
  and never a raw, meaningless source number. This matters beyond honesty about missing data:
  `applyAttemptToPhraseBankEntry` computes `isAdjacent` as
  `attempt.sequenceNumber === lastCorrectAtSentenceCount + 1`, and the recycled entry's first
  post-import attempt lands at exactly `scheduledForSentenceCount + 1` (the next batch's first
  assigned sequence number) — storing the same value for both fields would make that very next
  correct answer register as adjacent, and an adjacent correct answer does not advance
  `masteryStage`. `null` guarantees `isAdjacent` is `false` there, so a genuine recycle-and-succeed
  event counts normally instead of silently doing nothing.
- This does not fabricate false historical precision: `phrase_bank_appearances` rows (write-only,
  never read back by any live scheduling logic — confirmed by inspecting `phrase-bank.repo.ts` and
  `mastery-state.ts`, which only read `phraseBankEntries`' own schedule fields) keep their original
  source `sentence` values as-is, documented as historical-only numbering, not comparable to the
  target's `sequenceNumber` space.

SCENARIO 4: The script is idempotent — re-running it after a partial or full prior run creates no duplicate rows

The human runs the script once, then (accidentally, or deliberately to re-verify) runs it again
against the same source and target databases.

What to verify:
- Every inserted row uses a deterministic id derived from a stable natural key in the source (the
  source `phrases`/`attempts` row's own uuid; the source JSON phrase-bank entry's own slug id, plus
  an appearance's array index) — never `newId()`'s random suffix, since that would defeat the
  natural-key check on a second run.
- A second run's existing-row check (`SELECT` by that deterministic id before `INSERT`) finds every
  row already present and inserts nothing new.
- A summary line reports created vs. skipped counts per table, on every run — first and repeat.
- Before processing, the script checks that no slug id appears in both `active-phrases.json` and
  `mastered-phrases.json` — a collision there would make the second entry's existing-row check
  silently treat it as "already imported" and drop it, indistinguishable from a legitimate
  idempotent skip. The script fails loudly naming the colliding id rather than silently dropping
  one entry's history.

SCENARIO 5: Dry-run mode reports exactly what would be imported without writing anything

The human runs the script with `--dry-run`, either because live source credentials aren't supplied
yet, or to sanity-check the mapping before trusting a live run.

What to verify:
- Every source read (Neon queries against `settings`/`phrases`/`attempts`, the two JSON file reads)
  and every derivation (status derivation, level assignment, sequence renumbering, id generation)
  runs exactly as it would in a live run.
- Zero `INSERT`/`UPDATE` statements are issued against the target database.
- The script prints a per-table summary (rows to be created vs. already-present) plus a small
  sample of derived output (e.g. one phrase-bank entry's derived `status`, `level`, schedule
  fields) so the human can sanity-check the mapping before ever supplying real source credentials.

SCENARIO 6: Missing source or target credentials fail loudly with an actionable message, not a silent no-op or a partial run

The script is invoked without `SOURCE_DATABASE_URL` (the source app's Neon connection string) or
`DATABASE_URL` (post-anki's own target Postgres connection string) set.

What to verify:
- The script exits non-zero immediately, before attempting any connection, naming exactly which env
  var is missing.
- `--dry-run` still requires both `SOURCE_DATABASE_URL` and `DATABASE_URL` to be set and reachable —
  it needs to read real current state from both databases (existing-row checks, `nextSequenceBase`)
  to print an accurate "N to create, M already present" summary. The only guarantee `--dry-run`
  makes is that it issues zero `INSERT`/`UPDATE` statements against the target; it is not a
  no-connection mode.

SCENARIO 7: A source phrase-bank entry with no source-side level is still assigned one valid target level

Every JSON phrase-bank entry (active or mastered) carries no per-entry level field at all — the
source app only ever recorded one current level globally, in `settings`.

What to verify:
- Every migrated phrase-bank entry uses the single level read from source `settings` (id=1) at
  export time — the same level value used for the target subject's `languagePracticeSettings` row,
  so both land in a mutually consistent scope.
- The `languagePracticeSettings` write is an upsert, not skipped when a row already exists: a prior
  live open of the subject may have already lazily created a default (`B1_B2`/`General`) row via
  `getOrCreatePracticeSettings`, and this migration must overwrite that default with the source's
  real last-known level rather than leaving the default in place.

SCENARIO 8: Curriculum and quiz content banks are not migrated

`quiz-bank.json`, `sentences-30-40*.json`, `work-phrases-advanced.json`, and `index.json` exist in
the source `learning/` directory alongside the two phrase-bank files.

What to verify:
- The script never reads or writes anything derived from these files. Only `active-phrases.json`,
  `mastered-phrases.json`, and the three Neon tables (`settings`, `phrases`, `attempts`) are treated
  as migration input — these files hold generated curriculum/quiz content, not the user's own
  practice history, which is what the wishlist item's own "done when" criterion asks to preserve.

SCENARIO 11: An imported phrase-bank entry's text collides with a live entry created after the subject's kind flip but before the migration ran

The learner (or a stray test run) opens the English subject and generates a live batch after
SCENARIO 1's `kind` flip but before this migration actually runs. The live generation orchestrator
auto-creates a `phrase_bank_entries` row for a tagged target phrase, and that phrase's normalized
text happens to match one of the entries this migration is about to import — the target schema's
own partial unique index on `(subjectId, level, pack, lower(trim(phraseText)))` (excluding mastered
rows) would reject a duplicate insert.

What to verify:
- This check applies only to imported **active** (non-mastered) entries. Before inserting a new
  `phrase_bank_entries` row for an active import, the script performs the same
  case-insensitive/trimmed text match the live app itself uses
  (`matchExistingPhraseBankEntry`, `packages/core/src/phrase-bank/phrase-bank.ts`) against
  already-present entries in that scope — not only the deterministic-id existing-row check, which
  cannot see this collision at all.
- On a match, the script does not overwrite the live entry's current `status`/`masteryStage`/
  schedule fields (that entry may already carry real live progress that should take precedence) and
  does not insert a duplicate row. It attaches the imported historical `phrase_bank_appearances`
  rows to the existing live entry's id instead, so the historical record isn't silently dropped.
- No match → proceeds with a normal new-entry insert as in every other scenario.
- **Mastered imports never go through this check at all** — they always insert as their own row,
  even if their text matches a live active entry. `matchExistingPhraseBankEntry` only excludes
  already-mastered *candidates* from matching, not mastered *imports* from matching against an
  active candidate; and `mastered-phrases.json` entries carry no `appearanceHistory` to attach
  (their JSON shape has no `recycleSchedule` at all), so routing a mastered import through the
  "attach appearances instead of inserting" fallback would attach nothing and silently drop the
  entire mastered record. This is schema-legal unconditionally: the partial unique index on
  `(subjectId, level, pack, lower(trim(phraseText)))` excludes `status = 'mastered'` rows from the
  uniqueness constraint entirely, so a mastered import can never collide with anything.

SCENARIO 12: Phrase-bank sequence renumbering always reads the max sequence number after that level's phrases are fully migrated, never before

`renumberActiveEntrySchedule` (SCENARIO 3) needs `currentMaxSequence` for the phrase-bank entries'
target level — the same level scope that SCENARIO 1/SCENARIO 10's batch-practice `phrases` import
also writes into.

What to verify:
- The script's overall run order migrates all of a level's `phrases` rows (SCENARIO 1, SCENARIO 10)
  to completion before it computes `currentMaxSequence` for that level's phrase-bank entries — never
  reading a stale, too-low ceiling that would make an imported entry immediately overdue instead of
  "due next batch," contradicting SCENARIO 3's own intent.
- This ordering is enforced structurally (phrase-bank import is a later step in
  `migrate-english-practice-data.orchestrator.ts`'s `runMigration`, not a race the two steps could
  run in either order — and both steps execute sequential statements on the same transaction, so
  program order is execution order), not just documented.

## Technical/Architectural Scenarios

SCENARIO 9: A crash partway through the script leaves the target database in a clean, never half-migrated state

The script is interrupted mid-run (network drop to either database, process killed).

What to verify:
- The entire live write (every `phrases`/`attempts`/`phrase_bank_entries`/`phrase_bank_appearances`
  insert plus the `subjects.kind` flip and `languagePracticeSettings` upsert) is wrapped in one
  database transaction — a crash before commit rolls back to exactly the pre-run state, never a
  half-migrated intermediate visible to any reader (including the phrase-bank panel and any live
  batch generation that might run concurrently).
- Because every row's id is deterministic (SCENARIO 4), simply re-running the whole script after
  either a pre-commit crash (nothing was written; the re-run is a normal first run) or a genuinely
  completed prior run (every existing-row check finds its row already present; the re-run creates
  nothing new) is always safe — no manual cleanup, no partial-completion resume logic needed.
- Insert order respects the one situation where a real dependency exists within that one
  transaction: a `phrase_bank_entries` row must exist before any `phrase_bank_appearances` row that
  references it via `phraseBankEntryId`.

SCENARIO 10: Multiple historical levels in the source `phrases` table are each renumbered independently

The source Neon `phrases` table's `level` column can differ across historical rows — the learner
could have changed `settings.level` at different points in the source app's lifetime, and old
`phrases` rows keep whatever level they were generated at.

What to verify:
- Migrated `phrases` rows are grouped by their own historical `level` value (not forced to the
  single "current" level used for phrase-bank entries in SCENARIO 7).
- Each level group's `sequenceNumber`s are assigned independently, continuing from that level's own
  `nextSequenceBase` in the target (queried dynamically, not assumed to start at zero) — so a
  second, later migration run for a level that already has live-generated data does not collide
  with real sequence numbers.

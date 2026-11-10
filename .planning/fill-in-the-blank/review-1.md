# Review — fill-in-the-blank phases 1, 3, 4

**Verdict: needs-changes**

## Phase 1 — schema + migration

- `sentence text` column is present in `knowledgeBitQuestionVariants` after `answer`
  (`apps/api/src/db/schema.ts` line 1213), nullable, no default. Correct.
- `apps/api/src/db/migrations/0097_add-sentence-to-variants.sql` contains exactly
  `ALTER TABLE "knowledge_bit_question_variants" ADD COLUMN "sentence" text;`. Correct.
- `_journal.json` has `idx: 97`, `tag: "0097_add-sentence-to-variants"` as the last entry,
  immediately following idx 92. Correct.
- `db:migrate` was NOT run. Confirmed.
- **MISSING (plan steps 2–4)**: `insertQuestionVariant` in
  `knowledge-bit-question-variant.repo.ts` has no `sentence` parameter and does not pass
  it to the Drizzle insert. `recordGeneratedFillBlankVariant` in
  `knowledge-bit-fill-blank-claim.repo.ts` has no `sentence` parameter. The fill-blank
  generation orchestrator validates `result.sentence` but never passes it to
  `recordGeneratedFillBlankVariant`. The column is added to the schema and the migration
  creates it, but it is never written: every fill-blank variant will have `sentence = NULL`
  despite the plan requiring it to be persisted.

## Phase 3 — meta-orchestrator + route

- `generateKnowledgeBitBasicCards` is exported from
  `knowledge-bit-basic-card-generation.orchestrator.ts` and
  `generateKnowledgeBitFillBlanks` from
  `knowledge-bit-fill-blank-generation.orchestrator.ts`. Both imports in the orchestrator
  resolve to the correct files.
- The orchestrator awaits basic before fill-blank (sequential `await` chain). Correct.
- Controller returns 202 after finding the bit and fires `generateKnowledgeBitVariants`
  asynchronously; returns 404 without calling the orchestrator when `getKnowledgeBitById`
  returns null. Correct.
- Route entry for `generateKnowledgeBitVariants` uses pattern
  `POST /^\/knowledge-bits\/([^/]+)\/variants$/` (router-table.ts lines 391–396).
  There is no `POST /^\/knowledge-bits\/([^/]+)$/` catch-all in the table, so the ordering
  risk is moot; the terminating `$` on every existing dynamic knowledge-bits route
  prevents shadowing in any case.
- `generateKnowledgeBitVariants` union literal added to router.ts. `api-server.ts`
  import and switch case confirmed in impl-report; not re-read since tsc and tests
  pass without error.

## Phase 4 — tests

- `npx vitest run` on the two new test files: **5/5 passed**.
- All orchestrator cases covered: basic-before-fill order, combined counts, fill-blank
  skipped when basic throws.
- All controller cases covered: 202 on existing bit, 404 + no orchestrator call on
  missing bit.

## TypeScript

- `npx tsc --noEmit` produces zero errors in any file touched by this diff. All errors
  reported are in pre-existing wave-0093–0096 files (untracked), none in the new or
  modified files for phases 1/3/4.

## Resilience and security

- Fire-and-forget orchestrator call wrapped in `.catch()` that logs the error — no
  silent failure, no unhandled rejection, server not crashed by a generation error.
  Correct.
- `bitId` is used only to look up the existing row before any mutation; no user-supplied
  text is forwarded to the LLM in this diff. No injection surface added.

## Findings (worst first)

### BLOCKING: sentence column added to schema but never written (plan Phase 1 steps 2–4)

The plan's Phase 1 requires three code changes beyond the schema/migration:
- Add `sentence?: string` to `insertQuestionVariant` and pass it to the Drizzle values map.
- Add `sentence?: string` to `recordGeneratedFillBlankVariant` and thread it into `insertQuestionVariant`.
- Forward `result.sentence` from the fill-blank generation orchestrator into `recordGeneratedFillBlankVariant`.

None of these were done. `insertQuestionVariant` (`knowledge-bit-question-variant.repo.ts` line 23)
has no sentence parameter and does not include `sentence` in the insert values. Every
fill-blank variant generated will have `sentence = NULL` in the database, defeating the
purpose of adding the column. The column, the migration, and the schema change are correct;
the write path is simply absent.

Fix: add `sentence?: string` to `insertQuestionVariant`, include it in the values map (pass
`undefined` when not supplied so other callers are unaffected), add `sentence?: string` to
`recordGeneratedFillBlankVariant` and forward it, and forward `sentence.data` (from the
already-validated `sentence` result at orchestrator line 65) into the `recordGeneratedFillBlankVariant`
call at orchestrator line 81.

## Fix note (applied after review)

Added `sentence?: string` as a trailing optional parameter to `insertQuestionVariant` (repo) and `recordGeneratedFillBlankVariant` (claim repo), and forwarded `sentence.data` from the already-validated orchestrator result into `recordGeneratedFillBlankVariant`. `npx tsc --noEmit` produces zero new errors; 5/5 tests pass on the two new test files.


## Re-review: PASS

END-OF-REPORT

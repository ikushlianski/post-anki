---
type: spec
direction: data-integrity-under-regeneration
task: wh-question-retry-and-claim-concurrency
tier: Guarded
---

# Fix wh_question generation: claim concurrency + permanent-fail-mark bug

## The ask
Mirror, exactly, the fix already shipped for the fill-in-the-blank generation pipeline onto its
older sibling, wh_question generation. Two bugs, same root causes:
1. No claim — two concurrent scans can both pick up the same `knowledgeBits` row, both pay for an
   LLM call, both try to write.
2. Permanent failure — `whQuestionGenerationFailedAt` excludes a bit from the scan forever; no
   attempts-cap retry budget.

Reference implementation (already shipped, passing tsc/tests) to copy the pattern from:
- `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-claim.repo.ts`
- `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts`
- `apps/api/src/db/schema.ts` (fill-blank claim columns, ~lines 1099-1113)
- `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-claim.repo.integration.test.ts`
- `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-mark.repo.integration.test.ts`
- `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.test.ts`

## What to do
1. **Schema** — add 3 columns to `knowledgeBits` in `apps/api/src/db/schema.ts`, appended
   immediately after `fillBlankGenerationClaimToken` (Postgres appends new columns at the end of
   `ordinal_position` regardless of declaration order — matters for the snapshot test below):
   - `whQuestionGenerationAttempts` — integer, notNull, default 0
   - `whQuestionGenerationClaimedAt` — nullable timestamptz
   - `whQuestionGenerationClaimToken` — nullable text
   Generate the Drizzle migration; run it via the project's migrate script, never push directly.

2. **New repo file** `apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.ts` — mirror
   `knowledge-bit-fill-blank-claim.repo.ts` function-for-function, renamed for wh_question:
   - `listKnowledgeBitsForWhQuestionGenerationScan` (replaces
     `listKnowledgeBitsForQuestionGenerationScan`'s wh_question-specific body; keeps returning
     `KnowledgeBitForQuestionGenerationScan[]`, imported from `knowledge-bit-question-variant.repo.ts`
     — see item 3, that interface does NOT move)
   - `claimKnowledgeBitForWhQuestionGeneration` (random token via `newId()`, e.g. prefix `whgc`
     mirroring `fbgc` — NOT timestamp-based ownership)
   - `WhQuestionGenerationClaimLostError`
   - `markWhQuestionGenerated`, `markWhQuestionGenerationFailed` (both throw
     `WhQuestionGenerationClaimLostError` on zero rows affected)
   - `recordGeneratedQuestionVariant` gains a `claimToken` parameter (5th arg) and moves here
     from `knowledge-bit-question-variant.repo.ts` (still calls the shared `insertQuestionVariant`
     import from that file), wrapped in one `db.transaction` exactly like
     `recordGeneratedFillBlankVariant`
   - Reuse the same constants shape: `WH_QUESTION_GENERATION_MAX_ATTEMPTS = 3`,
     `WH_QUESTION_GENERATION_CLAIM_STALE_MINUTES = 10`

3. **Trim `knowledge-bit-question-variant.repo.ts`** — remove
   `listKnowledgeBitsForQuestionGenerationScan`, `markWhQuestionGenerated`,
   `markWhQuestionGenerationFailed`, `recordGeneratedQuestionVariant` (all moved to the new file).
   Leave in place, untouched: `insertQuestionVariant`, the embedding-scan functions, the
   answer-queue functions, AND the `KnowledgeBitForQuestionGenerationScan` interface — that
   interface stays declared here (do not move it), since
   `knowledge-bit-fill-blank-claim.repo.ts:6` already imports it from this exact file path and must
   keep doing so unchanged. The new wh-question claim file imports the same interface from here too.

4. **Orchestrator** `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts`
   — add the claim-before-LLM-call flow, mirroring
   `knowledge-bit-fill-blank-generation.orchestrator.ts`: claim first, skip if claim returns null
   (incrementing a new `skipped` field added to `QuestionGenerationScanCounts`, mirroring
   `FillBlankGenerationScanCounts`), try/catch around the LLM+write, catch calls
   `markWhQuestionGenerationFailed` with the claim token. Its three imports
   (`listKnowledgeBitsForQuestionGenerationScan` → `listKnowledgeBitsForWhQuestionGenerationScan`,
   `recordGeneratedQuestionVariant`, `markWhQuestionGenerationFailed`) all switch from
   `./knowledge-bit-question-variant.repo.js` to the new `./knowledge-bit-wh-question-claim.repo.js`,
   plus a new import of `claimKnowledgeBitForWhQuestionGeneration`.

5. **Ripple: every importer of the four moved/renamed functions must be updated.** Grep confirmed
   these as of this plan (re-grep at implementation time in case anything else has landed since):
   - `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts` — covered by
     item 4.
   - `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.test.ts` — its
     `vi.mock("./knowledge-bit-question-variant.repo.js", ...)` block and its
     `await import("./knowledge-bit-question-variant.repo.js")` line currently mock/import
     `listKnowledgeBitsForQuestionGenerationScan`, `recordGeneratedQuestionVariant`,
     `markWhQuestionGenerationFailed`. Both the mock block and the import must switch to
     `./knowledge-bit-wh-question-claim.repo.js`, with the scan function renamed to
     `listKnowledgeBitsForWhQuestionGenerationScan` and a new
     `claimKnowledgeBitForWhQuestionGeneration` mock added (mirrors exactly how
     `knowledge-bit-fill-blank-generation.orchestrator.test.ts` mocks
     `./knowledge-bit-fill-blank-claim.repo.js`).
   - `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts` /
     `.controller.test.ts` — only import/mock `generateKnowledgeBitQuestions` from the
     orchestrator, whose public export name and file location don't change. No edit expected here;
     confirm with a fresh grep before concluding it's untouched.
   - `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-mark.repo.integration.test.ts` — see
     item 6 below (disclosed cross-slug touch).
   If a fresh grep at implementation time surfaces any other importer not listed here, add it to
   this plan rather than silently touching it.

6. **Signature-compatibility touch (disclosed, unavoidable, minimal, out-of-slug)** —
   `recordGeneratedQuestionVariant` moves to the new file AND gains a `claimToken` parameter. Both
   changes break its one external caller:
   `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-mark.repo.integration.test.ts`'s test
   "allows a wh_question row and a fill_in_the_blank row to coexist for the same bit". This file
   belongs to the fill-blank review-factory slug, currently stuck (3 consecutive FAILs, no more
   auto-retries on that slug) — this task must NOT reopen that slug's scope beyond this one
   disclosed touch, which is exactly three edits, all in this one file:
   1. Its existing line (~40) `const { insertQuestionVariant, recordGeneratedQuestionVariant } =
      await import("./knowledge-bit-question-variant.repo.js");` changes to import
      `recordGeneratedQuestionVariant` from `./knowledge-bit-wh-question-claim.repo.js` instead —
      `insertQuestionVariant` stays imported from the original
      `./knowledge-bit-question-variant.repo.js` path, unchanged.
   2. Add a new import of `claimKnowledgeBitForWhQuestionGeneration` from
      `./knowledge-bit-wh-question-claim.repo.js`.
   3. In the test body (~line 289), obtain a token first —
      `const whClaimToken = (await claimKnowledgeBitForWhQuestionGeneration(bitId)) as string;` —
      then call `recordGeneratedQuestionVariant(bitId, "wh_question", 0, "Why?", "Because.",
      whClaimToken)`.
   Nothing else in that file changes — its fill-blank-specific assertions, imports, and other
   tests are untouched. Call this out explicitly in the implementation PR/review brief as an
   intentional, minimal, disclosed cross-slug touch (three edits, one test, no behavior change to
   the fill-blank coverage in the same file).

7. **Snapshot-test update** — `apps/api/src/db/migrations.integration.test.ts`'s `knowledge_bits`
   column snapshot (`toEqual` array, currently ending at `fill_blank_generation_claim_token` around
   line 590) must append the 3 new columns at the END, in real Postgres `ordinal_position` order
   (declaration order in schema.ts is irrelevant to this ordering):
   `wh_question_generation_attempts` (integer, NOT NULL), `wh_question_generation_claimed_at`
   (timestamptz, nullable), `wh_question_generation_claim_token` (text, nullable).

8. **Rewrite, not patch**: the scan test currently titled "returns exactly the bits with
   whQuestionGeneratedAt IS NULL AND whQuestionGenerationFailedAt IS NULL" in
   `knowledge-bit-question-variant.repo.integration.test.ts` encodes the OLD permanent-exclusion
   rule. Move it (rewritten) into the new claim integration test file (item 9), asserting the NEW
   rule: a failed bit under the attempts cap is still a scan candidate; a bit at/over the cap is
   excluded — mirroring the fill-blank scan test shape in
   `knowledge-bit-fill-blank-claim.repo.integration.test.ts`.

9. **Split integration tests** (mirror the fill-blank split, done from the start since one file
   would exceed 300 lines):
   - `apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.integration.test.ts` — scan +
     claim function coverage (mirrors `knowledge-bit-fill-blank-claim.repo.integration.test.ts`,
     244 lines).
   - `apps/api/src/knowledge-bit/knowledge-bit-wh-question-mark.repo.integration.test.ts` — mark +
     record function coverage (mirrors `knowledge-bit-fill-blank-mark.repo.integration.test.ts`,
     299 lines — that file is already right at the 300-line ceiling; if the wh-question equivalent
     runs over, split again, e.g. into a third `...record.repo.integration.test.ts` file, rather
     than exceeding 300 lines).
   - Remove the corresponding wh_question-specific describe blocks from
     `knowledge-bit-question-variant.repo.integration.test.ts` (currently 260 lines): the
     `listKnowledgeBitsForQuestionGenerationScan` block (rewritten into the new claim test file per
     item 8), the `recordGeneratedQuestionVariant` block (moved to the new mark test file). The
     `insertQuestionVariant + markWhQuestionGenerated` block covers two functions with different
     fates — `insertQuestionVariant` stays in `knowledge-bit-question-variant.repo.ts`,
     `markWhQuestionGenerated` moves to the new claim file. Split this describe block: keep an
     `insertQuestionVariant`-only test (its own coverage, e.g. "persists a wh_question variant row
     tied to the bit") in `knowledge-bit-question-variant.repo.integration.test.ts`, and move the
     `markWhQuestionGenerated`-specific assertions into the new mark test file. Do not drop either
     side's coverage. What remains in `knowledge-bit-question-variant.repo.integration.test.ts`
     after this: `insertQuestionVariant`'s own test, plus the untouched embedding-scan and
     answer-queue describe blocks.

10. **Orchestrator unit test** `knowledge-bit-question-generation.orchestrator.test.ts` (currently
    151 lines, 7 `it`s) — update mocks/assertions for the claim flow per item 5, add the
    "skip on lost claim" and "claims each bit independently" cases mirroring
    `knowledge-bit-fill-blank-generation.orchestrator.test.ts` (191 lines, 8 `it`s). wh_question has
    no blank-shape validation logic, so no format-validation split is needed here — confirm the
    updated file stays under ~300 lines before deciding otherwise.

## Files by scenario

| Scenario area | File(s) touched |
|---|---|
| Schema + migration | `apps/api/src/db/schema.ts`, new generated migration file |
| Scan/claim/mark/record functions | new `apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.ts` |
| Trim old repo (interface stays) | `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts` |
| Orchestrator claim flow + import switch | `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts` |
| Orchestrator unit tests (mock/import switch) | `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.test.ts` |
| New scan/claim integration tests | new `apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.integration.test.ts` |
| New mark/record integration tests | new `apps/api/src/knowledge-bit/knowledge-bit-wh-question-mark.repo.integration.test.ts` |
| Trim + split old integration tests | `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.integration.test.ts` |
| Column snapshot | `apps/api/src/db/migrations.integration.test.ts` (~line 590) |
| Disclosed cross-slug touch (3 edits, 1 test) | `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-mark.repo.integration.test.ts` |
| Confirm-only, expected no edit | `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts`, `.controller.test.ts` |

## Done when
- `npx tsc --noEmit` and the project's lint are both zero-issue.
- All new and updated tests pass, including the real-Postgres integration suite.
- No file outside the table above is touched, except the one disclosed cross-slug call-site update
  and anything a fresh grep surfaces per item 5 (must be added to this plan, not silently touched).
- The migration applies cleanly and is purely additive (no backfill, no data loss).
- wh_question generation now has the same claim-then-act and attempts-cap-retry behavior as
  fill-blank generation, verified by tests mirroring the fill-blank scenario coverage.

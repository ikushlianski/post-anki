---
type: todo
direction: data-integrity-under-regeneration
task: wh-question-retry-and-claim-concurrency
tier: Guarded
updated: 2026-09-25
---

## Decisions to make
- (none open — attempts cap (3) and staleness window (10 min) inherited from fill-blank with no
  stated reason to diverge; flag here only if implementation finds a real divergence need)

## To review/clarify
- (none open — spec.md's disclosed cross-slug touch is pre-cleared; implementer should still name
  it explicitly in the PR/review brief per spec.md item 5)

## Coding tasks
- [ ] Add `whQuestionGenerationAttempts` / `whQuestionGenerationClaimedAt` /
      `whQuestionGenerationClaimToken` columns to `knowledgeBits` in
      `apps/api/src/db/schema.ts`, appended after `fillBlankGenerationClaimToken`
- [ ] Generate the Drizzle migration and run it via the project's migrate script (never push
      directly)
- [ ] Create `apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.ts` mirroring
      `knowledge-bit-fill-blank-claim.repo.ts`: scan, claim, `WhQuestionGenerationClaimLostError`,
      `markWhQuestionGenerated`, `markWhQuestionGenerationFailed`, `recordGeneratedQuestionVariant`
      (now claimToken-gated, transactional) — import `KnowledgeBitForQuestionGenerationScan` and
      `insertQuestionVariant` from `knowledge-bit-question-variant.repo.ts`, do not redeclare them
- [ ] Trim `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts`: remove the four
      wh_question-specific functions now living in the new file; leave `insertQuestionVariant`,
      the `KnowledgeBitForQuestionGenerationScan` interface, embedding-scan, and answer-queue
      functions untouched (the interface must stay here — the fill-blank claim repo already
      imports it from this path)
- [ ] Update `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts` with
      the claim-before-LLM-call flow (claim, skip on null, try/catch, mark-failed with token on
      catch), add `skipped` to `QuestionGenerationScanCounts`, switch its 3 imports (scan/record/
      mark-failed) plus a new claim import to `./knowledge-bit-wh-question-claim.repo.js`
- [ ] Update `apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.test.ts`:
      switch its `vi.mock(...)` block and import line from `./knowledge-bit-question-variant.repo.js`
      to `./knowledge-bit-wh-question-claim.repo.js`, rename the scan mock, add a
      `claimKnowledgeBitForWhQuestionGeneration` mock, add skip-on-lost-claim and
      claims-each-bit-independently cases
- [ ] Re-grep `apps/api` for the four moved/renamed function names right before wrapping up, to
      catch any importer not already listed in spec.md item 5 (e.g. a route, cron handler, or
      script) — add anything found to this list rather than touching it silently
- [ ] Create `apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.integration.test.ts`
      (scan + claim coverage, mirrors the fill-blank claim integration test)
- [ ] Create `apps/api/src/knowledge-bit/knowledge-bit-wh-question-mark.repo.integration.test.ts`
      (mark + record coverage, mirrors the fill-blank mark integration test; split further if it
      would exceed 300 lines)
- [ ] Trim `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.integration.test.ts`:
      remove the `listKnowledgeBitsForQuestionGenerationScan` and `recordGeneratedQuestionVariant`
      describe blocks (moved to the two new files); split the shared
      `insertQuestionVariant + markWhQuestionGenerated` block — keep the `insertQuestionVariant`
      test here, move the `markWhQuestionGenerated` test to the new mark file
- [ ] Rewrite (not patch) the old "whQuestionGeneratedAt IS NULL AND
      whQuestionGenerationFailedAt IS NULL" scan test into the new claim integration test file,
      asserting the new attempts-cap-based rule instead of permanent exclusion
- [ ] Update the `knowledge_bits` column snapshot in
      `apps/api/src/db/migrations.integration.test.ts` (~line 590) to append the 3 new columns at
      the end, in real ordinal_position order
- [ ] Disclosed cross-slug touch (exactly 3 edits) in
      `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-mark.repo.integration.test.ts`: (1)
      switch the existing `recordGeneratedQuestionVariant` import from
      `./knowledge-bit-question-variant.repo.js` to `./knowledge-bit-wh-question-claim.repo.js`
      (keep `insertQuestionVariant`'s import unchanged), (2) add a new import of
      `claimKnowledgeBitForWhQuestionGeneration`, (3) in the "coexist" test body, obtain a token
      via `claimKnowledgeBitForWhQuestionGeneration(bitId)` and pass it as the 5th arg to
      `recordGeneratedQuestionVariant`. No other change to that file.

## Manual steps
- (none — migration runs via the existing migrate script as part of normal deploy)

## Post-deploy checks
- [ ] Confirm any pre-existing row with `whQuestionGenerationFailedAt` set now defaults
      `whQuestionGenerationAttempts` to 0 and is retryable again — this is the intended fix (the
      todo item's own text calls permanent failure "the bug"), but it means the next scan pass
      pays for up to `WH_QUESTION_GENERATION_MAX_ATTEMPTS` (3) LLM calls per previously-stuck bit;
      watch LLM spend on the first post-deploy scan cycle for an unusually large retry batch
- [ ] Confirm the migration applied cleanly with no downtime/lock issues (purely additive, no
      backfill expected to be slow)

## Resolved
- Judgment call (pre-cleared, recorded per spec's request): existing rows with
  `whQuestionGenerationFailedAt` already set will get `whQuestionGenerationAttempts` defaulted to
  0 by the additive migration, making them retryable again post-deploy. This is the intended
  behavior — the todo item's own text names permanent failure as "the bug" being fixed — not a
  side effect to guard against. Cost: up to `WH_QUESTION_GENERATION_MAX_ATTEMPTS` (3) LLM calls
  per previously-stuck bit on the next scan pass; see Post-deploy checks.

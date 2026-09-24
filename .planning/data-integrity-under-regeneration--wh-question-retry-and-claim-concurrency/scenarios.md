---
type: scenarios
direction: data-integrity-under-regeneration
task: wh-question-retry-and-claim-concurrency
---

# Scenarios — mirrors fill-blank claim/mark/scan/record coverage, adapted for wh_question

## Scan — listKnowledgeBitsForWhQuestionGenerationScan
- [ ] Excludes an already-generated bit (whQuestionGeneratedAt set), includes an untouched bit
- [ ] Includes a bit that failed once and is still under the attempts cap
- [ ] Excludes a bit that has hit the attempts cap
- [ ] Excludes a bit with a fresh, still-live claim from another in-flight scan
- [ ] Includes a bit whose claim is stale (older than the staleness window)

## Claim — claimKnowledgeBitForWhQuestionGeneration
- [ ] Claims an unclaimed candidate bit and stamps whQuestionGenerationClaimedAt + a fresh token
- [ ] Only lets one of two racing claims win, so a concurrent scan never double-charges an LLM call
- [ ] Refuses to claim a bit that already has a fresh claim
- [ ] Can re-claim a bit whose prior claim is stale
- [ ] Refuses to claim a bit that already hit the attempts cap

## Mark — markWhQuestionGenerated / markWhQuestionGenerationFailed
- [ ] Persists whQuestionGeneratedAt on read-back after marking a bit generated
- [ ] Persists whQuestionGenerationFailedAt on read-back after marking a bit failed
- [ ] Increments whQuestionGenerationAttempts and clears the claim on each failure
- [ ] Clears the claim on success without touching attempts or failedAt
- [ ] Never lets a stale scan's failure write clobber a bit a concurrent winner already generated
- [ ] Refuses a write once the claim has moved to another scan (throws
      WhQuestionGenerationClaimLostError), even before that scan resolves the bit either way
- [ ] Rolls back the transactional insert instead of orphaning a variant row when the claim is
      lost mid-transaction

## insertQuestionVariant (stays in knowledge-bit-question-variant.repo.ts, unmoved)
- [ ] Persists a wh_question variant row tied to the bit — coverage stays in
      knowledge-bit-question-variant.repo.integration.test.ts, not dropped when the
      markWhQuestionGenerated half of its old shared describe block moves out

## Record — recordGeneratedQuestionVariant (now claimToken-gated, moved to the new claim file)
- [ ] Inserts the variant and stamps whQuestionGeneratedAt in one transaction
- [ ] Rejects a second variant for the same bit/kind/slot via the unique index
- [ ] Allows a wh_question row and a fill_in_the_blank row to coexist for the same bit — the
      disclosed cross-slug call site in
      knowledge-bit-fill-blank-mark.repo.integration.test.ts, updated (3 edits: import switch for
      recordGeneratedQuestionVariant, new import of claimKnowledgeBitForWhQuestionGeneration, the
      call site itself) to pass a claim token obtained from
      claimKnowledgeBitForWhQuestionGeneration

## Orchestrator — generateKnowledgeBitQuestions
- [ ] Claims a bit before ever calling the LLM
- [ ] Skips (not fails) a bit when a concurrent scan already claimed it — no LLM call paid
- [ ] Claims each bit independently, so one lost claim doesn't stop the next bit from generating
- [ ] Marks a bit failed when the agent throws, and continues processing the next bit
- [ ] Marks a bit failed when the agent returns a blank question or answer
- [ ] Marks a bit failed when the transactional insert+mark write itself throws
- [ ] Caps the scan's batch size, leaving remainder bits unprocessed this call
- [ ] Never lets a markWhQuestionGenerationFailed write failure abort the rest of the batch

## Migration / schema
- [ ] Migration applies cleanly against real Postgres
- [ ] Column snapshot test reflects the 3 new columns appended at the end of ordinal_position
- [ ] Existing rows with whQuestionGenerationFailedAt set default whQuestionGenerationAttempts to
      0 and become retryable again (intended behavior, not a regression)

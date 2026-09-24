# Local todo — fill-in-the-blank-variant

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- review-factory stuck (3 FAILs) on claim-concurrency slug despite all gates now green — needs manual review, not auto-retry
- [x] Trim repo/orchestrator/schema comment blocks over the 2-line convention
- [x] Split knowledge-bit-question-variant.repo.ts (386 lines) under the 300-line limit
- [x] Make mark-generated/mark-failed throw on zero rows affected so a losing scan's insert rolls back
- [x] Guard mark-generated/mark-failed writes so a late scan can't clobber a concurrent winner's state
- [ ] Letter-adjacency check misses astral-plane letters split across surrogate pairs (disclosed non-blocker, not fixed)
- [x] Stop two concurrent scans double-charging and mismarking a bit as failed
- [x] Let a fill-blank generation failure be retried, not permanent
- [x] Add missing lower-one-eighth-block lookalike char, only 3 of 4 new lookalikes actually caught — apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:24
- [x] Fix answer-matches-sentence check misreading a literal dollar sign as a replace pattern — apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:91
- [x] Broaden unicode blank-lookalike coverage beyond the 6 originally tested chars — apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:18-28
- [x] Validate the generated answer actually matches the blanked term — apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:85-96, apps/api/src/mastra/knowledge-bit-fill-blank-generator.agent.ts (sentence field)
- [x] Check every unicode blank lookalike, not just the fullwidth one — apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:15-28
- [x] Reject punctuation-only, letter-touching, or multi-blank fill-in-the-blank prompts — apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts:37-60
- [x] Tighten blank-marker check: exactly one pure-underscore token, real surrounding text, identifiers like __dirname not mistaken for blanks — applied after review-factory went stuck, not independently re-reviewed
- [x] Fix blank-marker regex counting stray single underscores as extra blanks
- [x] Instruct the fill-blank agent that answer must equal the exact blanked term
- [x] Add fillBlankGeneratedAt/FailedAt columns on knowledgeBits, migration
- [x] Extend knowledgeBitQuestionVariantKindSchema with "fill_in_the_blank"
- [x] Add fill-blank-generator Mastra agent (cheap tier)
- [x] Add fill-blank scan/mark/record repo functions
- [x] Add fill-blank generation orchestrator (capped batch scan)
- [x] Wire POST /knowledge-bits/fill-blank-generation-scan trigger route
- [x] Tests: agent, orchestrator (success/failure/isolation/cap), route, repo integration

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond nullable defaults.

## Resolved
- None yet.

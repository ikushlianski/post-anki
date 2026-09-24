# Local todo — fill-in-the-blank-variant

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Tighten blank-marker check to a standalone exactly-4-underscore run with real surrounding text (rejects short/unicode second blanks and bare-blank prompts) — fixed after review-factory hit its 3-attempt budget on this slug and went stuck; this fix was applied directly and empirically verified (node -e against all known edge cases) but NOT independently re-reviewed
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

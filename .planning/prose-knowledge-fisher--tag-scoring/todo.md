# Local todo — tag-scoring

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Select knowledgeBitId in getQuestionVariantById
- [x] Wire tagIds lookup into grade-knowledge-bit-variant-answer orchestrator
- [x] Tests: repo, orchestrator (tags/no-tags/not-found paths), controller

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, additive response field only.

## Resolved
- Applied the fail-soft pattern proactively (before review, based on the earlier lesson from the
  follow-up-question item) — a tag-lookup DB error can't turn an already-graded, already-persisted
  answer into a 502. Independent review PASS, no findings.

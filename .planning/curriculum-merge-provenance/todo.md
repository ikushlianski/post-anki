---
type: todo
branch: curriculum-merge-provenance
task: "Fix #68 — make clearCurriculumStructure provenance-aware"
state: done
updated: 2026-07-31
---
# Todo: Make clearCurriculumStructure provenance-aware

## Decisions to make
- Nothing to decide. All forks resolved during planning (see spec.md's "Decisions made
  autonomously") — this is a well-specified fix with the review doc's proposed design already
  concrete, and no genuine no-safe-default architectural fork was found.

## To review / clarify
- Nothing to review.

## Manual steps
- [x] Run the generated migration against the local/e2e Postgres instance before running the new
  integration test (`drizzle-kit generate` then the project's migrate script) — standard for any
  schema change, no new secret/env var involved. Done: generated
  `apps/api/src/db/migrations/0027_true_kingpin.sql`, applied via
  `npm run db:migrate -w @post-anki/api` against `postgres://postanki:postanki@localhost:5436/postanki_e2e`
  (the already-running e2e docker-compose Postgres); confirmed both `modules` and `topics` gained
  `merged_from_curriculum_id` via `\d modules` / `\d topics`.

## Post-deploy checks
- [x] No post-deploy checks needed beyond the standard integration-test proof in spec.md's
  Definition of Done — this is an additive, backward-compatible schema change with no data
  migration and no behavior change for any curriculum that has never been part of a merge.
  Verified: new integration test file (4/4 passing, covering SCENARIOS 1-4) plus the full
  regression suite (12/12 passing) plus a clean `tsc --noEmit` across every workspace, including
  `@post-anki/shared` — confirming no shared type needed a new field.

## Implementation complete
- [x] Schema: `modules.merged_from_curriculum_id`, `topics.merged_from_curriculum_id` added
  (`apps/api/src/db/schema.ts`), migration generated and applied.
- [x] `clearCurriculumStructure` gained `{ includeMergedIn?: boolean }`, defaults to filtering out
  merged-in rows (`isNull` on both columns across its select + two deletes).
- [x] `mergeCurricula`'s `movedModules`/`movedTopics` updates now write the marker via
  `coalesce(existing, sourceId)`.
- [x] `deleteCurriculum` passes `{ includeMergedIn: true }` with an explanatory comment.
- [x] `curriculum-merge-provenance.integration.test.ts` written and green (SCENARIOS 1-4, including
  a gap-survival assertion on SCENARIO 1's surviving merged-in topic).
- [x] `docs/architecture/curriculum-merge/architecture.md` written.
- [x] Verified by direct grep (not inferred from the plan) that `clearCurriculumStructure`'s only
  callers anywhere under `apps/` are `reparseCurriculum`/`retryResearch` (no options — protective
  default) and `deleteCurriculum` (`{ includeMergedIn: true }`) — SCENARIO 5 fully proven.

gap-mastery-cascade-delete — Clean up orphaned gap_mastery rows on gap/topic/module/curriculum deletion
─────────────────────────────────────────────────────────────────────────────────────────────
S1  gap_mastery cascade delete (integration-only, not e2e per playwright.md)   PASS

1/1 scenario passes. Proven by apps/api/src/gap/gap-mastery-cascade-delete.integration.test.ts
(4/4 cases: deleteTopic, deleteModule, deleteModules bulk, clearCurriculumStructure via
deleteCurriculum — all confirm zero orphaned gap_mastery rows post-delete). Full API suite: 221
unit + 29 integration, all green. Standing Playwright regression corpus: 64/78 passed, 14
pre-existing failures unrelated to this branch's diff (see notes). No locked test assertion was
edited or softened.

Run mode: unattended sweep (Phase 7U), invoked non-interactively.

## Re-review context — post-hoc transaction-boundary fix

This is a fresh Phase 7U sweep run AFTER the item's original PASS (same file, prior content) was
already written. In between, a real bug found by a separate skeptical review step was fixed:
topic.repo.ts's deleteTopic wraps deleteLectureForTopic and deleteLectureSourceCandidatesForTopic
inside its db.transaction() block, but those two functions previously called getDb() internally
instead of accepting the transaction executor, so they ran outside the transaction despite looking
atomic. Fixed by adding an optional `db: DbExecutor = getDb()` parameter to both functions
(apps/api/src/lecture/lecture.repo.ts, apps/api/src/lecture/lecture-source-candidate.repo.ts) and
threading `tx` through from deleteTopic. This review re-confirms the target scenario and re-runs
the full regression corpus from scratch against that fix, rather than trusting the earlier PASS's
numbers unmodified.

**Target integration test — re-run fresh this session:**
```
cd apps/api && npm run test:integration -- src/gap/gap-mastery-cascade-delete.integration.test.ts
 ✓ src/gap/gap-mastery-cascade-delete.integration.test.ts (4 tests) 56ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```
Matches the task's claim exactly: 4/4 green.

**Full API suites — re-run fresh this session:**
- `npx tsc --noEmit` in apps/api: clean, zero errors.
- `npm run test:integration` (apps/api): 8 files, 29/29 passed.
- `npx vitest run` (apps/api, unit suite): 19 files, 221/221 passed.

**Standing Playwright regression corpus — re-run fresh this session (one full sweep, headless,
78 tests, ~9.5 min):**
```
  14 failed
  64 passed (9.5m)
```

## Gate tooling findings (not item defects) — carried forward, still true

1. review-playwright's own Phase 0/6 triage-aware behavior is correct: playwright.md explicitly
   lists S1 under "Not e2e (verified at unit/integration only)", mirroring the precedent already
   set by .planning/generalize-gap-tracking/scenarios.md SCENARIO 8. Phase 6 re-confirmed this on
   this run too — not treated as a missing e2e test, satisfied by the integration test.

2. The standalone completeness gate (npm run gate -- post-anki post-anki <ticket> --tier full) is
   triage-blind to playwright.md's "not e2e" list, and separately has two pre-existing tooling bugs
   (em-dash vs hyphen scenario-heading regex; e2e-command TICKET substitution incompatible with
   this project's run.sh + hardcoded playwright-results.json path). Per
   docs/anti-stop-framework.md this full-tier gate is tagged BUILT-NEVER-RUN and CI only runs the
   cheap tier. Not re-diagnosed this run since nothing about it changed; still not a block on this
   item.

## Regression corpus notes (64/78, 14 failures — re-confirmed this session, compared line-by-line
## against the prior run's 14)

This branch's diff (as of this re-review) touches five backend files, all deletion/transaction
paths only: apps/api/src/curriculum/curriculum.repo.ts, apps/api/src/gap/gap-mastery.repo.ts,
apps/api/src/module/module.repo.ts, apps/api/src/topic/topic.repo.ts, plus the new `db` parameter
threading in apps/api/src/lecture/lecture.repo.ts and
apps/api/src/lecture/lecture-source-candidate.repo.ts. Nothing here touches curriculum-creation
doc-research, resource-enrichment, tree-growth, stats, or tag/subject-merge — the features that
account for all 14 regression-corpus failures.

Failure-by-failure comparison against the previous run's 14:

| # | Test | This run | Previous run | Same? |
|---|------|----------|---------------|-------|
| 1 | curriculum/strict-order-toggle | FAILED (32.2s, stuck "shaping_structure"/ready-status assertion) | FAILED, same assertion class | identical |
| 2 | curriculum/study-technology-doc-url | FAILED (32.0s, same ready-status assertion) | FAILED, same assertion class | identical |
| 3 | resource-enrichment/enrich-accept-materializes | FAILED (ActionFailure: missing data-testid="generate-enrichment-button") | FAILED, same ActionFailure | identical |
| 4 | resource-enrichment/enrich-adds-new | FAILED ("enrichment_judgements" relation error) | FAILED, same DB error | identical |
| 5 | resource-enrichment/enrich-batch-accept | FAILED (same ActionFailure) | FAILED, same | identical |
| 6 | resource-enrichment/enrich-empty-state | FAILED (same ActionFailure) | FAILED, same | identical |
| 7 | resource-enrichment/enrich-redundant | FAILED (same ActionFailure) | FAILED, same | identical |
| 8 | resource-enrichment/enrich-reject | FAILED (same ActionFailure) | FAILED, same | identical |
| 9 | stats/streak-banner | FAILED (assertion mismatch on streak count) | FAILED, same assertion class | identical |
| 10 | ontology-split-merge suite | FAILED: tag/merge-tags-dedupe.test.ts (@ontology-split-merge.S3), 120s locator.fill timeout | FAILED: subject/merge-subjects-full-reassignment.test.ts (@ontology-split-merge.S1), 120s timeout | same failure MODE (120s timeout in the same suite), different sibling test — this alternation was already flagged as known flakiness in the prior review.md before this session started |
| 11 | tree-growth/grow-confirm-applies | FAILED ("poll timed out", 30.5s) | FAILED, same | identical |
| 12 | tree-growth/grow-empty-state | FAILED (ActionFailure: missing data-testid="grow-tree-button") | FAILED, same | identical |
| 13 | tree-growth/grow-first-doc-reconciles | FAILED ("poll timed out") | FAILED, same | identical |
| 14 | tree-growth/grow-rerun-guard | FAILED ("poll timed out") | FAILED, same | identical |

**13 of 14 failures are byte-identical to the prior run** (same test file, same error class). The
14th is the ontology-split-merge suite's pre-documented alternation between two sibling tests under
a shared 120s-timeout flakiness pattern — already called out in this file's own prior content, not
a new finding. **No new failure appeared anywhere in the corpus.** No fix-loop was run against these
14 — none touch this branch's changed-code surface, and the pattern is unchanged from the run
already on record before this session started. Flagging for separate triage rather than spending
this item's review budget on unrelated, pre-existing failures.

## Verdict

**PASS.** The target scenario (S1, integration-only) is 4/4 green, matching the task's stated
numbers exactly. Full API unit (221/221) and integration (29/29) suites are green, confirmed fresh
this session. The transaction-boundary fix (threading `tx` into deleteLectureForTopic and
deleteLectureSourceCandidatesForTopic) is a backend-only change with zero Playwright surface —
consistent with the regression corpus reproducing the exact same 14 pre-existing, unrelated
failures (13 identical, 1 alternating within an already-documented flaky suite) and zero new ones.

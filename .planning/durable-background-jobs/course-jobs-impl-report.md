# Item 2 (2a + 2b): durable course research implementation report

Paths under /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api. Nothing staged or committed. The cards sweep delay (6m) set by the orchestrator was left as is. J3 and J4 are untouched.

## Files
New (src/curriculum): curriculum-research-inngest.events.ts, .limits.ts, .workflow.ts; curriculum-research.steps.ts; curriculum-research-jobs.repo.ts; curriculum-research-marker.ts; curriculum-jobs.starter.ts.
New tests: curriculum-research-inngest.workflow.test.ts (8), curriculum-research-inngest.config.test.ts (7), curriculum-jobs.starter.test.ts (7), curriculum-research-marker.test.ts (2), curriculum-research-jobs.integration.test.ts (5, real Postgres).
New migration: src/db/migrations/0102_stale_alex_wilder.sql (+ meta snapshot and journal entry), generated with `npm run db:generate` and applied with `npm run db:migrate:api`.
Edited: src/db/schema.ts (curricula.researchTouchedAt), src/shared/durable-flags.ts, src/shared/env.ts, .env.example, src/api-server.ts (both functions registered), src/curriculum/curriculum-parse.orchestrator.ts (throwing variants), src/curriculum/curriculum.repo.ts (deleteAllCurriculumSources takes an optional executor, default unchanged), src/curriculum/curriculum.controller.ts (3 call sites).

## Behaviour
- DURABLE_COURSE_JOBS (default off) is in durable-flags.ts, the env schema (counts toward the signing-key rule) and .env.example. Off: startResearch and startRetryResearch just await the old researchCurriculum and retryResearch.
- researchCurriculumOrThrow and retryResearchOrThrow added; researchCurriculum and retryResearch are try/catch wrappers that set failed, as before.
- On, creation: the starter inserts the origin marker row (so the doc URL is not in the event) and touches the course, then sends curriculum/research.requested {curriculumId, retry}. Retry: the starter sets curating and touches, then sends with retry true. If the send fails, the marker is removed and the touch cleared, then the old in-process path runs.
- curriculum-research function: prepare (retry only: resolve the doc URL, clear structure, then delete sources and insert the marker in ONE transaction; then touch), gather (read the marker, delete pending rows, gather candidates, insert pending rows, return a count only), finalize (awaiting_source_approval and clear the touch). retries 1, concurrency [3, per course 1], singleton skip per course, throttle 6/1m burst 2, timeouts start 15m, finish 15m. onFailure sets failed only while the row is still curating, guarded by try/catch.
- curriculum-research-timeout handler: on cancel of that function, step.sleep 7m, then failStaleResearchJobs(20m).

## Timeout safety argument
Fact: curricula had no updatedAt or similar column (schema.ts curricula table), so a nullable research_touched_at was added. It is set by the starter at claim and by prepare, and cleared by finalize, onFailure and the sweep. In-process runs and other flows (merge, parse) never set it, so the sweep (status curating AND touch not null AND older than cutoff) cannot hit them.
- Queued job: the touch is at most start timeout (15m) old, else the engine cancels it. Live job: at most finish timeout (15m) old. Both are under the 20m cutoff by 5 minutes.
- Timed-out job (either kind): at sweep time its touch is at least min(15m,15m) + 7m = 22m old, which is over the 20m cutoff by 2 minutes, so it is failed.
- A new claim for the same course refreshes the touch, so a sweep triggered by an older cancel cannot fail it.
- Config test asserts both inequalities with a one-minute margin.

## Paid calls
Fact: gatherSourceCandidates calls resolveOfficialDocsUrl and gatherTrustedSourceCandidates (src/curriculum/source-candidates.ts:36-40), both model-backed. Throttle is 6/1m burst 2 instead of the plan's 10/1m; worst case per course is 2 attempts of gather.

## Tests
- `npx vitest run src/curriculum src/cards src/shared`: 31 files, 327 tests passed, 0 failed.
- Curriculum integration (pet-projects DB on 5999, `src/curriculum` pattern also matches curriculum-domain-mapping): 13 files, 75 tests passed, 0 failed, including the existing merge-concurrency, create-merge-race and clear-structure-provenance tests with the flag off.
- `npx tsc --noEmit` in apps/api: zero errors.

## Deviations from the plan
1. A new column and migration were needed (plan's fallback was active_run_id; a touch timestamp fits the sweep better).
2. Timeouts are 15m/15m with sweep 20m/7m, not 30m start; a 30m queue would break the sweep inequality.
3. Throttle 6/1m, not 10/1m (paid calls).
4. The creation marker lets gather derive the name from the marker title ("Auto-researched: <name>") and the doc URL from its value; no text goes in the event.
5. Retry in-process now logs curriculum_retry_research_failed instead of source_candidate_gathering_failed for a research error. The resulting status (failed) is unchanged.
6. New repo functions live in curriculum-research-jobs.repo.ts, not curriculum.repo.ts, which is already about 2000 lines.

## Defaults
Flag off; retries 1; concurrency 3 and 1 per course; throttle 6/1m burst 2; start 15m; finish 15m; sweep delay 7m; sweep cutoff 20m.

## Undone
- The domain-recommendation caller of researchCurriculum (domain-recommendation.orchestrator.ts:134) is still in-process; its test mocks the orchestrator. It is a third creation-style caller.
- A new curricula column now flows through any Electric live sync of curricula; the web app was not checked for strict row parsing.
- No live run against a real Inngest server.
- J3, J4 and their starters not started.

## Citation
The durable research function with its steps and singleton is at apps/api/src/curriculum/curriculum-research-inngest.workflow.ts:27-37. The flagged starters are at apps/api/src/curriculum/curriculum-jobs.starter.ts:56 and :84. The sweep is at apps/api/src/curriculum/curriculum-research-jobs.repo.ts:38. Registration is at apps/api/src/api-server.ts:365-366.

## Part 2c: J3 curriculum-draft

Paths under /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/curriculum unless noted.

### Files
New: curriculum-draft-inngest.events.ts, .limits.ts, .workflow.ts; curriculum-draft.steps.ts; curriculum-draft-jobs.repo.ts; curriculum-draft.starter.ts.
New tests: curriculum-draft-inngest.workflow.test.ts (11), curriculum-draft-inngest.config.test.ts (7), curriculum-draft.starter.test.ts (12), curriculum-draft-jobs.integration.test.ts (5, real Postgres).
Edited: curriculum-structure.ts (generateDraftStructure split into insertDraftPlaceholder, draftStructureOrThrow, and the unchanged-behaviour wrapper; finalizeStalePendingTurn exported), curriculum.controller.ts (three call sites), api-server.ts (function and handler registered), curriculum-jobs.starter.ts (cleanup guard), curriculum-jobs.starter.test.ts (+2 guard tests), curriculum.controller.test.ts (mocks gained generateDraftStructure and insertApprovedTextSource).

### Behaviour
- Flag DURABLE_COURSE_JOBS off: all three callers run the old code in the same order. On: the course is claimed (status shaping_structure plus the touch) before a curriculum/draft.requested {curriculumId, approve, retry} event is sent. A claim failure marks the course failed and surfaces the error.
- Function steps: begin (touch), approve (only when approve is true), finalize-stale (only on retry), placeholder (returns the turn id or "busy"; the id is memoized so a step retry never re-inserts), draft (model call, turn write and status in one step; returns only a status and a module count). A "busy" placeholder returns without any model call.
- retries 1, concurrency [2, per course 1], singleton skip per course, throttle 6/1m burst 2 (trusted search and architect agent are paid), timeouts start 10m and finish 10m.
- onFailure (try/catch guarded): sets the course failed and fails its pending turn with the existing message, only while the course is shaping_structure or curating.
- Pasted material: with the flag on, the approved text source is inserted before the 202 (insertPastedMaterialEarly) so no text goes in the event. If that insert fails the caller keeps the old after-202 insert-and-draft path. With the flag off the insert stays after the 202 as before.
- Medium fix: in curriculum-jobs.starter.ts the send-failure fallback now wraps removeMarker and release; if either throws the course is marked failed and the in-process path is skipped. The new draft starter has the same guard. Tests added for both research and draft paths.

### Safety argument
Meaning of research_touched_at fits: "last touch by a durable course job; null when none owns the row". Research uses it with status curating, draft with status shaping_structure, and each sweep only touches its own status, and finalize or draft completion clears it, so the two never overlap on a course. No new column.
- Queued job: touch at most 10m old (start timeout), else cancelled. Live job: at most 10m old (finish timeout). Cutoff is 15m, so an owned row is always at least 5m inside it.
- Start-timeout and finish-timeout cancels: at sweep time the row is at least min(10m,10m) + 6m = 16m old, over the 15m cutoff by 1m. Both cancels land on the same function id, so one handler covers both.
- The sweep also fails the latest pending turn so the learner sees a failed draft, not an endless pending one.
- Finish 10m is at most the 10m limit; it is above the 5m stalled threshold, so a live draft can show stalled and offer Retry. The retry is dropped by the singleton skip while the run lives (and the in-process path already behaves the same way through the pending-turn conflict).
- Config test asserts the declared timeouts, finish at most 10m, owned age + 1m margin at most cutoff, and timed-out age at least cutoff + 1m.

### Tests
- `npx vitest run src/curriculum src/cards src/shared`: 34 files, 359 tests passed, 0 failed.
- Curriculum integration (`src/curriculum` pattern also picks up curriculum-domain-mapping): 14 files, 80 tests passed, 0 failed, including the existing merge, race and provenance tests.
- `npx tsc --noEmit` in apps/api: zero errors.

### Deviations from the plan
1. The claim in the starter also sets status shaping_structure, so a timed-out pasted-material job (course still curating at creation) is covered by the shaping sweep.
2. Timeouts are 10m/10m with cutoff 15m and sweep delay 6m, rather than 15m draft limits from the plan's J3 (plan says 15m/10m).
3. Pasted-material starter takes a flag for whether the text was already inserted, because the early insert runs in the controller before the 202.
4. controller imports of generateCurriculumFromApprovedSources, generateDraftStructure, retryDraftStructure and insertApprovedTextSource were removed, since the starters own them now.

### Defaults
Flag off; retries 1; concurrency 2 and 1 per course; throttle 6/1m burst 2; start 10m; finish 10m; sweep delay 6m; sweep cutoff 15m.

### Undone
- J4 (parse, reparse, merge) not started.
- No live run against a real Inngest server; the draft step with a real model was not exercised end to end (the model path is covered by existing structure tests, steps by mocks and Postgres).
- A retry sent while a live draft is past 5 minutes is dropped silently by the singleton skip.

### Citation
The draft function with steps and singleton is at apps/api/src/curriculum/curriculum-draft-inngest.workflow.ts:26-36. The pasted-material starter is at apps/api/src/curriculum/curriculum-draft.starter.ts:120, called after the early insert at apps/api/src/curriculum/curriculum.controller.ts:245. The sweep is at apps/api/src/curriculum/curriculum-draft-jobs.repo.ts:58.

### Part 2c fix round

The draft step's busy branch now calls `finishDraftJob` (apps/api/src/curriculum/curriculum-draft.steps.ts), so a busy run no longer leaves a touch on a healthy shaping course for the sweep to fail. New integration test in curriculum-draft-jobs.integration.test.ts: a busy run leaves the touch null and the status unchanged. Draft integration file: 6 tests passing.

## Part 2d - curriculum parse, reparse and merge (J4)

Files (apps/api/src/curriculum):
- curriculum-parse-inngest.{events,limits,workflow}.ts: event `curriculum/parse.requested {curriculumId, mode}`, function plus cancel/timeout sweep handler.
- curriculum-parse.steps.ts: "prepare" (touch, clear structure on reparse) and "synthesize" (model call, save, status ready, one step, no text returned).
- curriculum-parse.starter.ts: startParse, startReparse, startMerge.
- curriculum-merge.orchestrator.ts: merge code moved out of curriculum-parse.orchestrator.ts (which was at the cap, now 234 lines), split into mergeSynthesizeOrThrow and the old wrappers. parseCurriculumOrThrow and reparseCurriculumOrThrow added in curriculum-parse.orchestrator.ts:55; old wrappers keep their try/catch-to-failed behaviour.
- Controller call sites (parse after creation, merge, reparse) now call the starters; both functions registered in api-server.ts.

Behaviour: flag off runs exactly the old in-process code. Flag on, the starter claims (sets the touch), then sends the event; merge saves the new sources first. If the send fails, the claim is released and the old path runs; if releasing throws, the course is marked failed and the in-process path is skipped. A claim failure marks the course failed and rethrows.

Safety argument: these jobs hold status `curating` and reuse the research touch column and sweep, so no new sweep. Cutoff 20m. Owned age is at most 15m (start or finish) plus 1m margin, under 20m. Youngest timed-out age is 15m + 7m delay = 22m, at least cutoff + 1m. Retries are 0 because saving a plan and rewriting modules are not repeatable. The synthesize step clears the touch in a finally block, so every exit clears it. `failResearchJob` now always clears the touch but changes the status only if it is still `curating` (curriculum-research-jobs.repo.ts), covering onFailure after a job already moved on. Concurrency [2, per course 1], singleton skip, throttle 6/1m burst 2, timeouts 15m/15m.

Tests: config 6, steps 4, starter 6, parse-jobs integration 3. Unit run `src/curriculum src/cards src/shared`: 37 files, 375 tests passing. Curriculum integration: 15 files, 84 tests passing (includes the merge-concurrency and create-merge-race tests). tsc: zero errors.

Deviations: no separate sweep (shared research sweep proven safe above); no separate workflow test with the replay engine, steps and options are covered directly. Defaults: legacy parse path counts as mode "parse". Undone: the domain-recommendation caller stays in-process; the lint run was not done in this round; controller test mocks needed no change.

END-OF-REPORT

```
# Plan: durable course jobs (cards + course research/outline)
Direction: durable-background-jobs. Engine: self-hosted Inngest 4.23 only.

## Verdict
- Build item 1 (cards) first. It is one function and one status column with an existing claim. The cards fan-out is also called from confirmStructure, so it is the most-triggered path.
- Item 2 is three functions with non-idempotent writes. Split it into 4 sub-items (below).
- Correction: startCardsForTopicsWithConcurrencyCap is defined in cards/cards.orchestrator.ts:99.
  curriculum-structure.ts:678 (confirmStructure) and learning-list/slice-release.ts:250 only call it.
- Correction: Inngest's function.cancelled event carries only {function_id, run_id}, not the original event.
  A timed-out run therefore cannot learn its topicId or curriculumId, so extraction encodes the run id in knowledge_sources.failureReason.
  Cards and curricula have no such column. See "Timeout handling".

## Flags (default off, in-process stays the default)
- New DURABLE_CARDS and DURABLE_COURSE_JOBS, parsed with parseDurableFlag (knowledge-bit/durable-extraction.config.ts).
  Do not reuse DURABLE_EXTRACTION. It is named for extraction, and one flag per area allows a staged rollout.
- Readers go in src/shared/durable-flags.ts. Each starter follows pipeline-kick.starter.ts:
  { isDurable, sendEvent, runInProcess }. Flag off runs in-process. Send throws, so fall back to in-process.
- Claim and status writes happen BEFORE the send, in the starter, in both modes.

## Shared cost bounds (every new function)
- retries is explicit per function. generateWithRetry already retries the model internally, so function retries multiply paid calls.
  Worst case for a job is (1 + retries) x generateWithRetry attempts.
- A global concurrency cap bounds parallel model spend. A throttle bounds spend per minute.
  A per-id concurrency key plus singleton "skip" stops a duplicate event from paying twice.
- Event payloads are ids only. Step return values must contain no text (see pipeline-kick test "should not return pass output text").
  Do not memoize an LLM plan or fetched source text as a step result.
  Keep the model call and the DB write in ONE step.

## ITEM 1: cards (build first). Files owned: src/cards/*

### Existing progress to respect
- topic_card_sets.status in generating | ready | failed (packages/shared/src/cards.ts). The web app shows these three.
- The claim is claimCardsGeneration, under withSubjectLock, in cards.orchestrator.ts:61. It writes "generating" via startGeneratingCards.
- hasCardsGeneratedOrInProgress treats "generating" rows older than 15 min (GENERATING_STALE_THRESHOLD_MS) as reclaimable.
- Behaviour risk: a job queued behind the concurrency cap keeps updatedAt from claim time.
  After 15 min a second trigger could re-claim and pay twice.
  Fix: the first step ("begin") touches updatedAt by re-asserting "generating". Keep finish timeout < 15m.
- compileCards swallows errors and writes "failed". Extract compileCardsOrThrow(topicId). compileCards = try { orThrow } catch { log; setCardsStatus failed }.
  The in-process path is then byte-for-byte unchanged. The durable function calls the throwing variant.
- replaceCardsContent is not one transaction (delete then insert), but it deletes first, so a re-run converges. Safe to retry.
```

```
### Jobs
- J1 cards-compile
  - Event: cards/compile.requested {topicId} in src/cards/cards-inngest.events.ts (eventType + staticSchema, as in pipeline-kick-inngest.events.ts).
  - Event id: `cards-${topicId}-${claimMs}`. Do not use idempotency "event.data.topicId": a deliberate regenerate within 24h would be dropped.
  - Steps:
    1. "begin": touch updatedAt, and assert the row is "generating". If it is not, return "skipped".
    2. "compile": compileCardsOrThrow minus the embedding. One step: model call, then replaceCardsContent. Returns {cards: n} only.
       Do NOT split the model call from the write. The plan holds card text, which would land in step output.
       A resume after a crash inside this step repeats at most one paid call.
    3. "embed": embedVariantsForTopic, errors swallowed and logged (existing behaviour: cards are usable without embeddings).
       Separate step, so a restart after "compile" never re-pays for generation.
  - retries: 1. Worst case 2 x generateWithRetry for one topic.
  - concurrency: [{ limit: 3 }, { key: "event.data.topicId", limit: 1 }]. The 3 equals CARDS_FANOUT_CONCURRENCY, which this replaces.
  - throttle: { limit: 30, period: "1m", burst: 3 }.
  - singleton: { key: "event.data.topicId", mode: "skip" }. The in-flight claim already blocks manual duplicates.
  - timeouts: { start: "30m", finish: "10m" }. A 40-topic course at 3-wide queues for roughly 7-10 min.
  - onFailure: setCardsStatus(topicId, "failed"). Guard it with try/catch + log, as in extraction onFailure.
  - cancelOn: skip. Topic deletion makes getTopicRow return null, so compile throws and onFailure no-ops on a cascade-deleted row.
- No separate fan-out function. The starter does the N claims (DB-only, cheap) then ONE client.send([...events]).
  This replaces the step.sendEvent fan-out suggested in report section 8: one fewer function and one fewer failure point.
  The Inngest concurrency cap replaces the Promise.all batching.
- Gap: a crash between claim and send leaves "generating" until the 15-min stale rule lets the next trigger re-claim. Same as today. Accepted.

### Status written on failure or cancel
- topic_card_sets.status = "failed" (the existing value; no new web values).

### Timeout handling
- Handler cards-compile-timeout, triggered by inngest/function.cancelled with an `if` on function_id (pattern in pipeline-kick-inngest.workflow.ts).
  It cannot map run_id to a topic, so it runs failStaleGeneratingCards(olderThanMs = finish timeout):
  UPDATE topic_card_sets SET status='failed' WHERE status='generating' AND updatedAt < now - 10m.
  Idempotent, bounded, no schema change. A live run touched by "begin" within the last 10 min is not hit.
  Add the repo function in cards.repo.ts.

### Starter and callers (src/cards/cards.starter.ts)
- startCardsForTopics(topicIds) replaces startCardsForTopicsWithConcurrencyCap at: curriculum-structure.ts:678 and learning-list/slice-release.ts:250.
- startCardsBackground(topicId) replaces the `void compileCards` at cards.orchestrator.ts:79 (maybeStartCardsInBackground).
- startCardsManuallyDurable replaces the dispatch at cards.orchestrator.ts:133 (startCardsManually).
  Its lock + result logic is unchanged, and only the dispatch line changes.
- Flag off: the existing code runs unchanged. The old fan-out function stays as the in-process implementation.
- Register cardsCompileFunction + the timeout handler in api-server.ts:350 (createInngestServeHandler list).
```

```
### Tests for item 1 (@inngest/test, mock ../mastra/*, ../cards/cards.repo.js)
- cards-inngest.workflow.test.ts (copy the pipeline-kick-inngest.workflow.test.ts shape; vi.mock log, dynamic import):
  - happy path: begin -> compile -> embed in order; model mock called once.
  - compile throws: run fails and onFailure calls setCardsStatus(topic,"failed").
  - resume: t.execute({ events, steps: [{ id: "compile", handler: () => ({cards: 3}) }] }). Assert the model mock is called 0 times (no repeated paid call).
  - embed throws: run still succeeds, status stays ready.
  - step results contain no card text.
- cards-inngest.config.test.ts (copy extraction-inngest.config.test.ts): retries, concurrency 3, timeouts, throttle, finish < 15m.
- cards.starter.test.ts (copy pipeline-kick.starter.test.ts): flag off runs in-process; flag on sends one batch; send throws falls back in-process; already-claimed topics are not sent.
- Update cards-fanout.integration.test.ts and cards-generation-concurrency.integration.test.ts: the claim semantics stay identical in both modes.

## ITEM 2: course research and outline. Files owned: src/curriculum/curriculum-*-inngest.*, curriculum-jobs.starter.ts

### Status columns and what the web app shows
- curricula.status in draft | curating | awaiting_source_approval | shaping_structure | ready | confirmed | failed (packages/shared/src/curriculum.ts).
  Failure writes "failed". The web app renders FailedBanner (web/src/curriculum/curriculum-lifecycle.tsx) with Retry research / Reparse / Retry draft.
- Existing progress persisted (flagged):
  - generateDraftStructure writes a "pending" placeholder row in curriculum_structure_turns FIRST.
    A unique index (isPendingTurnConflict) allows one in flight. updateStructureTurn flips it to complete or failed.
    draftProgressState reads it and shows "stalled" after STALE_PENDING_TURN_AGE_MS = 5 min.
  - researchCurriculum writes an origin-marker source row (web_research) first, and approved/pending source rows.
- Behaviour risks if split into steps:
  - The 5-min stall rule shows a queued or slow durable draft as "stalled" and offers Retry while the run is live.
    Keep draft finish timeout <= 10m. A queued job is a known gap, so cap draft concurrency so waits stay short.
  - retryResearch deletes the marker and sources before it re-researches. A step retry after that delete would lose docUrl and fall back to the bare name.
    "prepare" must read, resolve, clear and re-insert the marker in ONE step.
  - Creation passes docUrl only in memory (controller.ts:246-271). The durable starter inserts the marker row (insertResearchSource) synchronously first.
    The job then reads docUrl back from that row. Do the same for the pasted-material insertApprovedTextSource and for merge drafts (addCurriculumSources).
    These are text, which cannot go in the event. Moving these inserts before the 202 is the one deliberate change, and it makes failures visible earlier.
  - saveCurriculumPlan, deleteModules and the merge write are not idempotent. Do not split them across steps; give those jobs retries: 0.
- In every job, a throw ends in curricula.status = "failed". Never leave "curating" or "shaping_structure".

### Jobs
- J2 curriculum-research. Event curriculum/research.requested {curriculumId, retry: boolean}. Covers researchCurriculum + retryResearch (controller 246-271, 519).
  - Steps: "prepare" (marker; for retry also clear + resolve) -> "gather" (gatherSourceCandidates + insertPendingSources in one step; first delete any pending rows so a re-run does not duplicate) -> "finalize" (status awaiting_source_approval).
  - retries 1. Concurrency [{limit:3},{key:curriculumId,limit:1}], throttle {10/1m, burst 2}, singleton skip per curriculumId. Timeouts start 30m, finish 15m.
  - Fetched candidate text stays in the DB only (fetchedText is never a step output).
- J3 curriculum-draft. Event curriculum/draft.requested {curriculumId, approve: boolean, retry: boolean}. Covers generateCurriculumFromApprovedSources + retryDraftStructure + the pasted path (controller 246-271, 322, 558).
  - Steps: "approve" (approveAllPendingSources, idempotent; only when approve is true) -> "finalize-stale" (retry only) -> "placeholder" (insert the pending turn, return its id; on conflict return "busy" and stop) -> "draft" (trusted search + agent + updateStructureTurn complete + status shaping_structure; one step).
  - A step retry or resume reuses the memoized placeholder id, so it never hits the unique pending index.
  - retries 1 (safe: the placeholder is memoized and "draft" only writes at the end). Concurrency [{limit:2},{key:curriculumId,limit:1}]. Timeouts start 15m, finish 10m.
  - onFailure: fail the latest pending turn for the curriculum (message "The mentor couldn't draft a structure for this course.") and set status "failed". Both match what generateDraftStructure's catch does.
```

```
- J4 curriculum-parse. Event curriculum/parse.requested {curriculumId, mode: "parse"|"reparse"|"merge"}. Covers parseCurriculum, reparseCurriculum, mergeSourcesIntoCurriculum (controller 759, 811, 246-271 legacy path).
  - Steps: "prepare" (reparse: clearCurriculumStructure; merge: status curating) -> "synthesize" (read sources + model + save plan + status ready, one step).
  - retries 0 (non-idempotent writes; at most 1 x generateWithRetry). On crash the run ends failed through onFailure and the user uses the existing Reparse button.
  - Concurrency [{limit:2},{key:curriculumId,limit:1}]. Timeouts start 15m, finish 15m.
- Cancel/timeout handler curriculum-jobs-timeout: on inngest/function.cancelled for J2/J3/J4 ids, set failed on curricula in curating or shaping_structure older than the finish timeout.
  First check curricula has an updatedAt column. If it does not, add a nullable active_run_id column (small migration) instead, as extraction does with failureReason.
- Extract throwing variants (researchOrThrow, parseOrThrow, mergeOrThrow, draftOrThrow) and keep the existing wrappers as try/catch -> failed. The in-process path stays identical.

### Callers to switch (all in curriculum.controller.ts, behind the flag)
- researchCurriculum x2 and parseCurriculum at 246-271; the pasted path at 249 (insertApprovedTextSource then generateDraftStructure).
- generateCurriculumFromApprovedSources at 322 (its own dispatch-failure catch already writes failed; the starter keeps that on a failed send).
- retryResearch at 519, retryDraftStructure at 558, mergeSources at 759, reparse at 811.
- Starter functions in curriculum-jobs.starter.ts: startResearch, startDraft, startParse, each following the pattern in pipeline-kick.starter.ts.
- Register all 3 functions + the timeout handler in api-server.ts.

### Tests (per job, same shape as item 1)
- Workflow tests: happy path; throw ends status "failed" via onFailure; resume with a mocked memoized "draft" or "synthesize" step means the model mock runs 0 times;
  J3: placeholder id is reused and busy returns without a model call; J2: retry resolves docUrl before clearing; step results carry no text.
- Config tests: retries (research 1, draft 1, parse 0), concurrency keys, timeouts, J3 finish <= 10m.
- Starter tests: flag off in-process, flag on send, send throws falls back in-process, marker/source rows inserted before the send.
- Existing curriculum *.integration.test.ts (merge-concurrency, create-merge-race) must pass with the flag off, unchanged.

## Sub-items (1-2h each, in build order)
1a (1.5h) Cards: events, limits, compileCardsOrThrow, cardsCompileFunction, workflow + config tests. cards/cards-inngest.*, cards.orchestrator.ts.
1b (1h) Cards: durable-flags.ts, cards.starter.ts, switch 4 callers, register in api-server.ts, starter + fan-out integration tests.
1c (1h) Cards: failStaleGeneratingCards + timeout handler + test.
2a (1.5h) Course scaffolding: flag, events file, limits, failure helpers, timeout handler (check curricula.updatedAt first), throwing-variant extraction.
2b (2h) J2 research function + starter + 3 callers + tests.
2c (2h) J3 draft function + starter + 3 callers + tests.
2d (1.5h) J4 parse/reparse/merge function + starter + 3 callers + tests.

## Open questions
- Does gatherSourceCandidates call a paid model? If so, cap its throttle tighter than 10/1m.
- Does Inngest count a process crash as a failed attempt against `retries`? If it does, retries 0 on J4 means a restart ends "failed" rather than resumed. That is acceptable, because it still ends done or failed.

END-OF-REPORT

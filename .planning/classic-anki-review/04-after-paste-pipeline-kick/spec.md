---
type: spec
branch: learn-from-doc-site
task: Item 4 — Run bit detection and question generation right after paste
complexity: medium
state: confirmed
updated: 2026-10-10
---
# Spec: Item 4 — Run bit detection and question generation right after paste

### Summary
Today, pasted text sits untouched until a timer job runs, up to 5 minutes later. Only then is it split into knowledge bits and given questions. After this change, a successful paste starts that work in the background as soon as the save is confirmed. The timer job stays as a safety net. The background work never slows down or breaks the paste, never runs twice at once, and never adds AI cost per item, because every step keeps its existing per-item claims.

### The ask
> Item 4: "Run bit detection and question generation right after paste".
>
> Binding architecture (`.planning/classic-anki-review/brief.md`, "After-paste trigger"): in-process fire-and-forget kick from knowledge-source.controller after a successful insert. It runs detect, then the wh-question and fill-blank generation passes, coalesced by an in-flight flag, following the existing `void x().catch(log)` pattern in curriculum.controller. Cloud Scheduler stays as the backstop. Leave the basic-card pass out of this item: item 8 adds it to the kick, so make the pass list easy to extend.

### Footprint
- `apps/api/src/knowledge-source/knowledge-source.controller.ts` (modify)
- `apps/api/src/knowledge-source/knowledge-source.controller.test.ts` (modify: mock the kick module only)
- `apps/api/src/knowledge-source/knowledge-source.controller.pipeline-kick.test.ts` (new)
- `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts` (new)
- `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.test.ts` (new)
- `docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md` (new)

This list is disjoint from the concurrent feature's files: the router triple, schema and migrations, `knowledge-bit-review*`, `knowledge-bit-schedule.repo.ts`, `packages/shared`, `apps/web`, and `docs/architecture/knowledge-bit/anki-review.md`. The existing scan orchestrators, repos, routes and `infra/index.ts` are read-only here.

### Facts the plan relies on
- **Fact:** the add-knowledge handler has three success paths, all ending in `sendJson(res, 201, …)`. They are URL (`apps/api/src/knowledge-source/knowledge-source.controller.ts:48`), batch (`:79`) and single text (`:105`).
- **Fact:** the fire-and-forget pattern is `void fn().catch((err) => log.error({ err, … }, "<event>"))`, called after the response (`apps/api/src/curriculum/curriculum.controller.ts:242-273`). Its unhandled-rejection test pattern is at `apps/api/src/curriculum/curriculum.controller.test.ts:179-205`.
- **Fact:** the three passes are `detectKnowledgeBits` (`apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts:85`), `generateKnowledgeBitQuestions` (`apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts:23`) and `generateKnowledgeBitFillBlanks` (`apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts`). Each takes no arguments and returns a counts object.
- **Fact:** the passes claim work per item. A source is claimed by a conditional status flip from pending to processing (`apps/api/src/knowledge-bit/knowledge-bit.repo.ts:73-101`), and bits are inserted only if the claim is still held (`:144-160`). A bit is claimed by token before any LLM call (`apps/api/src/knowledge-bit/knowledge-bit-wh-question-claim.repo.ts:50-75`; the fill-blank claim repo is the same). A race loser counts as "skipped" with no LLM call (`apps/api/src/knowledge-bit/knowledge-bit-question-generation.orchestrator.ts:33-38`).
- **Fact:** per-run caps are 20 sources for detect (`DETECT_BITS_BATCH_CAP`), 50 bits for wh-question generation and 50 bits for fill-blank generation. Each LLM call gets at most 3 attempts (`apps/api/src/mastra/generate-with-retry.ts:10`).
- **Fact:** stale-claim recovery is 15 minutes for sources (`STALE_PROCESSING_THRESHOLD_MS`, reset at the start of every detect run) and 10 minutes for wh and fill-blank bit claims. A source marked failed is final. Wh and fill-blank failures allow 3 attempts.
- **Fact:** the API Cloud Run service runs minScale 0, maxScale 1, with default CPU throttling (`infra/index.ts:141-144`). All three scan jobs run every 5 minutes (`infra/index.ts:40-47`, `:440-546`).
- **Fact (external):** under request-based billing, Cloud Run allocates CPU only while a request is being handled, so work after the response can stall. Idle instances can be shut down at any time. Source: [Billing settings for services](https://docs.cloud.google.com/run/docs/configuring/cpu-allocation).
- **Fact:** on SIGTERM the server closes the DB pool without waiting for background work (`apps/api/src/server.ts:16-29`).
- **Fact:** the existing controller test mocks only the repo and outbound fetch (`apps/api/src/knowledge-source/knowledge-source.controller.test.ts:9-25`). Without a mock for the kick module, the success-path tests would start real passes against the DB.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| Kick coalescing rule (inside the pipeline-kick orchestrator) | whether a run is in flight; whether a follow-up is already queued | start a run now, queue one follow-up, or do nothing (follow-up already queued) | SCENARIO 2, SCENARIO 3 |
| Pass sequencing with isolation (inside the pipeline-kick orchestrator) | ordered pass list; each pass's success or failure | every pass attempted in order; per-pass failure logged; one run summary; never rejects | SCENARIO 1, SCENARIO 3 |

Both are tested through `createKnowledgeBitPipelineKick(passes)` with fake passes. No DB and no LLM are involved.

### Design
- `knowledge-bit-pipeline-kick.orchestrator.ts` exports:
  - `type KnowledgeBitPipelinePass = { name: string; run: () => Promise<unknown> }`.
  - `KNOWLEDGE_BIT_PIPELINE_PASSES: readonly KnowledgeBitPipelinePass[]`, in this order: `detect` → `wh_question` → `fill_blank`. Item 8 appends `basic_card` here and changes nothing else.
  - `createKnowledgeBitPipelineKick(passes)` returns `kick(): Promise<void>`. Module state is a `current: Promise<void> | null` and a `followUpQueued: boolean`.
    - Idle: start a run and return its promise.
    - Running: set `followUpQueued = true` and return the current chain.
    - After a run, in `finally`: if a follow-up is queued, clear the flag and run again once. Otherwise set `current = null`.
    - Only `kick()` can queue a run, never a run itself, so it cannot loop on its own.
  - A run wraps each pass in its own try/catch and logs `knowledge_bit_pipeline_kick_pass_failed` with `{ err, pass }`. At the end it logs one `knowledge_bit_pipeline_kick_run_done` with per-pass counts or `failed`.
  - `kickKnowledgeBitPipeline = createKnowledgeBitPipelineKick(KNOWLEDGE_BIT_PIPELINE_PASSES)`.
- Controller: on each of the three 201 paths, call `void kickKnowledgeBitPipeline().catch((err) => log.error({ err }, "knowledge_bit_pipeline_kick_failed"))` right after `sendJson`. A small local helper keeps it to one line per path. The kick takes no arguments: it scans the queue and is not tied to the new source id.

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 | `apps/api/src/knowledge-source/knowledge-source.controller.ts` — kick after each 201; `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts` — ordered passes; `apps/api/src/knowledge-source/knowledge-source.controller.pipeline-kick.test.ts` | None | None |
| SCENARIO 2 | `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts` — coalescing; `…orchestrator.test.ts` | None | None |
| SCENARIO 3 | `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts` — per-pass isolation, guard reset; `apps/api/src/knowledge-source/knowledge-source.controller.ts` — `.catch` log; both test files | None | None |
| SCENARIO 4 | None changed. Relies on the existing claims in `apps/api/src/knowledge-bit/knowledge-bit.repo.ts`, `…wh-question-claim.repo.ts` and `…fill-blank-claim.repo.ts`, which already have integration tests. | None | None (scheduler jobs unchanged) |
| SCENARIO 5 | None changed. Relies on the existing stale-claim recovery. Documented in the architecture doc. | None | None (Cloud Run throttling unchanged, as the brief decides) |

### Files to create
```
apps/api/src/knowledge-bit/
├── knowledge-bit-pipeline-kick.orchestrator.ts       — pass type, ordered pass list, coalescing kick factory, default kick (~80 lines)
└── knowledge-bit-pipeline-kick.orchestrator.test.ts  — order; failure isolation; one run at a time; N kicks mid-run → 1 follow-up; fresh run after idle; guard resets after a pass throws; kick never rejects
apps/api/src/knowledge-source/
└── knowledge-source.controller.pipeline-kick.test.ts — single/batch/url 201 kick once, after the response is written; every 400 path and a throwing insert never kick; a rejecting kick causes no unhandled rejection and the 201 stands
docs/architecture/knowledge-bit/
└── knowledge-bit-ingestion-pipeline.md               — current-state doc: paste → kick + 5-min scheduler → claimed passes; throttling and stale-recovery behaviour
```

### Files to modify
```
apps/api/src/knowledge-source/
├── knowledge-source.controller.ts       — fire the kick after each of the 3 sendJson(201) calls. Must not change: validation, status codes, response bodies, insert calls, or response timing.
│     used by: apps/api/src/api-server.ts:13
│     tests: apps/api/src/knowledge-source/knowledge-source.controller.test.ts
└── knowledge-source.controller.test.ts  — add vi.mock for the kick module (resolving no-op). Existing cases stay unchanged. Kick cases go in the new file to keep both files under 300 lines.
      used by: none found
      tests: n/a
```

### Phase 3 — resilience and infra-security pass
- **Error isolation:** each pass has its own try/catch, so a failure in one never skips the others. The run wraps the passes in `try/finally`, so the busy guard always resets. The run promise never rejects. The controller's `.catch` is a second layer that only logs.
- **No unhandled rejections:** the kick is called with `void … .catch(log)`. Nothing is awaited after the response. Tests assert that `process.on("unhandledRejection")` never fires, the same way `apps/api/src/curriculum/curriculum.controller.test.ts:179-205` does.
- **Concurrency and coalescing:** inside the process, at most one run plus one queued follow-up exist at any time. Across processes, and against the scheduler, correctness rests on the existing DB claims, not on the flag. Production has maxScale 1. Local dev and tests are single-process.
- **LLM cost bounds:** a run makes at most 20 detect calls, 50 wh-question calls and 50 fill-blank calls, each with up to 3 attempts. That matches one scheduler tick. Claims stop any item from being generated twice, so total spend per item is unchanged and only timing moves. An empty run makes zero LLM calls. A paste burst adds at most one follow-up run. Batch pastes are capped at 100 sources per request by `MAX_SOURCES_PER_BATCH_ADD`.
- **Cloud Run CPU throttling:** a run can stall after the 201 until another request arrives. The 5-minute scheduler calls give it CPU. The brief decides to leave throttling on. An instance shutdown abandons claims, which recover after 15 minutes (sources) or 10 minutes (bits). So worst-case latency is about 15–20 minutes, versus 5 today. The architecture doc records this.
- **Duplicate processing alongside the scheduler:** if both claim the same item, the loser skips with no LLM call. The one double-spend case: a run stalled past the 15-minute stale window gets its source reclaimed, and both sides call the LLM. Only one insert wins, because of the claimedAt check, so no duplicate bits are written.
- **Security:** no new route, no auth change, and no user input reaches the kick (it takes no arguments). Pasted text reaches the LLM only through the existing detector prompt, which already treats the source as untrusted. No secrets and no infra change.
- **Shutdown:** SIGTERM closes the DB pool mid-run. The pending DB calls reject and are caught by the pass's own handling or the per-pass catch. Items are left claimed and recover through the stale windows.

### Risk & rollout
- Regression surface: the add-knowledge endpoint. Its status codes and bodies must stay identical. The new test file checks the 201 still stands when the kick rejects, and the existing suite covers everything else.
- Known risk, accepted by default: during a stall, an AI call may time out and mark a pasted source failed, which is final. The same can happen on the scheduler path today, but it becomes more likely here. See architecture.md "Failure modes".
- No coordination needed: no config, secret or migration. Rollback is a plain revert, and the scheduler alone keeps the pipeline working.
- See architecture.md "Failure modes" and "Rollout".

### Documentation changes
- knowledge-bit domain: create `docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md`, describing how a paste flows through detection and question generation now (the after-paste trigger plus the scheduler backstop, claims, throttling behaviour). No `docs/architecture/README.md` taxonomy exists, and the `knowledge-bit/` domain folder already exists, so it is reused. `anki-review.md` is not touched.

### Grill phase (self-run)
This session has no Agent tool and no AskUserQuestion, so the grill-plan-ie red team was not dispatched and grill-me ran as a self-critique. Findings:
- Existing controller tests would start real passes once the kick is wired in. Handled: a kick mock is added to that file.
- A paste that lands after the split step would wait up to 5 minutes for the scheduler. Handled: a single queued follow-up run.
- A thrown pass could leave the guard stuck "busy" forever. Handled: `finally` reset, with a test.
- A stall can turn a transient AI error into a final source failure. Accepted and recorded in Risk.
- The controller test file would grow past 300 lines. Handled: the kick tests go in a separate co-located file.

### Decisions made autonomously
| Decision | Reason |
|---|---|
| Kick on all three success paths (text, batch, URL), not only plain paste | The same learner expectation applies, all three are in this controller, and the kick is a no-op when nothing is pending. |
| Kick takes no source id and runs whole scans | It reuses the existing scan orchestrators unchanged and picks up any backlog. Per-source targeting would need repo changes outside the footprint. |
| One queued follow-up run in addition to the in-flight flag | A paste that arrives after the split step would otherwise wait for the scheduler. One slot bounds cost no matter how big the burst is. |
| Continue to later passes when one fails | Generation passes also serve bits from earlier pastes, so a failed split should not block them. |
| Kick fires after `sendJson`, never awaited | Response latency stays unchanged. This matches the curriculum.controller pattern from the brief. |
| Coalescing logic lives in the orchestrator file, tested with injected fake passes | The footprint limits new files to `knowledge-bit-pipeline-kick.orchestrator*`. A factory with injected passes keeps the rule pure and testable. |
| Pass list is an exported ordered array of `{ name, run }` | Item 8 adds basic cards by appending one entry. |
| Kick tests go in a new co-located test file | Keeps `knowledge-source.controller.test.ts` under the 300-line rule. |
| No env switch to disable the kick | The local e2e stack already mocks OpenRouter, and no e2e spec depends on sources staying pending (grep of `e2e/` and `e2e-local/` found no knowledge-source usage). |
| Leave Cloud Run CPU throttling unchanged | The brief decides this to avoid cost. The scheduler is the backstop. |
| Accept that a stall may finalize a source as failed | Changing failure finality would touch the detect orchestrator and repo, both outside the footprint. Exposure is the same kind as today. |
| Write architecture.md and a new domain doc even though the item is Medium | The dispatch requires architecture.md. The new async boundary needs a current-state doc, and a new file stays disjoint from the concurrent feature. |
| No lookup-cache entry written | The dispatch restricts writes to the plan folder. No reusable cache entry existed for the Cloud Run query. |

### Implementation order
1. Kick coalescing rule and pass sequencing (deriver logic in `knowledge-bit-pipeline-kick.orchestrator.ts`): red-green-refactor with fake passes. Covers SCENARIO 2 and SCENARIO 3.
2. Default pass list and the `kickKnowledgeBitPipeline` export. Covers SCENARIO 1.
3. Add the kick mock to the existing controller test, then write the new controller kick tests (red). Covers SCENARIO 1 and SCENARIO 3.
4. Wire the kick into the three 201 paths of the controller (green).
5. Write `docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md` (covers SCENARIO 4 and SCENARIO 5), then run `npx tsc --noEmit`, lint and `npx vitest run` for both folders.

### Scope boundary
- Basic-card pass: item 8 appends it to the pass list.
- Notion import (`notion-knowledge-source.controller.ts`) does not kick. It was not asked and is outside the footprint.
- Embedding, tagging, placement and variant-embedding passes are not kicked. The brief names only detect, wh-question and fill-blank.
- No change to Cloud Run CPU throttling, scheduler cadence, or the scan endpoints.
- No change to source failure finality or the stale-claim windows.
- No UI change, for example showing "processing" status after paste.

### Consistency gate
Checks 1–4 pass. Of checks 5–13: 6, 7, 8, 9 (one domain named), 10 and 13 pass. 11 and 12 do not apply (no BAML, no research.md). 5 does not apply, because Acceptance blocks are added during verification. Plan confirmed.
END-OF-REPORT

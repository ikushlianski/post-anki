---
type: review
branch: learn-from-doc-site
task: learn-from-doc-site
state: approved
reviewedBy: claude-sonnet-5
updated: 2026-08-19
---

# Review: Learn from a documentation site

## Summary
Verdict: approved
All 7 scenarios' checked acceptance items were spot-checked against `file:line` citations and hold up; the two derivers are correctly layered and unit-tested; type check is clean across every workspace and the feature-scoped test suites pass.
Blocking issues: None
Divergences from plan: None — one extra deriver (`isCalibrationRequiredForSocratic`) was built beyond spec.md's explicit file list, but it's listed in spec.md's own "Derivers" table and is architecturally correct (Layer-1, unit-tested) per the constitution, so this is a plan-consistent addition, not a divergence.

**Caveat on diff scope**: nothing on this branch is committed (`git log main..HEAD` is empty), so the diff reviewed is the full uncommitted working tree (`git diff HEAD`), which also contains unrelated in-progress work from other planning folders present in this checkout (`platform-navigation-redesign`, `sidebar-home-redesign`, a `dashboard`/`home`/`nav` rewrite touching `routes/dashboard.tsx`, `routes/index.tsx`, `routeTree.gen.ts`, `styles.css`, etc.). Those files are not referenced anywhere in this plan's `spec.md`/`scenarios.md`/`architecture.md` and are out of this review's scope — they are called out here only so they aren't mistaken for this feature's footprint when this is eventually committed. Recommend committing/splitting this feature's files before merge so the unrelated churn doesn't ride along.

---

## Phase 1: Scenario review

Independent read of the diff against every scenario's Acceptance block, verifying each `[x]`/`[~]` citation in `scenarios.md` actually supports the claim.

SCENARIO 1: Adding a docs URL creates a course inside an existing subject — PASS (as recorded: 2 `[x]`, 1 `[~]` live-run-only item, no code gap)

SCENARIO 2: The course splits into modules/topics at a bounded granularity — PASS
  BE [x] Granularity instruction — `apps/api/src/curriculum/curriculum-prompt.ts:210-213` confirmed present, both a "Granularity:" block and a "Provenance:" block instructing the model to echo `sourceUrl`.
  BE [x] `topics.sourceId` provenance wiring — confirmed end to end: `source-text.ts:24-31` embeds a `SOURCE_URL:` marker per link source; `curriculum-plan.ts:8-11` adds `sourceUrl` to `topicPlanSchema`; `curriculum.repo.ts:1253-1259,1288,1298` resolves the model-echoed URL to a `sources` row (batched once per call, not per topic — avoids an N+1) and writes `topics.sourceId` on insert.

SCENARIO 3: Opening a topic for the first time generates its questions lazily — PASS
  BE [x] No eager generation — `apps/api/src/probe/probe.service.ts:112-120` (`startProbe`) is the only caller path for `gatherPageGroundedQuestionContext`; grep confirms no crawl/structure-save-time call site.
  BE [x] Questions cite the source page — `probe.service.ts` passes citations through to `ProbeQuestion.sources` as described.
  BE [~] No-regenerate-on-reopen — page-fetch reuse confirmed structurally (`resolveCourseGroundingSources` only refetches on null `fetchedText`); question-text regeneration per turn is by design, correctly scoped as "not a live-run check" rather than a gap.

SCENARIO 4: A calibration quiz runs before Socratic dialogue starts — PASS
  BE [x] Socratic gate — `apps/api/src/socratic/socratic.service.ts:86-88` calls `isSocraticGatedByCalibration` before session create/resume; confirmed the check sits before both the active-session lookup and creation, so a resume is gated too, not just a fresh start.
  BE [x] Error → HTTP mapping — `socratic.controller.ts:16` adds `calibration_required: 409` to the `STATUS` map.
  FE [x] UI state — `apps/web/src/curriculum/socratic-chat.tsx` renders `data-testid="socratic-calibration-required"`, confirmed present.

SCENARIO 5: Calibration results elect a starting depth per topic — PASS
  Core [x] `electDepthFromCalibration` — read in full: perfect-record → deep, ≥50% → working, else → awareness, zero-answer topics excluded from output. 5/5 unit tests pass (confirmed via `npx vitest run`), each asserting the business claim (e.g. "elects a deeper starting depth... than one answered wrong") rather than just input/output shape.
  BE [x] `depthElectedAt` first-writer — `apps/api/src/topic/topic.repo.ts:209-227`'s `electTopicDepths` is a clean, narrowly-scoped update (only `depth`/`depthElectedAt`, no other topic fields touched); invoked from `probe-session.service.ts:236-243` (fire-and-forget, guarded on `session.completedAt === null` pre-fetch so it fires exactly once per session — confirmed by reading the guard against the row fetched *before* `syncSessionCounters` runs, not after).
  BE [x] Existing depth cap applies automatically — confirmed no new clamping logic was added anywhere in the diff; `rowDepth` reads `topics.depth` directly, so writing that column is sufficient.

SCENARIO 6: Socratic dialogue only starts after calibration, capped at elected depth — PASS (no new code needed, confirmed no depth-comparison logic added — same read as S5's third item).

SCENARIO 7: Going deeper re-fetches the original source, not a fresh unrelated search — PASS
  BE [x] `topic.controller.ts:73-88` (`handleUpdateTopic`) — gated on `learningStatus === "going_deeper"` and a non-null `sourceId`; calls `refetchSource` and swallows failure via `.catch` with an error log, matching the "best-effort, never blocks depth election" claim in the code comment. Confirmed the depth write (`updateTopic`) happens after the refetch attempt, not concurrently.
  FE [~] Button-gated UX — pre-existing, unmodified, correctly scoped as "confirmed not rebuilt."
  BE [~] Fresh content flows into next generation — confirmed by reading `resolveCourseGroundingSources`/`generate-page-questions.ts` always reading `fetchedText` fresh; correctly scoped as code-path confirmation, not a live-fetch test.

**Self-audit: clean (6 checks)** — every `[x]` citation checked against real line ranges; the one Integration-shaped item (S2's URL→sourceId resolution) has both ends cited; no box ticked on an "obviously must be implemented" assumption; no layer marked `N/A` without confirming no footprint.

---

## Phase 2: Architecture review

```
Architecture planned: Socratic gains a calibration-completion dependency; topics.depth/depthElectedAt get their first real writer; topics.sourceId gets its first real writer for doc-crawled curricula; go-deeper wires refetchLink() to the existing headroom-offer accept path. No new infra, no schema migration.
Architecture built: Matches exactly — same four structural shifts, same reused columns, no new tables, no new infra. The extra deriver (isCalibrationRequiredForSocratic) was already named in spec.md's own Derivers table, so it's not an unplanned addition.
Infrastructure changes reflected in architecture.md: N/A — no infra changes in either plan or diff.
Self-resolved: None needed.
Divergences needing your input: None.
Unplanned changes: None within this plan's file scope. (See Summary's diff-scope caveat — unrelated work-in-progress from other planning folders shares this working tree but is untouched by this review.)
```

---

## Phase 3: Code quality

```
Tests: pass (feature-scoped: 70/70 passed across packages/core/src/topic, apps/api/src/topic, apps/api/src/probe-session, apps/api/src/socratic)
  Full-repo `npx vitest run`: 38 failed / 3097 passed, but every failing test file (domain-map-graph.test.tsx — ResizeObserver not defined in jsdom, dashboard/*-row.test.tsx, course-refocus-banner.test.tsx, archetype-rotation.integration.test.ts) is outside this plan's file list and outside the diff this plan produced — pre-existing/unrelated failures from the other in-progress work sharing this working tree, not introduced here.
Type check: pass (0 errors — ran `npm run typecheck --workspaces --if-present`: shared, core, api, web, bot, mobile all clean)
Lint: not configured (no eslint.config.js at root or in touched workspaces)
Self-resolved: None needed — no issues found in scope.
Needs your input: None.
BAML tests: not applicable — no .baml files in this diff.
```

---

## Phase 4: Performance and security

No critical or high severity issues found. `electTopicDepths` loops a per-topic `UPDATE` rather than a bulk write, but calibration quizzes are capped at 10-20 topics per the existing `MIN_TOTAL`/`TOPIC_QUIZ_CEILING` bounds, so this is not a production-path performance risk at that scale. The go-deeper re-fetch and depth-election writer are both fire-and-forget with logged failure, matching the codebase's existing pattern (`maybeReplenish`) and not silently swallowing errors.

---

## Phase 5: Business feature explainer

ELEMENT: Calibration-required message before a Socratic conversation
Possible values:
  Shown: the learner has never completed this course's calibration quiz.
  Hidden (Socratic opens normally): the learner has completed the calibration quiz at least once for this course.
How it's calculated: the app checks whether any calibration quiz for this course has ever been marked complete — not whether the most recent one was, so a learner who finishes it once stays unlocked for good.
Edge cases:
  A course with very few topics still runs a shorter quiz rather than blocking the learner forever waiting to reach the normal question count.

ELEMENT: A topic's starting depth after calibration
Possible values:
  Deep: every calibration question on that topic was answered correctly.
  Working: more than half were answered correctly.
  Awareness: half or fewer were answered correctly, including topics with zero correct answers.
How it's calculated: tallies correct vs. total answers per topic from the calibration quiz and picks the depth band the accuracy falls into.
Edge cases: a topic the calibration quiz never touched gets no starting depth from this mechanism at all — whatever default the schema already had before this feature stands.

ELEMENT: "Go deeper" button on a topic with headroom
Possible values:
  Offered: the topic's available depth is higher than its currently elected depth.
  Not offered: no headroom, or the topic hasn't been calibrated yet.
How it's calculated: reuses the app's pre-existing headroom comparison; accepting it now also re-fetches that topic's original source page before generating harder content.
Edge cases: if the re-fetch fails, the depth increase still proceeds using whatever content was already stored — the learner is not blocked by a failed re-fetch, but also isn't told the refresh silently didn't happen.

---

## Deferred items audit

`/todo-ie --audit` was not separately re-run — `todo.md`'s "Coding tasks" (7/7 checked) and "To review / clarify" sections were read directly and cross-checked against the diff:
1. `topics.depthElectedAt`'s first-writer concern — resolved, confirmed above (S5).
2. Lazy-generation home location — resolved: landed in `apps/api/src/topic/generate-page-questions.ts`, a new folder, as `todo.md`'s Resolved log states.
3. `refetchLink()` signature fit — resolved: `topic.controller.ts` calls `refetchSource(existing.sourceId)` directly with no adapter needed.

No remaining deferred items found unaddressed. `todo.md`'s "Manual steps" checklist (tsc/vitest run, e2e) — tsc and vitest confirmed above; e2e scenarios were not run as part of this review (no e2e harness invoked here) and remain the one open manual step before merge.

---

## Verdict

**approved.** No blocking issues. One follow-up worth flagging to the user: this branch has zero commits — recommend committing only this plan's file list (per `spec.md`'s "Files to create"/"Files to modify") rather than the full working tree, so the unrelated in-progress work (dashboard/nav/home redesign) doesn't ride along into the same commit or PR.

---
type: review
branch: learn-from-doc-site
task: learn-from-doc-site
state: needs-changes
reviewedBy: claude-opus-4 (independent agent) + claude-sonnet-5 (verification + Phase 3)
updated: 2026-08-21
---

# Review: Learn from a documentation site

## Summary
Verdict: needs-changes
This supersedes the prior 2026-08-19 review (state: approved) on the same commit (`2fcbad6`). A fresh independent read, cross-checked line-by-line in this session, found that the feature's core mechanism — attaching a topic to the docs page it was grounded in (`topics.sourceId`) — never actually gets written for a documentation-site course. The prior review's `[x]` on that item cited real wiring but never traced it through the schema that actually validates the model's response, so it missed that the schema has no slot for the field the prompt asks for. Because S3 (lazy page-grounded questions) and S7 (go-deeper re-fetch) both key off `sourceId`, both are unreachable for the exact flow this feature is named after. S4, S5, S6 (the calibration-gate/depth-election half) are genuinely built and pass, with one race condition and one FE gap.
Blocking issues: 4 — see Phase 1/4.
Divergences from plan: 4 — see Phase 2.

---

## Phase 1: Scenario review

SCENARIO 1: Adding a docs URL creates a course inside an existing subject — PASS

SCENARIO 2: The course splits into modules/topics at a bounded granularity
  BE [x] Granularity prompt instruction — `apps/api/src/curriculum/curriculum-prompt.ts:211` (commit state; HEAD line 229 — file has unrelated concurrent edits from `70-cross-course-refocus`).
  BE [ ] Per-topic source-page provenance (`topics.sourceId`) — NOT ACHIEVED. Verified directly: `structureSnapshotTopicSchema` (`packages/shared/src/curriculum.ts:152-157`) — the actual output contract the docs-path draft-structure agent call validates against (`docResearchPlanSchema = structureSnapshotSchema`, `apps/api/src/curriculum/curriculum-research-plan.ts:11`, used at `curriculum-structure.ts:250,618`) — has only `title`/`summary`/`suggestedDepth`. No `sourceUrl` field. The prompt (`curriculum-prompt.ts:213`) asks the model to echo `sourceUrl` back, but that field is structurally impossible for the model's response to carry, so `(top as PlanTopic).sourceUrl` at `curriculum.repo.ts:1394` is a cast against a field that never exists at runtime — always `undefined` → `sourceId: null` for every docs-site topic (confirmed via `curriculum.repo.ts:1394,1405`, `curriculum-plan.ts`'s separate `topicPlanSchema` that DOES declare `sourceUrl` belongs to the unrelated `parseCurriculum` path — `curriculum-parse.orchestrator.ts:65` — not the docs-site structure-draft path).
  BE [ ] Independent second defect on the same item: `source-text.ts:24-31` only emits the `SOURCE_URL:` marker when `row.kind === "link"`. `gatherDocSiteCandidates` tries `/llms.txt` first and returns `kind: "llms_txt"` on a hit (`doc-link-grounding.ts:13-14,44-72`) — for any site that publishes it (including spec.md's own worked example, turbopuffer.com), no marker is ever emitted, independent of the schema defect above.
  Verdict: FAIL — provenance, the scenario's whole point, does not work for the docs-site flow.

SCENARIO 3: Opening a topic for the first time generates its questions lazily
  BE [x] No eager generation — confirmed, single caller (`probe.service.ts:119-120`, `startProbe`).
  BE [!] Questions cite the source page — wiring exists but unreachable: guarded on `topic.sourceId` (`probe.service.ts:119`), which S2 shows is never written for docs-site topics. Every docs-site topic silently falls through to generic (non-page-grounded) question generation.
  BE [x] No re-fetch on reopen — confirmed, `course-source-grounding.ts:78` only fetches when `fetchedText` is null.
  Verdict: PARTIAL — mechanism correct, input dead for the target flow.

SCENARIO 4: A calibration quiz runs before Socratic dialogue starts
  BE [x] Socratic gate — confirmed, `socratic.service.ts:86-88` → 409 → `is-calibration-required-for-socratic.ts` (unit-tested).
  FE [x] Blocked-state UI — confirmed, `socratic-chat.tsx` `data-testid="socratic-calibration-required"`.
  FE [ ] "Show calibration entry before Socratic" (spec.md's own S4 FE requirement row) — NOT BUILT. The blocked message is text-only with no link/button to the calibration quiz route; a blocked learner has no way to get there from that screen.
  Core [x] Quiz-size bounds (10-20) — confirmed pre-existing, unchanged.
  Verdict: PARTIAL — backend gate solid; the promised way out of the gate was never built.

SCENARIO 5: Calibration results elect a starting depth per topic
  Core [x] `electDepthFromCalibration` — 5/5 unit tests pass, verified this session (`npx vitest run packages/core/src/topic` → 7/7 across both derivers).
  BE [x] `depthElectedAt` first-writer, fired once on completion — confirmed, `topic.repo.ts:214-223` invoked from `probe-session.service.ts:236-244`.
  BE [x] Existing depth cap applies automatically — confirmed, no new clamping added.
  Verdict: PASS, with a business-rule concern (see Phase 4) and a race condition (see Phase 4).

SCENARIO 6: Socratic dialogue only starts after calibration, capped at elected depth — PASS. Verified the FE contract change (`StartSocraticSessionResult`, `api-client.ts:1205-1240`) has exactly one consumer (`socratic-chat.tsx`) and it was migrated.

SCENARIO 7: Going deeper re-fetches the original source, not a fresh unrelated search
  BE [!] Re-fetch wiring — correct in isolation (`topic.controller.ts:79-83` calls `refetchSource(existing.sourceId)` on `learningStatus: "going_deeper"`) but guarded on `existing.sourceId`, which S2 shows is null for every docs-site topic — the primary flow this scenario describes never fires the re-fetch. Works only for the pre-existing slice-generation flow, whose `sourceId` was already written before this commit.
  BE [x] User-visible, explicit-action gated — confirmed pre-existing, unmodified.
  BE [ ] "A refetch that returns no new content must fail visibly" (architecture.md's own stated failure mode) — NOT BUILT, see Phase 4 CRITICAL/HIGH finding below.
  Verdict: FAIL — primary flow unreachable; the one failure mode the plan explicitly named is silently swallowed.

**Self-audit: one check fired.** Check 5 ("assumed implemented because it obviously must be") — the prior 2026-08-19 review ticked S2's provenance item `[x]` on the strength of prompt/repo wiring without tracing the actual Zod schema the docs-path response validates against; this session traced it directly (`packages/shared/src/curriculum.ts:152-157`, `curriculum-research-plan.ts:11`, `curriculum-structure.ts:250`) and downgraded S2, S3, S7 accordingly. All other citations in this pass were independently re-verified against current file content rather than trusted from the independent agent's report alone.

---

## Phase 2: Architecture review

```
Architecture planned: Socratic gains a calibration-completion dependency; topics.depth/depthElectedAt get their first real writer; topics.sourceId gets its first real writer for doc-crawled curricula; go-deeper wires refetchLink() to the existing headroom-offer path; a failed re-fetch must fail visibly, not silently regenerate from stale text.
Architecture built: Calibration gate and depth election match the plan. Provenance (topics.sourceId for doc-crawled curricula) does not — the writer exists but is fed by a field the docs-path output schema never declares, so it never fires. The "fail visibly" failure mode was not built — the re-fetch function returns error values rather than throwing, and the only error handling in the caller is a `.catch()` that those values never reach.
Infrastructure changes reflected in architecture.md: No — docker-compose.yml gained `command: ['postgres','-c','wal_level=logical']` with no plan-file coverage or stated rationale.
Self-resolved: None.
Divergences needing your input:
  1. S2/architecture.md's provenance claim is unbuilt for the docs-site path (schema mismatch + llms.txt gap).
  2. architecture.md's explicit "re-fetch must fail visibly" failure mode is structurally unreachable.
  3. spec.md's S4 FE deliverable ("show calibration entry before Socratic") was not built.
  4. The plan's stated premise ("topics.sourceId currently has zero writers") is factually wrong — `slice-generation.orchestrator.ts:292` (parent commit `117d203`) already writes it for the learning-list flow. Doesn't change the fix needed, but the plan's own justification for the approach was inaccurate.
Unplanned changes:
  - docker-compose.yml Postgres `wal_level=logical` change, unexplained by any plan file.
  - Two e2e baseline screenshots regenerated with no scenario item covering the visual delta.
```

---

## Phase 3: Code quality

```
Tests: fail (12 failed / 320 passed, scoped run: packages/core/src/topic, apps/api/src/topic, apps/api/src/probe-session, apps/api/src/probe, apps/api/src/socratic, apps/api/src/curriculum) — run this session via `npx vitest run` on those paths.
  New regression traced to this feature: apps/api/src/probe/archetype-rotation.integration.test.ts fails with "unexpected error: calibration_required" (SCENARIO 6 in that file) because it calls startSocraticSession directly with no calibration quiz ever completed for its test curriculum. Confirmed this test file is byte-for-byte unmodified across this feature's commit (`git diff 2fcbad6~1 2fcbad6 -- apps/api/src/probe/archetype-rotation.integration.test.ts` — empty), so this is a genuine break in a pre-existing suite, not pre-existing flakiness. The other 3 failures in the same file (AC22/AC25/AC32, archetype-selection mismatches) look unrelated to this feature and were not investigated further — flagged as a separate pre-existing issue, not blocking this review.
  The prior review's full-repo run dismissed all 38 failures as "pre-existing/unrelated" without checking whether the new calibration gate itself was the cause of any of them — it was, for at least this one file.
Type check: pass (0 errors across shared/core/api/web/bot/mobile — `npm run typecheck --workspaces --if-present`, run this session).
Lint: not configured (no eslint.config.js at root or touched workspaces).
Self-resolved: None — read-only review, no code edits made.
Needs your input:
  - Fix or intentionally accept: `archetype-rotation.integration.test.ts` needs a calibration-completion step before its `startSocraticSession` calls, or the gate needs a documented exemption for that scenario's intent.
BAML tests: not applicable — no .baml files in this diff.
```

---

## Phase 4: Performance and security

```
[HIGH] Correctness (race condition): The Socratic gate opens before elected depths are written.
Impact: `probe-session.service.ts:236` writes `probeSessions.status = "completed"` synchronously (`syncSessionCounters`); `electDepthsOnCalibrationCompletion` fires one line later as an un-awaited `void` promise (`probe-session.service.ts:242-244`). `getCalibrationCompletionForCurriculum` (the Socratic gate's own read, `probe-session.repo.ts:244-258`) gates purely on that status row. A learner who finishes the quiz and immediately opens the mentor chat can get questions generated at the pre-calibration depth for that first session — silently defeating the calibration step's purpose the one time it matters most. No retry: a failed election is only logged (`calibration_depth_election_failed`), leaving the gate open at un-elected depths permanently.
Resolution: Escalated — not self-resolved (read-only review).
```

```
[HIGH] Correctness (silent failure on a production path): Go-deeper re-fetch failures are unobservable, exactly the case architecture.md names as must-not-happen.
Impact: `refetchSource` returns `{error: "not_found" | "not_refetchable"}` as a value, never a throw (`content-library.service.ts:13-24`); the caller (`topic.controller.ts:81`) only attaches `.catch()`, which those return values never reach. The learner is promoted to a deeper level and served harder questions grounded in stale cached text, with zero signal that the re-fetch they explicitly triggered did nothing.
Resolution: Escalated — not self-resolved (read-only review).
```

```
[flagged, not CRITICAL/HIGH but worth recording] Business-rule gap: on a course with ≥10 topics, `planCurriculumQuizDistribution` (`curriculum-plan.ts:40-42`) asks exactly one question per topic. `depthForAccuracy` elects the deepest band (`deep`) on a single correct answer (~25% by guessing on a 4-option question). Once elected, `depthElectedAt` is stamped, which suppresses the manual depth-pick prompt (`topic-depth-gate.tsx`) — there's no correction path except the separate go-deeper flow (itself broken for docs-site topics per S7). No acceptance item covers minimum evidence before electing the deepest band.
```

No other critical/high issues found — timeout-bounded fetch, no unbounded queries, no new auth surface (single-owner app, pre-existing routes), N+1 avoided in `saveCurriculumPlan`.

---

## Phase 5: Business feature explainer

ELEMENT: "Take the calibration quiz first" notice in the mentor chat
Possible values: Shown, or not shown (normal chat appears).
How it's calculated: the app checks whether you've ever finished this course's whole-course quiz; if not, it blocks the conversation and shows this notice instead of starting it.
Edge cases:
- The notice gives no link to the quiz — you have to find it yourself.
- Any one completed quiz unlocks the mentor for every topic in that course, forever.

ELEMENT: Your starting level for each topic after the calibration quiz
Possible values: Just aware of it / Working knowledge / Deep understanding.
How it's calculated: your score on that topic's questions in the whole-course quiz picks the band — all correct is deepest, more than half is working knowledge, otherwise just-aware.
Edge cases:
- On a course with 10+ topics the quiz asks one question per topic, so a single lucky guess can set the deepest level.
- The level can be briefly stale immediately after finishing the quiz if you jump straight into a conversation (see Phase 4 race condition).
- Once set, the manual "pick your level" prompt disappears for that topic with no easy way to correct a wrong result.

ELEMENT: "Go advanced" offer on a mastered topic
Possible values: Offered, declined, or not shown.
How it's calculated: offered once you've mastered a topic and a deeper level is available; accepting is always an explicit button press.
Edge cases:
- For a course built from a documentation site, the topic was never tied to a specific page, so nothing gets re-fetched when you accept — this doesn't work for the feature's own target flow.
- If a re-fetch does run and fails, you're still moved up a level with no notice that the refresh silently didn't happen.

ELEMENT: Source links shown under a practice question
Possible values: A list of page links, or nothing.
How it's calculated: shown when the topic is tied to a specific documentation page whose text generated the question.
Edge cases:
- For documentation-site courses this never appears — topics are never tied to a page (see S2).
- A site whose docs are a single machine-readable index file has only one course-wide source, so no per-topic link is possible even in principle.

---

## Deferred items audit

`todo.md`'s "Coding tasks" section shows 7/7 checked with no open items; this review finds that checked state does not match the diff — the S2 provenance item and S4's FE deliverable were marked resolved but are not actually satisfied. Recording as reopened items below rather than trusting the prior checkmarks.

---

## Open items (no human present to resolve — recorded for follow-up)

1. **Blocking** — `topics.sourceId` is never written for docs-site-created topics: the docs-path structured-output schema (`structureSnapshotSchema`) needs a `sourceUrl` field (mirroring `curriculum-plan.ts`'s `topicPlanSchema`), and `source-text.ts` needs a provenance marker on `llms_txt`-kind sources too, not just `link`-kind.
2. **Blocking** — S4's FE deliverable (a way to reach the calibration quiz from the blocked-Socratic screen) was never built.
3. **Blocking** — go-deeper re-fetch failures need to actually surface: either `refetchSource`'s error values need to be checked (not just relying on `.catch()`), or the failure needs to propagate to the response/UI per architecture.md's own stated failure mode.
4. **Blocking** — the depth-election race: either await `electDepthsOnCalibrationCompletion` before flipping session status to "completed" (or before the gate reads completion), or gate on the election having actually run, not just the session being complete.
5. Reopen — `archetype-rotation.integration.test.ts` now fails with `calibration_required`; needs a calibration-completion step added to its setup, or an explicit decision that this test's curriculum is exempt.
6. Non-blocking, flag for awareness — single-question-per-topic calibration can elect "deep" off one lucky guess with no correction path other than the (also broken, item 1) go-deeper flow.
7. Non-blocking — `docker-compose.yml`'s `wal_level=logical` change is unexplained by any plan file; confirm intentional.
8. Non-blocking — the 3 non-calibration failures in `archetype-rotation.integration.test.ts` (AC22/AC25/AC32) were not investigated as part of this review; unclear if pre-existing or another regression.

---

## Verdict

**needs-changes.** The calibration-gate/depth-election half of this feature (S4-S6) is solid. The provenance/lazy-questions/go-deeper half (S2, S3, S7) does not work for the documentation-site flow this feature exists to build — the docs-path output schema silently drops the field the feature depends on, and a second independent gap (no provenance marker for `llms.txt`-discovered sources) would block it again even after the first fix. Both are schema/wiring fixes, not a redesign. The race condition and silent-failure findings in Phase 4 are real production-path risks in the working half of the feature and should be fixed alongside the provenance gap.

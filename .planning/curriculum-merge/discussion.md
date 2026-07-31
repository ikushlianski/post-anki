---
type: discussion
branch: curriculum-merge
updated: 2026-07-31
---

# Discussion — curriculum-merge

## Context: this was planned unattended

No human reviewed this plan interactively. The task explicitly pre-authorized autonomous
confirmation once the consistency gate passes. This file records the research trail and the one
external check performed — an independent architect-review pass — in place of a human back-and-forth.

## The full-schema grep that produced the reassign/delete/exclude split

`ontology-split-merge/spec.md`'s own Decision #2 already enumerated curriculum's child-table set by
grep when it deferred curriculum merge: `sources`, `modules`/`topics`/`gaps`,
`curriculum_structure_turns`, `structure_research_candidates`, `probe_sessions`,
`socratic_sessions`, `lectures` (via `topic_id`), `llm_call_events` — eight table families. This plan
re-verified that enumeration directly against `apps/api/src/db/schema.ts` (read in full) rather than
trusting the prior plan's list at face value, and confirmed:

- `gaps.topicId`, `gapMastery.gapId`, `tagAssignments.nodeId`, `lectures.topicId` (and its three
  sibling tables), `probeSessionQuestions.topicId`/`sessionId` — none of these carry a
  `curriculum_id` column. They key off `topic_id`/`module_id`/`gap_id`/`lecture_id`/`session_id`,
  all of which are stable identifiers that never change value during this merge (only their owning
  row's `curriculum_id` changes, several hops away). This is what makes Decision #1 (no
  module/topic reconciliation needed) actually true rather than merely convenient — verified, not
  assumed.
- `probeSessions` has BOTH a `scope`/`scopeId` pair AND a separate nullable `curriculumId` column.
  Grepped `probeScopeSchema` in `packages/shared/src/probe-session.ts`: `z.enum(["module", "topic",
  "tag"])` — `scope` is never `"curriculum"`, so `scopeId` never needs curriculum-merge handling
  (unlike `mergeTags`, which does reassign `scopeId` for `scope: "tag"`). Only the separate
  `curriculumId` column, set contextually by module/topic-scoped session creation
  (`probe-session.repo.ts`), needs reassignment.
- `llmCallEvents.curriculumId` is nullable and append-only (`insert` at the end of
  `generateWithRetry`, no update/delete site anywhere in the codebase except a time-based cleanup
  in `llm-call-events.repo.ts` unrelated to this feature). Confirmed its one read consumer
  (`admin-observability.controller.ts`) tolerates a missing lookup gracefully before deciding to
  leave it alone (Decision #3) — this was a fact-check, not an assumption.

## The first advisor pass — five points raised before writing spec.md

An independent architect review of the pre-drafted approach was requested before any plan file was
written (this codebase's `advisor` tool, which sees the full research trail up to that point). Its
five points and how each was resolved:

1. **Blocking: the pending-assistant-turn unique index.** The advisor caught that the originally-
   assumed "just reassign `curriculum_structure_turns` like every other table" approach would violate
   `curriculum_structure_turns_pending_assistant_unique` whenever the source curriculum has a pending
   assistant turn, and correctly pushed back on the initial hand-wave ("likely both confirmed") as
   backwards — noticing a duplicate while shaping the second one is a plausible trigger for wanting to
   merge, not an edge case. Resolved as spec.md Decision #2: delete both tables' source rows instead
   of reassigning them, and add a new precondition (`pending_structure_turn`) that rejects the merge
   outright when the SOURCE has a turn still mid-generation. A second advisor pass, after the plan
   files were drafted, pushed further: it questioned whether the precondition should also check the
   TARGET side (the first draft did, "to be safe," with no stated mechanism). Tracing this through —
   reading `confirmStructure` in full (no `clearCurriculumStructure()` call before its
   `saveCurriculumPlan()`, so no clear-then-save collision on the confirm path) and the
   pending-turn-resolution write path (`updateStructureTurn` writes back to its own turn row by id,
   never touching `modules`/`topics`) — found no mechanism by which a pending turn on the TARGET is
   put at risk by this merge, since the target's `curriculum_structure_turns` rows are never deleted
   or reassigned. The precondition was narrowed to source-only on that basis (see spec.md Decision
   #2's verification note and SCENARIO 4's Case 2, which asserts a target-side pending turn does NOT
   block the merge). That same trace surfaced a real, different, previously-unnamed race — see point
   5 below.
2. **Module reconciliation: confirmed correct, sharpened.** The advisor validated "additional
   modules, no matching" against the actual schema (no unique index on `modules.title`/`topics.title`,
   stable ids) and flagged two concrete follow-ons that became load-bearing parts of Decision #1:
   `topics.curriculumId` must be reassigned in lockstep with `modules.curriculumId` (or
   `getCurriculumDetail` silently renders modules with no topics), and the source's module `order`
   values need an offset to avoid a confusing duplicate-order collision under `sortForDisplay`.
3. **Reassignment scope vs. `llm_call_events`.** The advisor flagged that "reassign every table with
   a `curriculum_id` column" is the right instinct for content/state tables but wrong for an
   append-only observability log, where reassigning falsifies history. Verified the consumer
   tolerates the gap (see above) before committing to Decision #3, and made sure the DoD's
   zero-orphan proof explicitly scopes to the reassignment set rather than every table with a
   `curriculum_id` column — an unscoped proof would have failed on `llm_call_events` for the wrong
   reason.
4. **`domain_node_id` drop.** The advisor named this explicitly as a real, small, documented
   semantic loss adjacent to issue #61 rather than something requiring a fix here — folded into
   Decision #4 verbatim.
5. **Shared locking code.** The advisor's framing — self-merge guard + sorted-pair advisory lock +
   re-read-inside-lock is genuinely identical across all three merge functions, while the
   reassignment bodies share nothing — is what shaped Decision #6's `withMergeLock` extraction, and
   its specific recommendation (back-port `mergeSubjects`/`mergeTags` conditional on their existing
   integration tests staying green in the same commit) became the DoD's explicit two-outcome
   instruction: back-port ships only if those tests pass; otherwise `mergeCurricula` ships alone on
   the new helper and the older two functions keep their current, working, copy-pasted code
   untouched. This was chosen over the alternative (extract the helper but only use it for
   `mergeCurricula`, leave the copies alone permanently) because leaving three near-identical
   30-minute-old-pattern implementations to diverge over time is a real, if slow, maintenance cost —
   and this project already has the exact regression tests needed to make the back-port a checked
   claim rather than a hopeful one.

## The second advisor pass — stress-testing the drafted plan files

After `spec.md`/`scenarios.md`/`architecture.md`/`playwright.md`/`state-fixtures.md` were written,
a second independent review (same `advisor` tool, now seeing the drafted files) was requested before
confirming the plan — the "grill-me" step this project's planning flow runs automatically for
Medium-and-above plans, done here as a second architect pass since no human was available to
interview. Four points, one blocking:

1. **Blocking, covered above** — the target-side pending-turn check had no stated mechanism. Traced
   and resolved: narrowed to source-only, and the trace itself surfaced a second, more serious
   residual race (documented as spec.md Decision #5 Instance B: `reparseCurriculum`/`retryResearch`
   calling `clearCurriculumStructure()` on a curriculum a concurrent merge just moved modules into —
   real data loss, not mere invisibility, verified by reading `curriculum-parse.orchestrator.ts` in
   full). This is a materially better outcome than the original target-side check would have been:
   that check would have given a false sense of covering a "structure-shaping" race while leaving
   the actual, worse `clearCurriculumStructure` race completely unmentioned.
2. **The `llm_call_events` DoD assertion could fail for the wrong reason.** A bare `count(*) > 0`
   check depends on test setup happening to produce at least one row and on `generateWithRetry`
   passing a non-null `curriculumId` — neither independently verified, and a false failure would land
   on the one DoD item meant to prove a deliberate non-action. Fixed: the DoD (spec.md, Backend
   step 5 + step 11) now snapshots the count before the merge and asserts it unchanged after, which
   is the actual claim Decision #3 makes regardless of how many rows setup produces.
3. **Reassigning `sources` changes the target's derived origin badge — an unstated consequence.**
   `resolveCurriculumOrigin()` computes `Curriculum.origin` from a curriculum's source-row kinds, and
   `OriginBadge` renders off it; moving the source's `sources` rows onto the target can flip which
   badge the target shows, and any `pending`-approval sources move along with no guaranteed UI path
   to re-surface them if the target is already past `awaiting_source_approval`. Neither is a bug,
   both are now named explicitly in Decision #3's neighborhood in spec.md so they're recognized as
   consequences rather than mistaken for regressions during implementation or review.
4. **Two cheap verifications, both confirmed and corrected:** `ls docs/architecture/` showed
   `ontology-split-merge.md` is a sibling FILE to the `ontology-split-merge/` directory (which holds
   `review.md`), not something inside that directory — spec.md's Documentation changes section was
   wrong and is fixed. Naming: the shared-type schemas were specced as `mergeCurriculumInput`/
   `mergeCurriculumResultSchema` against a repo function named `mergeCurricula` — inconsistent with
   the existing `mergeSubjectsInput`→`mergeSubjects`, `mergeTagsInput`→`mergeTags` convention;
   renamed to `mergeCurriculaInput`/`mergeCurriculaResultSchema` throughout.

Confirmed as already correct by this pass, no change needed: the unchecked `[ ]` e2e boxes (the
`[x]` seen in `ontology-split-merge/scenarios.md` is that plan's post-implementation state, not its
original planning state); skipping the Phase 6.3c subagent fan-out; the module-order-offset design
(no unique index on `(curriculum_id, order)` to violate); the `probe_sessions` analysis (module/
topic-scoped `scopeId` values stay valid since those ids never change).

## Verification-repo action/state inventory (Phase 6.2/6.3, read directly rather than fanned out)

Given the scenario count (4, two e2e + two backend-only) and that nearly the entire action surface
and state contract were already resolved by reading the exact precedent files before Phase 6 began
— `features/subject/actions/merge-subject.action.ts`, `features/subject/tests/
merge-subjects-full-reassignment.test.ts`, `features/curriculum/actions/study-technology.action.ts`,
`db/pg.ts` (the `countWhere`/`rowExists`/`getRow`/`getRows` helpers already exist and cover every
proof this plan's DoD needs) — the per-scenario subagent fan-out (Phase 6.3c) was skipped as
unnecessary overhead. There was nothing left unresolved for a subagent to discover independently;
fanning out would have re-derived facts already confirmed by direct reading, not surfaced new ones.

Existing actions reused: `createSubject`, `studyTechnology`, `assignTagToModule` (all already used
by `ontology-split-merge`'s own S1/S3). Existing action `mergeSubject`/`openMergePicker` are the
direct template for the two new action gaps this plan proposes: `mergeCurriculum` and
`openCurriculumMergePicker` — same shape, same testid-based interaction, same
wait-for-detached-from-DOM completion proof, applied to a curriculum row instead of a subject card.

No new state mocks proposed — every scenario builds its own state in-test via real actions
(`baseline-only`), the same choice `ontology-split-merge` made for its own S1-S3, and for the same
reason: building the real-world duplicate in-test is also what proves the reassignment path itself
works, not a stand-in for it.

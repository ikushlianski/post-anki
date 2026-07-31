---
type: plan-summary
branch: curriculum-merge
state: confirmed
updated: 2026-07-31
---

# Plan summary — Curriculum merge (issue #60)

**Complexity:** Medium — same shape as `ontology-split-merge`'s subject/tag merge (advisory-lock
transaction, direct reassignment, one new endpoint, one new UI affordance), applied to a third
entity whose child set is nested (modules → topics → gaps/tags) rather than flat. No schema
migration, no new tables, no new agent/orchestrator layer — what makes this Medium rather than
Simple is the larger, fully-enumerated reassignment set (5 tables to update, 2 to delete, 1
deliberately left alone) and one genuine new precondition (the pending-structure-turn conflict)
that subject/tag merge never had to handle.

**Scope shipped this pass:** curriculum merge only, restricted to two curricula in the same
subject. No module/topic reconciliation (B's modules land as additional modules under A, unmatched
— see Decision #1). No split. No cross-subject merge.

**The real case this closes:** two curricula covering the same technology, created independently at
different times under the same subject (the issue's own example: two "React Hooks" curricula), can
be merged from the app with zero orphaned or duplicated rows.

**Files:**
- `spec.md` — endpoint contract, the full reassign/delete/exclude table enumeration, Decisions made
  autonomously, Definition of Done per layer.
- `scenarios.md` — 4 scenarios (S1-S2 e2e, S3-S4 backend/integration-only, with reasoning).
- `architecture.md` — the reassignment data-flow diagram, the shared `withMergeLock` extraction and
  its conditional back-port onto `mergeSubjects`/`mergeTags`, the pending-turn precondition
  sequencing.
- `discussion.md` — the full-schema grep that produced the reassign/delete/exclude table split, the
  advisor pass and how each of its five points was resolved.
- `playwright.md` — action gaps (`mergeCurriculum`, `openCurriculumMergePicker`), testid list,
  scenario→action map.
- `state-fixtures.md` — state contract per scenario; the e2e scenarios build their own state in-test
  via the existing `studyTechnology` action (same pattern S1 in `ontology-split-merge` used).

**Consistency gate:** all 9 checks pass — see below.

## Consistency gate results

1. **Scenario → Acceptance.** PASS — every SCENARIO has an `Acceptance:` block with BE/FE/Infra
   populated or explicitly `None` (S3/S4 explicitly state `FE: None` with reasoning; Infra is
   `None` everywhere — no migration).
2. **Scenario → e2e box.** PASS — S1, S2 each carry exactly one unchecked
   `[ ] @curriculum-merge.S<N> — e2e test written` line, born unchecked. S3/S4 carry an unchecked
   integration-test-file line instead, per their explicit backend-only verdict.
3. **Scenario → state contract.** PASS — every e2e scenario has a full row in `state-fixtures.md`
   with concrete entities tagged `subject`/`scenery`, a state source (`baseline-only`, built in-test
   the same way `ontology-split-merge`'s S1 was), and a reseed strategy.
4. **Scenario → action map.** PASS — every e2e scenario appears in `playwright.md`'s
   scenario→action/testid map; both action gaps are in the consolidated table with their used-by
   list; no scenario composes an action that isn't either existing or a listed gap.
5. **Diagram → scenario/architecture.** PASS — all Mermaid diagrams in `architecture.md` map to a
   real structural change or decision this plan makes — none decorative.
6. **Deriver (rare, e2e-first).** N/A — no pure-logic Code item was flagged unit-worthy; every
   scenario is either e2e or a real-Postgres integration test proving a database effect.
7. **Documentation.** PASS — `spec.md`'s "Documentation changes" section commits to updating
   `docs/architecture/ontology-split-merge/` (renamed in scope to cover all three merge types, per
   spec.md) rather than opening a parallel doc for what is the same mechanism.
8. **Constitution + framework safety.** PASS — S1/S2 build their own curricula-under-test via real
   actions in-test (never seed the subject-under-test); no scenario targets a forbidden/prod target
   (all run against the local e2e Postgres per `project.json`); no scenario is parked as
   `test.skip`.
9. **Open questions → carried.** PASS — `playwright.md` and `state-fixtures.md` both state zero open
   questions; every fork requiring a judgment call is resolved in spec.md's "Decisions made
   autonomously", cross-checked against two independent architect passes recorded in
   `discussion.md` (one before drafting, one stress-testing the drafted files — the second pass
   found and fixed a real gap: an unjustified target-side precondition check that would have masked
   a more serious, now-documented `reparseCurriculum`-vs-merge data-loss race).

Consistency gate: PASS — `spec.md`, `scenarios.md`, `playwright.md`, `state-fixtures.md` promoted to
`state: confirmed`.

## Handoff

Next phase: `/write-playwright-tests curriculum-merge` to author the red e2e tests for S1-S2 and the
two integration test files for S3-S4, then `/implement-playwright`. Not run as part of this planning
pass — this run was scoped to planning only, per the task's instructions.

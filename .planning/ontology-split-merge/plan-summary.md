---
type: plan-summary
branch: ontology-split-merge
state: confirmed
updated: 2026-07-28
---

# Plan summary — Manage the ontology over time (issue #56)

**Complexity:** Medium — two new endpoints with transaction/locking semantics, a new UI
affordance on two existing surfaces, a bounded and fully-enumerated child set (verified by grep,
not inferred from schema column names). Not Complex: no schema migration, no new tables, no new
agent/orchestrator layer.

**Scope shipped this pass:** merge only (no split), for Subjects and Tags only (no Curriculum/course
merge). See spec.md's "Decisions made autonomously" for the full reasoning behind both narrowings —
both are stated as deliberate, reasoned scope decisions, not silent cuts, and the issue's own
Done-when ("a Subject, course, **or** tag") is satisfied by Subject+Tag merge on its own terms.

**The real-world case this closes:** the "Webdev" / "Programming / Web Development" duplicate
subjects sitting in production today (named in both the wishlist entry and GitHub issue #56) can
be merged from the home page, with the absorbed subject's curricula, `domain_nodes` tree, and
tagged content all correctly reassigned to the survivor.

**Files:**
- `spec.md` — endpoint contracts, data model (none — no migration), Decisions made autonomously,
  Definition of Done per layer.
- `scenarios.md` — 5 scenarios (S1-S3 e2e, S4-S5 backend/integration-only with reasoning for why).
- `architecture.md` — merge-flow diagrams (Subject, Tag), advisory-lock sequencing diagram, the
  explicitly-not-closed `createCurriculum`-vs-merge race diagram, the cycle-guard non-issue
  verification.
- `playwright.md` — action gaps (`mergeSubject`, `openMergePicker`, `createCurriculumUnderSubject`,
  `assignTagToModule`, `createTag`, `mergeTag`), testid list, scenario→action map.
- `state-fixtures.md` — every e2e scenario is `baseline-only`, all state built in-test (no seed
  data provides the real-world duplicate; building it in-test is also what proves the reassignment
  path itself, not a stand-in).
- `discussion.md` — the research trail: grep-based child-table enumeration (this schema has almost
  no FKs), the cycle-guard finding relayed mid-planning and how it was resolved, the
  `createCurriculum` transaction-boundary read that shaped the concurrency decision, the advisor
  pass and how each of its five points was addressed.

**Consistency gate:** all 9 checks pass — see below.

## Consistency gate results

1. **Scenario → Acceptance.** PASS — every SCENARIO in `scenarios.md` has an `Acceptance:` block
   with BE/FE/Infra populated or explicitly `None` (S4/S5 explicitly state `FE: None` with
   reasoning; all Infra rows are `None` — no migration).
2. **Scenario → e2e box.** PASS — S1, S2, S3 each carry exactly one unchecked
   `[ ] @ontology-split-merge.S<N> — e2e test written` line. S4/S5 carry an unchecked unit/integration
   test-file line instead, per their explicit backend-only verdict.
3. **Scenario → state contract.** PASS — every e2e scenario has a full row in `state-fixtures.md`
   with concrete entities, each tagged `subject`/`scenery`, a state source (`baseline-only` for
   all three), and a reseed strategy.
4. **Scenario → action map.** PASS — every e2e scenario appears in `playwright.md`'s
   scenario→action/testid map; every action gap (6 total) is in the consolidated table with its
   used-by list; no scenario composes an action that isn't either existing or a listed gap.
5. **Diagram → scenario/architecture.** PASS — all four Mermaid diagrams in `architecture.md` map
   to a real structural change this plan makes (Subject merge data flow, Tag merge data flow, the
   lock sequencing, the explicitly-not-closed race) — none decorative.
6. **Deriver (rare, e2e-first).** N/A — no pure-logic Code item was flagged unit-worthy by the
   Phase 6.0 triage; every scenario is either e2e or a real-Postgres integration test proving a
   database-level effect, not a pure function extraction.
7. **Documentation.** PASS — `spec.md`'s "Documentation changes" section commits to a new
   `docs/architecture/ontology-split-merge.md`, verified no existing doc covers subject/tag
   lifecycle management.
8. **Constitution + framework safety.** PASS — no scenario seeds its own subject-under-test (S1-S3
   all build their subject entities via real actions in-test, tagged accordingly in
   `state-fixtures.md`); no scenario targets a forbidden/prod target (all run against the local
   e2e Postgres per `project.json`); no scenario is parked as a future `test.skip`.
9. **Open questions → carried.** PASS — `playwright.md` and `state-fixtures.md` both explicitly
   state zero open questions; every fork this plan needed to resolve was resolved during planning
   (see spec.md's "Decisions made autonomously" for the six judgment calls made without a safe
   default, and `discussion.md` for the advisor pass that stress-tested them).

Consistency gate: PASS — `spec.md`, `scenarios.md`, `playwright.md`, `state-fixtures.md` promoted
to `state: confirmed`.

## Handoff

Next phase: `/write-playwright-tests ontology-split-merge` to author the red e2e tests for S1-S3
and the two integration tests for S4-S5, then `/implement-playwright`. Not run as part of this
planning pass, per the task's explicit instruction to plan only.

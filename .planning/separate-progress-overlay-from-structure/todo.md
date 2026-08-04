---
type: todo
branch: decouple-curricula-from-domain-nodes
task: "Separate progress overlay from structure — show mastery on top of static map (issue #85)"
state: open
updated: 2026-08-04
---
# Todo: Separate progress overlay from structure

## Decisions to make
None — all four forks identified during planning classified `safe-default` via fork-classifier (0/10
criteria matched each time) and were resolved with a recommended default rather than queued. See
spec.md's "Decisions made autonomously" for the full list and reasoning. No `needs:decision` label
was added to issue #85.

## To review / clarify
None.

## Manual steps
None — no seed script, no manual migration step, no production-only action. This ticket is a pure
deriver + UI change plus one backend regression test.

Found during red-team review, not a manual step but a hard sequencing dependency: #84's changes are
still uncommitted in this same worktree. `/implement-ie` for this ticket must run here, after #84 is
committed — never against a fresh `main` checkout, where none of #84's schema/code exists yet. See
spec.md's "Hard dependency" note.

## Post-deploy checks
- [ ] Once any subject has real domain nodes with zero curricula mapped (either the still-unseeded
  static IT taxonomy from #84, once Decision #2 there lands, or any existing legacy `ai_generated`
  subject with an unmapped node), open `/subject/:id/map` and confirm the gap badge actually renders
  distinctly from the priority-distance (amber) and superseded (orange) badges in the real browser,
  not just in the component test's DOM assertions.

## Coding tasks
- [x] `domainMasteryStatus` deriver + tests (packages/core/src/domain-map/)
- [x] Export from packages/core/src/domain-map/index.ts
- [x] `domain-map-tree.tsx` gap badge wiring
- [x] `domain-map-tree.test.tsx` component tests
- [x] `domain-map-full-structure.integration.test.ts` regression test
- [x] Verification: vitest (unit + component + integration), full typecheck
- [x] Runtime proof: Playwright click-through against a real dev server showing the gap badge on an
  uncovered node and the existing "add course here" control still working beneath it

Implementation note: the shared local `post-anki-dev-db` (port 5437) turned out to have drifted
schema (missing `subjects.embedding` columns from migration 0027) from other worktrees/branches
having migrated it with a different history — unrelated to this ticket. Rather than touch that
shared container, the runtime proof ran against a disposable throwaway Postgres container, migrated
cleanly from this branch's own migrations, seeded with a demo subject/domain tree, and torn down
after the screenshot was captured. `apps/api/.env.local` was used to point the dev API at it
temporarily and was restored to its original content afterward.

## Follow-on candidates (not this ticket)
- Distinguish "never studied" from "studied but zero mastery" as two different gap signals, if
  real usage ever needs that distinction (would require exposing `topicsIncluded` on
  `DomainNodeTreeItem` — see spec.md's Decisions).
- A subject-wide "gap list" or "jump to next gap" navigation feature, if the per-node "add course
  here" CTA proves too slow to discover gaps once there's real taxonomy data (#84's seeded IT
  taxonomy, once Decision #2 lands) to look at.
- Bubbling a "has an uncovered descendant" flag up to grouping/parent nodes (SCENARIO 6's explicit
  scope boundary), if a real subtree average hiding a real gap turns out to be confusing in practice.

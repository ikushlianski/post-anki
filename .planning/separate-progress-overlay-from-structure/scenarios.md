---
type: scenarios
branch: decouple-curricula-from-domain-nodes
task: "Separate progress overlay from structure — show mastery on top of static map (issue #85)"
state: confirmed
updated: 2026-08-04
---
# Scenarios: Separate progress overlay from structure

## Business Scenarios

SCENARIO 1: Full structure always renders, regardless of coverage

A subject's domain map shows every `domain_nodes` row belonging to it — including a node with zero
curricula ever mapped anywhere in its subtree — with no node hidden or omitted for lack of coverage.

What to verify:
- `getDomainMapForSubject` returns a node with `curricula: []` and `percent: 0` rather than omitting
  it, for a node no curriculum has ever been confirmed against.
- The same holds for a whole disconnected subtree (a parent and its children, none of which any
  curriculum touches) — every node in it still appears in the tree, not just leaves.
- This is a regression test on existing behavior (issue #84 already made this true structurally by
  removing curricula's ability to create nodes) — no new backend logic, just a test locking it in so
  a future change can't silently reintroduce "only show nodes with a curriculum."

SCENARIO 2: A node with nothing learned is flagged as a gap

A node whose `percent` is 0 renders with a visually distinct "gap" treatment, different in color from
the badge shown on a node with any mastery, so a fully-unstudied area reads differently from a
partially-studied one at a glance.

What to verify:
- `domain-map-tree.tsx` renders a `data-testid="domain-map-node-gap-badge-{nodeId}"` element for a
  node with `percent === 0`.
- That element is not rendered for a node with `percent > 0`.
- The gap badge uses a color distinct from the existing priority-distance (amber) and superseded
  (orange) badges, so three different signals never blur into one color.

SCENARIO 3: Mastery is visually layered onto the node, not baked into its identity

A node's name, description, and position in the tree render identically regardless of its mastery —
only the badge/color changes with `percent`. Structure (what exists to learn) and mastery (what's
been learned) are visually two different things on the same node, not one blended label.

What to verify:
- The node's name/description/children render unconditionally on `percent`.
- Only the badge region changes appearance based on `percent` — no other part of the node's markup
  is conditioned on mastery.

SCENARIO 4: A gap has a working, visible next action

A node flagged as a gap still renders the existing "add course here" control immediately below it,
unchanged and functional — clicking it opens the same curriculum-creation flow already wired to that
node today.

What to verify:
- `CreateCurriculumForm` (`data-testid="domain-map-add-course-{nodeId}"`) renders for gap nodes
  exactly as it already does for every node today — no new component, no regression to the existing
  control.
- This is the concrete, testable definition of "actionable" for this ticket: a gap is actionable if
  the existing course-creation action is visibly present and works, immediately next to the badge
  that flagged it as a gap. No new navigation, filter, or "jump to next gap" feature is in scope.

SCENARIO 5: A grouping node's own gap status reflects its whole subtree, not just its direct children

A parent node with zero curricula anywhere in its descendant subtree is itself flagged as a gap — the
existing subtree rollup in `domainNodeProgress` already computes this; this scenario proves the new
badge honors that same rollup rather than looking only at the node's own direct mappings.

What to verify:
- A three-level chain (grandparent → parent → leaf) with no curriculum mapped anywhere in it shows
  the gap badge on all three levels, not just the leaf.

SCENARIO 6 (edge case): A mixed subtree does not hide a real gap behind a sibling's coverage

A parent node with two children — one fully covered (real mastery > 0), one a pure gap (zero
coverage) — shows its OWN badge based on its own subtree average (which may be > 0, so the parent
itself is not flagged as a gap), while the uncovered child still shows its own gap badge
independently. A real hole in the tree must never disappear just because a sibling elsewhere pulls
the parent's average above zero.

What to verify:
- A real backend integration test (not a stubbed prop) proves the actual rollup: a parent with one
  child holding a confirmed, mastered curriculum mapping and one child with no mapping at all
  produces `percent > 0` at the parent and `percent === 0` at the uncovered child, via
  `domainNodeProgress`'s real subtree averaging.
- The covered child shows a non-gap badge, the uncovered child shows a gap badge, and the parent's
  own badge is computed from its own `percent` — no additional "any descendant is a gap" flag bubbles
  up to the parent (that is explicitly out of scope for this ticket — see Scope boundary in spec.md).
  The frontend component test proves this rendering logic against given percents; the backend test
  above proves the percents themselves are real.

## Technical/Architectural Scenarios

None — this is a UI/derived-read-model change, no new async boundary, service, or infrastructure.

---

Plan auto-confirmed by grand-loop (no human present to review) — consistency gate passed with 0
gaps, and a dispatched fresh-eyes subagent red-team pass found 3 real gaps (SCENARIO 6's rollup
never wired to a real test, a frontend test-mocking gap, and a #84 sequencing dependency — all fixed
and re-verified; see spec.md's "Red-team review" section for full detail).

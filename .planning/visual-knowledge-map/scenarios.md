---
type: scenarios
branch: decouple-curricula-from-domain-nodes
task: "Visual knowledge map — graph/mind-map rendering of objective taxonomy with mastery overlay (issue #86)"
state: confirmed
updated: 2026-08-04
---
# Scenarios: Visual knowledge map

Two forks below are queued for human confirmation on GitHub issue #86 (`needs:decision` label,
comment posted 2026-08-04) — the visualization type (mind map vs. network graph vs. treemap vs.
radial) and whether the graph replaces or supplements the existing list view. Every scenario below
is written against the recommended option for each: mind-map/tree layout, additive toggle
alongside the existing list view. See spec.md's "Decisions pending confirmation."

## Business Scenarios

### SCENARIO 1: The domain map page gains a "Map" view alongside the existing "List" view
A user on `/subject/$subjectId/map` sees a two-way toggle (List / Map). List is selected by
default — the page renders exactly as it does today (`DomainMapTree`, unchanged). Selecting Map
renders the new graph view instead, without navigating to a different route or losing the page's
header/back-link.

What to verify:
- Default view on page load is List — zero behavior change for anyone who never touches the
  toggle.
- Toggling to Map and back to List preserves the List view's existing functionality untouched
  (add-course forms, merge button, target-depth control all still present and working).
- The toggle state is local to the page visit (not persisted across reloads) — no new stored
  preference, no new backend field.

### SCENARIO 2: Mastery is visible as color at a glance across the whole graph
Every rendered node's fill color reflects `percent`: nodes with `percent === 0` render in a fixed
grey/rose "gap" color (reusing `domainMasteryStatus` from issue #85 — no separate "never studied"
vs. "studied but zero" distinction, matching that ticket's own decision); nodes with `percent > 0`
render on a green gradient scaling from pale green (just above 0%) to solid green (100%). A user
scanning the graph can identify untouched areas (grey/rose) and strong areas (solid green) without
reading any number.

What to verify:
- `percent === 0` nodes are visually distinct from any `percent > 0` node, regardless of gradient
  position — this is a hard boundary, not a smooth transition through zero.
- The numeric `percent` is still shown as text/tooltip on the node (color alone is never the only
  signal — accessibility: color-blind users must still be able to read the exact value).
- A fully-mastered node (`percent === 100`) and a barely-started node (`percent === 1`) are both
  visibly on the "progress" side of the hard boundary, at different points along the gradient.

### SCENARIO 3: Curricula-covered paths are visually distinguished from uncovered ones
Any node with at least one curriculum attached (`curricula.length > 0`), and every ancestor edge
from that node up to the root, renders with a distinct highlighted edge style (vs. the default edge
style for the rest of the tree). This lets a user trace, at a glance, which branches of the taxonomy
have any course material behind them at all, independent of mastery percent.

What to verify:
- A node with zero curricula but 0% mastery (a true, unaddressed gap) shows default (non-
  highlighted) edges up to its parent.
- A node with a curriculum attached but low mastery shows a highlighted edge AND a gap/low-progress
  fill color simultaneously — coverage and mastery are independent signals, both visible at once.
- Highlighting is computed purely from the existing tree structure and each node's own
  `curricula.length` — no new data is fetched.

### SCENARIO 4: Clicking a node with children toggles expand/collapse (drill-down)
Clicking anywhere on a node's body (`data-testid="domain-map-graph-node-${id}"`) that has
`children.length > 0` toggles whether its children (and their descendants) are rendered. Collapsed
is the default state for any node below depth 1 on initial render (SCENARIO 9 covers why). A small
chevron/count indicator on the node shows whether it's collapsed and, if so, how many direct
children are hidden. This click target is distinct from SCENARIO 5's details target — clicking the
node body never opens the detail panel, and clicking the details affordance never toggles collapse,
even on a node that has both children and curricula.

What to verify:
- Clicking a collapsed node with children reveals exactly its direct children (not the whole
  subtree) — collapse/expand is one level at a time, matching how the previous state's already-
  collapsed grandchildren stay collapsed.
- Clicking a leaf node (`children.length === 0`) does nothing on this click target — no toggle
  affordance is shown for leaves.
- Collapse/expand state lives in component state only — it resets to the depth-bounded default
  every time the Map view is (re)selected or the page reloads; it is never persisted.

### SCENARIO 5: A secondary action on a node opens a read-only detail panel
Each node renders a small, separate "details" affordance
(`data-testid="domain-map-graph-node-details-${id}"` — a distinct click target from the node body
itself, so it never conflicts with SCENARIO 4's expand/collapse) that opens a panel
(`data-testid="domain-map-graph-detail-panel"`) showing:
node name, description, exact percent, gap/superseded/priority-distance badges (same semantics as
the existing list view), and its curricula as clickable links to `/curriculum/$curriculumId`. The
panel also offers a "Manage in list view" link that switches the page back to the List toggle.

What to verify:
- Opening the panel does not navigate away from `/subject/$subjectId/map` and does not change the
  graph's current expand/collapse state.
- Every badge shown in the existing list view for a node (`gap`, `superseded`, `priority-distance`)
  appears in the panel for that same node, using the same underlying data — no new backend field.
- The panel does not embed the list view's action forms (add-course, merge, set-target-depth) —
  those remain exclusively in List view, reached via "Manage in list view." This keeps the graph
  view's scope to visualization + read + navigate, not a second copy of the action UI.
- "Manage in list view" switches the toggle to List; whether it also scrolls to/highlights the
  specific node in the list is a nice-to-have, not required for this scenario to pass.

### SCENARIO 6: A subject with no seeded taxonomy shows the same empty state in either view
A subject whose domain tree is empty (`tree.length === 0`) shows the existing "No domain map
seeded for this subject yet" message regardless of which toggle is selected — the Map toggle does
not need its own separate empty-state design.

What to verify:
- The empty-state message and its wrapper element are identical in both List and Map toggle states.
- The List/Map toggle itself is still rendered (so a user isn't confused about why there's no
  toggle) even though there's nothing to visualize yet — or, acceptably, the toggle is hidden
  entirely when `tree.length === 0`, matching how the List view already short-circuits before
  rendering `DomainMapTree`. Either is acceptable; whichever is simpler to implement given the
  existing route's early-return structure.

## Technical/Architectural Scenarios

### SCENARIO 7: Layout computation is a pure, unit-tested function
`computeDomainMapLayout(nodes, collapsedNodeIds)` — a new deriver in `packages/core` — takes the
existing `DomainNodeTreeItem[]` tree (unchanged shape) plus a `Set<string>` of currently-collapsed
node ids, and returns the positioned nodes/edges the graph renders, including each edge's
highlighted-vs-default flag (SCENARIO 3) and each node's collapsed/child-count metadata
(SCENARIO 4). No DOM, no React, no network call — same class of function as `domainNodeProgress` in
this same package.

What to verify:
- Given a 3-level tree with no collapsed ids, every node in the input appears exactly once in the
  output, and every parent-child pair produces exactly one edge.
- Given a collapsed id, none of that node's descendants (at any depth) appear in the output nodes
  or edges — collapsing a mid-tree node removes its whole subtree from the render, not just its
  direct children.
- A node's edge-to-parent is flagged highlighted iff that node OR any of its descendants (still
  present in the filtered output or not) has `curricula.length > 0` — SCENARIO 3's rule, computed
  once here rather than re-derived per render in the component.
- Cycle-safety: mirrors `domainNodeProgress`'s depth-capped, visited-set-guarded traversal rather
  than trusting the input tree can't contain a cycle, even though today's data never does.

### SCENARIO 8: Mobile-responsive rendering has a concrete, checkable definition
Below the 640px (Tailwind `sm`) breakpoint already used elsewhere on this route: the graph canvas
renders full viewport width (no side padding inside the canvas container itself), has an explicit
fixed height so it doesn't fight page scroll, and every node's clickable areas (body + details
affordance) meet a 44×44px minimum touch target. Pan and pinch-zoom work via the rendering
library's built-in touch handling — no custom touch-gesture code is written for this.

What to verify:
- The canvas container carries the specific Tailwind classes that produce full-width-below-640px
  and a fixed height — checkable by asserting those classes are present in a component test, not
  just "looks fine."
- The custom node component's clickable elements carry Tailwind's `min-h-11 min-w-11` (= 44×44px)
  — checkable the same way, against a named, concrete class rather than "some sizing style."
- No scenario requires an actual mobile device or emulator for the automated test; the manual/live
  check at a 375×667 viewport (this repo's established DoD pattern for UI it doesn't
  Playwright-cover) is what confirms it renders and behaves correctly in a real browser.

### SCENARIO 9: Initial render is depth-bounded, not tied to total taxonomy size
On first rendering the Map view, only nodes at depth 0 and depth 1 are expanded by default; every
node at depth 2 or deeper starts collapsed (SCENARIO 4's default state). This bounds the initial
render to the depth-0/1 node count specifically — it is NOT a guarantee that this stays small
regardless of taxonomy shape: it only stays small if depth-0/1 themselves stay narrow, which is
true of the design target this ticket was scoped against (15-20 top-level domains, most growth
expected at depth 2+) but is an assumption about taxonomy shape, not something the algorithm
enforces. A taxonomy that turned out shallow-but-wide (e.g. many direct children at depth 1) would
still render all of them on first paint. This is a stated, accepted limitation, not a claim that
depth-bounding solves rendering cost for every possible taxonomy shape.

What to verify:
- For a synthetic 3-level tree with a large number of leaf nodes at depth 2, the initial rendered
  node count equals only the depth-0 and depth-1 node count, not the full tree size — proven by a
  component/deriver test with a taxonomy sized well beyond what's seeded today (at least 50 nodes
  across the 3 levels), not just the current ~18-node seed.
- Expanding a depth-1 node reveals only its direct depth-2 children (SCENARIO 4's one-level-at-a-
  time rule) — the render never jumps from depth-bounded to fully-expanded in one click.
- This default-collapse behavior is a property of `computeDomainMapLayout`'s initial
  `collapsedNodeIds` argument (every id at depth ≥ 2, computed once when the Map view is first
  selected), not a separate code path from SCENARIO 4/7's general collapse mechanism.

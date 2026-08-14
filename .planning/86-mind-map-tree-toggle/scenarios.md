---
type: scenarios
branch: 86-mind-map-tree-toggle
task: "Split the domain-map graph view into two distinct layouts — mind-map and tree/hierarchy — with a toggle between them (#86 widened scope)"
state: planned
updated: 2026-08-14
---

# Scenarios: Mind-map / tree-hierarchy dual view (#86 widened)

**22 acceptance criteria.** Deliberately sized smaller than #96's 20-with-server-guard or #36's 37
(new table + column) — everything expensive (data fetch, node card, detail panel, collapse state,
mastery color, highlight computation, the `ResizeObserver` test stub) is already live and reused
unmodified from the original #86 pass. The genuinely new surface is one layout variant, one edge
variant, a widened toggle, and their tests — see spec.md's "Decisions made autonomously" #8 for
exactly what stays untouched.

No new Playwright plan — this repo has no committed e2e suite for the domain-map area at all
(confirmed: no `playwright.md` exists under `.planning/visual-knowledge-map/` either); the original
#86 ticket's own DoD pattern (live-browser runtime proof at desktop + 375×667 viewport) is reused
here rather than introducing new e2e coverage this ticket didn't ask for.

## Master acceptance criteria list (22 items, each independently walkable)

**`domain-map-layout.ts` — mode dispatch**

1. `computeDomainMapLayout(nodes, collapsedNodeIds, mode)` accepts an optional third parameter,
   `mode: 'tree' | 'mindmap'`, defaulting to `'tree'` when omitted.
2. Every one of the 11 existing test cases in `domain-map-layout.test.ts` passes unmodified with
   zero edits to their bodies — proven by that file's diff containing only additions.
3. In `'mindmap'` mode, the output shape is identical to `'tree'` mode's — same
   `DomainMapLayoutNode`/`DomainMapLayoutEdge` fields, only the `x`/`y` values (and each edge's
   derived `id`) differ.
4. `'mindmap'` mode reuses the exact same `buildVisibleTree`/`computeHighlightMap` output as
   `'tree'` mode for an identical input — collapse filtering and curricula-coverage highlighting are
   computed once, independent of mode.
5. Cycle-safety and the `MAX_DEPTH` guard apply identically in both modes — a cyclic or
   pathologically deep synthetic input is bounded the same way regardless of `mode`.

**`domain-map-radial-layout.ts` — the new radial math**

6. `radiusForDepth(depth, nodeCountAtDepth)` returns `0` for `depth === 0` (root always at center).
7. For the real seeded taxonomy's actual top-level domain count (15, loaded from
   `apps/api/scripts/seed-data/it-taxonomy.yaml`, not a synthetic guess), `radiusForDepth(1, 15)`
   returns a radius large enough that 15 evenly-spaced points on that ring are at least
   `MIN_NODE_ARC_LENGTH` (216px) apart, measured along the arc.
8. For a synthetic worst-case ring of 40+ siblings at one depth, `radiusForDepth` still keeps
   adjacent points at least `MIN_NODE_ARC_LENGTH` apart — the crowding formula scales with count,
   not a fixed cap.
9. For a narrow ring (e.g. 2 siblings at depth 3), `radiusForDepth` returns at least
   `MIN_RADIAL_STEP * depth` — a sparse deep ring is never pulled inward closer than the fixed
   per-depth minimum, keeping depth visually legible even when a branch is narrow.
10. `positionRadial` places no two node centers, anywhere in the same rendered tree, closer than a
    named `MIN_NODE_SEPARATION_PX` constant apart — verified directly against the real 15-domain/
    208-node taxonomy structure (or an equivalent synthetic fixture matching its real branching
    factors), not just a small hand-built 3-node tree.
11. `positionRadial` is a pure function with no DOM, React, or network dependency — same class of
    function as `computeDomainMapLayout` itself and `domainNodeProgress` elsewhere in this package.

**`domain-map-graph-radial-edge.tsx` — the new edge component**

12. `DomainMapGraphRadialEdge` renders a path via `getStraightPath` connecting the edge's actual
    `sourceX/Y` to `targetX/Y` — verified by asserting the rendered path's endpoints match the
    layout's raw coordinates for a child positioned off-axis from its parent (e.g. directly to the
    parent's right, not below it), where a Handle-Position-driven bezier would visibly diverge.
13. `DomainMapGraphRadialEdge` accepts the identical `highlighted: boolean` data shape as the
    existing `DomainMapGraphEdge`, and renders the same green (`#16a34a`, width 2.5) vs. grey
    (`#d4d4d4`, width 1.5) stroke styling for `true`/`false` respectively.
14. `DomainMapGraphEdge` (the existing bezier component) is byte-identical after this ticket —
    proven by appearing in no diff.

**`domain-map-graph.tsx` — mode wiring and the frozen-constants guard**

15. `DomainMapGraph` accepts a required `mode: 'tree' | 'mindmap'` prop.
16. `nodeTypes` (`{ domainMapNode: DomainMapGraphNode }`) is unchanged from before this ticket —
    proven by appearing in no diff; the same single node component renders both modes.
17. `edgeTypes` is a single frozen module-level object carrying both `domainMapEdge` and the new
    `domainMapRadialEdge` entries, registered once regardless of `mode` — never rebuilt
    conditionally in the component body. A render-count/remount test (mirroring the original
    ticket's own red-team-caught regression test, if one exists, or a new equivalent) proves
    switching `collapsedNodeIds` or opening the detail panel does not remount either registered
    node/edge type.
18. Each edge produced by `flowEdges` carries `type: 'domainMapEdge'` when `mode === 'tree'` and
    `type: 'domainMapRadialEdge'` when `mode === 'mindmap'` — the layout's mode-tagged output
    (or the component's own mode prop) drives this, not a hardcoded single type.

**Toggle and route wiring**

19. `DomainMapView` widens to `'list' | 'tree' | 'mindmap'`; `DomainMapViewToggle` renders three
    tabs (List / Tree / Mind-map) with `role="tablist"`/`role="tab"` semantics preserved from the
    existing two-tab implementation, each tab carrying `min-h-11` touch-target sizing.
20. Default view on first page load is still `'list'` — zero behavior change for anyone who never
    touches the toggle, re-verified against three states.
21. Switching between Tree and Mind-map resets collapse state to the depth-bounded default (the
    same reset rule the existing two-state Map toggle already applies on every reselect) — proven
    by expanding a node in Tree mode, switching to Mind-map, switching back to Tree, and confirming
    the node is collapsed again, not still expanded from the earlier interaction.
22. The empty state ("No domain map seeded for this subject yet") renders identically across all
    three toggle states for a subject with `tree.length === 0` — not just List and one graphical
    mode.

## Business Scenarios

### SCENARIO 1: The domain map page's graphical view splits into two distinct, independently selectable layouts
A user on `/subject/$subjectId/map` sees a three-way toggle (List / Tree / Mind-map) instead of
the previous two-way (List / Map). Selecting Tree shows the same top-down, orthogonal layout that
already shipped (parent directly above its children, in rows). Selecting Mind-map shows a new
radial layout — every top-level domain radiates outward from a shared center point, deeper nodes
sit further from center along their branch's own angle. Both are recognizably the same tree data,
laid out two structurally different ways.

What to verify: AC 1, 3, 15, 18, 19, 20.

### SCENARIO 2: Mastery color, gap/superseded/priority-distance badges, and the detail panel work identically in both graphical modes
Every visual signal the original #86 ticket built (mastery-percent color gradient, gap badge,
superseded badge, priority-distance badge, click-to-open read-only detail panel with curricula
links) renders exactly the same way in Mind-map mode as it already does in Tree mode — because both
modes render the same, completely unmodified `DomainMapGraphNode`/`DomainMapGraphDetailPanel`
components, only positioned differently.

What to verify: AC 16 (proves the shared node component is untouched); a component test confirming
a node with `percent === 0` shows the gap badge/color in both modes, and confirming the details
click target opens the same panel in both modes.

### SCENARIO 3: Curricula-covered path highlighting is visible in both layouts, drawn by mode-appropriate edges
A node with `curricula.length > 0`, and every ancestor edge up to root, renders with the
highlighted stroke style in both Tree and Mind-map mode — the same boolean flag from
`computeHighlightMap` drives both the existing bezier edge (Tree) and the new straight-path edge
(Mind-map).

What to verify: AC 4, 13.

### SCENARIO 4: A learner can freely switch among all three views without the page jumping to a different route or losing its place
Toggling List → Tree → Mind-map → List (in any order) never navigates away from
`/subject/$subjectId/map`, never loses the page's header or "Priority review" link, and always
lands each graphical mode back at its own depth-bounded default expand state rather than carrying
over whatever was expanded in a previously-selected mode.

What to verify: AC 21; the existing "Manage in list view" link (from the detail panel) still
switches the toggle to `'list'` regardless of which graphical mode was active when it was clicked.

### SCENARIO 5: A subject with no seeded taxonomy shows the same empty state no matter which of the three tabs is selected
Unchanged in spirit from the original #86 ticket's own SCENARIO 6, re-verified against three
states instead of two.

What to verify: AC 22.

## Technical/Architectural Scenarios

### SCENARIO 6: The radial layout doesn't overlap for the real taxonomy's actual shape, not just a small synthetic tree
The real seeded taxonomy has exactly 15 top-level domains sharing one ring around the center —
the single most crowded ring in the real data (deeper rings have smaller per-domain fan-out, per
spec.md's verified fact about Networking's own 4 children). A fixed per-depth radius increment,
sized generously enough for THIS ring, would make every other, sparser ring needlessly far from
center; sized for a sparser ring, this ring's cards would visibly overlap. The layout must size
each ring's radius from its own actual node count.

What to verify: AC 6, 7, 8, 9, 10 — all against the real seeded 15-domain shape specifically, not
only a synthetic 3-node fixture (contrast the original #86 ticket's own layout tests, which used a
synthetic 75-node/3-level tree because the exact taxonomy shape wasn't yet load-bearing for that
ticket's own claims; this ticket's crowding math is specifically about the real ring size, so it
needs the real number).

### SCENARIO 7: Radial edges connect real coordinates, not an assumption about vertical flow
A node whose child sits to its right or above it (common in a radial layout, rare in the existing
top-down tree layout) still gets a correctly-routed edge in Mind-map mode — because the new edge
component computes its path from each edge's actual endpoint coordinates, not from a Handle
position that assumes the child is always below.

What to verify: AC 12, 14.

### SCENARIO 8: React Flow's node/edge type registration stays remount-safe across two modes, not just one
The original #86 ticket's own red-team review found and fixed a real bug: rebuilding
`nodeTypes`/`edgeTypes` as an inline object on every render forces React Flow to remount every
custom node/edge on every collapse/expand or detail-panel interaction. This ticket doubles the
number of registered types (one node type shared, two edge types) — the same stability requirement
must hold for the doubled registration, not just the original single edge type.

What to verify: AC 17.

### SCENARIO 9: No new dependency, no schema change
Radial angle allocation reuses `d3-hierarchy` primitives already present in `packages/core` from
the original #86 ticket; radius is hand-computed, not a new charting library. No migration, no new
API field, no change to `GET /subjects/:id/domain-map`'s response shape.

What to verify: `packages/core/package.json` and `apps/web/package.json` diffs contain no new
dependency entries; `apps/api/src/db/migrations/` contains no new file from this ticket.

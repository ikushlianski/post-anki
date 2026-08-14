---
type: spec
branch: 86-mind-map-tree-toggle
task: "Split the domain-map graph view into two distinct layouts — mind-map and tree/hierarchy — with a toggle between them (#86 widened scope)"
complexity: medium
state: planned
updated: 2026-08-14
---

# Plan: Mind-map / tree-hierarchy dual view (#86 widened)

## What this story is, in one paragraph

The original #86 ticket shipped already (`.planning/visual-knowledge-map/`, `state: implemented`,
commit `cab0dc8`): a List/Map toggle on `/subject/$subjectId/map`, where "Map" renders one
graphical layout — `computeDomainMapLayout` (`packages/core/src/domain-map/domain-map-layout.ts`)
via `d3-hierarchy`'s `tree()`, a standard top-down orthogonal layout. The ticket's own decision
comment fused "mind map" and "tree layout" into a single option ("mind map / tree layout") and
built one of them. Today Ilya split that fusion explicitly: build **both** a mind-map (radial,
organic-branch) view and a tree/hierarchy (the existing top-down layout) view, with a toggle
between them — "not a single fixed visualization... worth re-sizing as two view modes sharing one
underlying data model" (`ORCHESTRATOR-MEETING-NOTES.md`, 2026-08-14T13:54Z). This plan adds the
missing second layout, generalizes the toggle from two states to three (List / Tree / Mind-map),
and reuses every already-shipped piece — data fetch, node card, detail panel, mastery color,
collapse state, highlight computation, the `ResizeObserver` test stub — unchanged.

**Explicit reading, stated so a misread is cheap to catch**: this plan reads "mind-map view and
tree/hierarchy view" as two distinct graphical *layouts* (radial vs. orthogonal), because the
already-shipped List/Map toggle cannot be what "widens the original single-viz scope" — List is
plain text, not a second graphical layout, and "two view modes sharing one underlying data model"
only makes sense as two layout algorithms over the same tree, which List/Map are not (they share
no layout math at all). If this reading is wrong — if the already-shipped List/Map toggle already
satisfies today's decision — this plan is void; say so and no code should be written against it.

## Verified facts (independently re-checked, not just re-quoting the register)

- `cab0dc8` and `48a9f47` (the commits #83's own GitHub comment cites as having built the
  taxonomy + mapping + first graph view) are both real ancestors of current local `main` —
  confirmed via `git merge-base --is-ancestor cab0dc8 HEAD` / `48a9f47 HEAD`, both exit 0.
- `.planning/visual-knowledge-map/todo.md` frontmatter: `state: implemented`, every coding task
  checkboxed complete. `build-log.md` confirms a live-browser runtime proof was done at a
  375×667 viewport. This is the *only* graphical layout that exists today.
- The existing "Map" layout (`packages/core/src/domain-map/domain-map-layout.ts:134`) calls
  `tree<TraversalNode>().nodeSize([NODE_SPACING_X, NODE_SPACING_Y])(root)` — a plain top-down
  orthogonal tree layout (parent directly above children, fixed grid spacing). This is a
  tree/hierarchy layout, not a mind-map by any common definition (mind-maps are radial/organic,
  branches emanating from a center) — confirmed by reading the function directly, not inferred
  from its name or the #83 comment's own loose "mind-map/hierarchical tree" phrasing.
- `apps/api/scripts/seed-data/it-taxonomy.yaml` has exactly 15 top-level domains (`grep -c "^  - id:"`),
  matching #83's comment's "15 top-level domains, 208 total nodes, 3-4 levels deep." Depth-1 fan-out
  per domain is small (Networking's own 4 children: TCP/IP, Routing, Network Security, Network
  Design) — used below to size the radial layout's spacing requirement concretely, not guessed.
- `apps/web/vitest.setup.ts` already stubs `ResizeObserver` globally (wired into
  `apps/web/vitest.config.ts`'s `setupFiles`) — every test in this plan reuses it; no second stub
  needed, since both graphical modes render through the same `<ReactFlow>` instance.
- `DomainMapGraphNode`/`DomainMapGraphEdge` already register `nodeTypes`/`edgeTypes` as stable
  module-level constants in `domain-map-graph.tsx:15-16` specifically to avoid a real React Flow
  remount bug the original #86 pass's own red-team review caught (a rebuilt-per-render
  `nodeTypes`/`edgeTypes` object remounts every custom node/edge on every collapse/expand or
  detail-panel click). This constraint applies identically to whatever this plan adds.

## The design

### Decision 1 — one layout deriver, two positioning strategies, not two parallel functions

`computeDomainMapLayout` gains an optional third parameter:

```ts
// packages/core/src/domain-map/domain-map-layout.ts
export type DomainMapLayoutMode = "tree" | "mindmap";

export function computeDomainMapLayout(
  nodes: DomainNodeTreeItem[],
  collapsedNodeIds: ReadonlySet<string>,
  mode: DomainMapLayoutMode = "tree",
): DomainMapLayout {
  // unchanged: computeHighlightMap, buildVisibleTree, hierarchy() — identical
  // for both modes, this is the "one underlying data model" the decision asks for
  ...
  return mode === "mindmap"
    ? positionRadial(root)
    : positionTree(root); // existing tree()/nodeSize(...) call, extracted unchanged
}
```

Default `"tree"` means every existing call site and every one of the 11 existing tests in
`domain-map-layout.test.ts` needs zero changes — proven by that file appearing in the diff only as
additions, never edits to an existing `it(...)` body. `positionTree` is the current function body,
renamed and extracted verbatim (no behavior change). `positionRadial` is new.

### Decision 2 — radial math lives in a sibling file, not inline

`domain-map-layout.ts` is already 217 lines; adding radial math in place would push it well past
this repo's ~150-300 line convention. Split into a new sibling file, mirroring the exact precedent
`domain-map-graph-edge.tsx` already set ("split out of `domain-map-graph.tsx` to keep that file's
line count down per this repo's file-size convention," per `build-log.md`):

```
packages/core/src/domain-map/
  domain-map-layout.ts          — computeDomainMapLayout (mode dispatch), positionTree,
                                   buildVisibleTree, computeHighlightMap, defaultCollapsedNodeIds
                                   (all unchanged except the new mode param + positionTree rename)
  domain-map-radial-layout.ts   — NEW: positionRadial + radiusForDepth
  domain-map-radial-layout.test.ts — NEW
```

`computeDomainMapLayout` imports `positionRadial` from the sibling file; both files stay under the
existing convention.

### Decision 3 — radius grows with how crowded a ring is, not a fixed per-depth constant

The tree layout's `NODE_SPACING_Y = 140` is a fixed per-depth increment because an orthogonal
layout's row height doesn't depend on how many siblings share a row. A radial layout's ring
circumference is shared across every node at that depth, so a fixed radius-per-depth breaks for a
shallow-but-wide ring: the real taxonomy's depth-1 ring alone has 15 nodes (every top-level
domain) sharing one full circle (2π) — at a small fixed radius, 15 cards averaging `w-48` (192px)
wide would visibly overlap regardless of how generously deeper rings are spaced.

```ts
// packages/core/src/domain-map/domain-map-radial-layout.ts
const MIN_RADIAL_STEP = 260; // px, same order of magnitude as the tree layout's NODE_SPACING_Y
const NODE_CARD_WIDTH = 192; // px, matches domain-map-graph-node.tsx's `w-48`
const MIN_NODE_GAP = 24; // px, breathing room between adjacent cards on the same ring
const MIN_NODE_ARC_LENGTH = NODE_CARD_WIDTH + MIN_NODE_GAP; // 216px

// A ring's radius is the LARGER of a fixed minimum step (keeps narrow deep
// branches from being needlessly spread out) and whatever radius makes its
// own node count fit around the circle without cards touching. Root is
// always radius 0.
function radiusForDepth(depth: number, nodeCountAtDepth: number): number {
  if (depth === 0) return 0;
  const crowdingRadius = (nodeCountAtDepth * MIN_NODE_ARC_LENGTH) / (2 * Math.PI);
  return Math.max(MIN_RADIAL_STEP * depth, crowdingRadius);
}
```

Angle allocation within a ring still comes from `d3-hierarchy`'s own leaf-count-proportional `x`
output (same `hierarchy()`/`tree()` primitives the tree layout already uses, configured with
`.size([2 * Math.PI, 1])` so `x` yields an angle in `[0, 2π)` and `y` (ignored) stays irrelevant —
radius is computed separately per node via `radiusForDepth`, then converted:

```ts
const radius = radiusForDepth(descendant.depth, siblingsAtDepth.get(descendant.depth) ?? 1);
const angle = descendant.x - Math.PI / 2; // rotate so depth-1 spreads from the top, not the right
const x = radius * Math.cos(angle);
const y = radius * Math.sin(angle);
```

No new dependency — this reuses `d3-hierarchy`'s existing `hierarchy`/`tree` (already a
`packages/core` dependency from the original #86 ticket) purely for angle allocation; radius is
hand-computed above, not from `d3-hierarchy`'s own `y` output.

### Decision 4 — mind-map edges are straight lines from real coordinates, not Handle-driven bezier

The existing `DomainMapGraphEdge` (`domain-map-graph-edge.tsx`) uses `getBezierPath` with
`sourcePosition`/`targetPosition` (both fixed at `Position.Top`/`Position.Bottom` on every node,
`domain-map-graph-node.tsx:34,96`) — a curve shaped for vertical top-to-bottom flow. Reusing it
unmodified for radial mode would draw every edge as if the child were directly below the parent,
regardless of the child's real angle — visibly wrong for anything off-axis, i.e. almost every edge
in a radial layout, which defeats the entire point of building a visually distinct mind-map.

New `DomainMapGraphRadialEdge` component uses React Flow's `getStraightPath` — a direct line
between the edge's actual `sourceX/Y`/`targetX/Y`, independent of each node's fixed Handle
position:

```ts
// apps/web/src/domain-map/domain-map-graph-radial-edge.tsx
const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
```

**Disclosed, accepted cosmetic tradeoff**: each node's actual `<Handle>` elements stay at
`Position.Top`/`Position.Bottom` (unchanged from the tree-mode node component — nodes are shared
between modes per Decision 6) — the straight line is computed from the node's true center-derived
coordinates, not the handle's DOM position, so the connection point may render slightly off from
where the visible line visually terminates on a node's border in mind-map mode. Not fixed this
ticket; the line's overall direction and endpoint accuracy (the part that actually communicates
tree structure) is correct regardless. A follow-up could give radial-mode nodes angle-aware Handle
positions if this proves visually distracting in practice.

Same `highlighted: boolean` data shape and the same green/grey stroke styling as the existing edge
component — only the path-computation function differs (Decision 4's own scenario, AC 12).

### Decision 5 — `edgeTypes` gains a second frozen entry; `nodeTypes` is untouched

```ts
// apps/web/src/domain-map/domain-map-graph.tsx
const nodeTypes: NodeTypes = { domainMapNode: DomainMapGraphNode }; // UNCHANGED
const edgeTypes: EdgeTypes = {
  domainMapEdge: DomainMapGraphEdge,           // existing, tree mode
  domainMapRadialEdge: DomainMapGraphRadialEdge, // new, mindmap mode
};
```

Both entries are registered once, at module scope, regardless of which mode is active — exactly
preserving the stability constraint the original #86 red-team review found necessary (rebuilding
either object per-render or per-mode reintroduces the remount bug that review fixed). Which
component actually renders for a given edge is decided by that edge's own `type` field
(`'domainMapEdge'` vs `'domainMapRadialEdge'`), set once when `flowEdges` is built from the
layout's mode-tagged output — never by conditionally constructing `edgeTypes` itself.

### Decision 6 — the node card is unchanged between modes

`DomainMapGraphNode` (mastery color, gap/superseded/priority-distance badges, collapse-toggle,
details button) renders identically in both Tree and Mind-map mode — only its *position* and the
*edges connecting it* differ. Considered and rejected: a narrower/compact node variant for
mind-map mode specifically (closer to a real xmind-style bubble). Rejected because it would
duplicate every piece of `DomainMapGraphNode`'s existing logic (mastery color, three badge types,
two click targets, touch-target sizing) into a second component for a purely cosmetic difference,
and because Decision 3's crowding-aware radius already solves the actual overlap risk without
needing a smaller card — same reasoning as this ticket's predecessor choosing a read-only detail
panel over redesigning action forms (scope stays at "distinct layout," not "distinct visual
language").

### Decision 7 — toggle widens from two states to three; List stays untouched

```ts
// apps/web/src/domain-map/domain-map-view-toggle.tsx
export type DomainMapView = 'list' | 'tree' | 'mindmap' // was 'list' | 'map'
```

Three tabs (List / Tree / Mind-map), same `role="tablist"`/`role="tab"` pattern, same
`min-h-11` touch targets. Default stays `'list'` (unchanged from the original #86 decision —
zero behavior change for anyone who never touches the toggle). `subject.$subjectId.map.tsx`
renders `<DomainMapTree>` for `'list'` and `<DomainMapGraph mode={view}>` for either graphical
state — `DomainMapGraph` gains a required `mode: 'tree' | 'mindmap'` prop, forwarded straight into
`computeDomainMapLayout`'s new third argument.

### Decision 8 — collapse state resets on every mode switch, same rule already in place

Today, re-selecting "Map" already resets `collapsedNodeIds` to the depth-bounded default (lazy
`useState` initializer, remounts every time the Map toggle is (re)selected — see
`domain-map-graph.tsx:32-38`'s existing comment). This plan extends that exact rule across three
states instead of two: switching Tree → Mind-map or Mind-map → Tree remounts `DomainMapGraph`
(keyed by `mode`, forcing React to treat it as a fresh mount) and resets collapse state to the
default, rather than inventing a new "preserve collapse state across modes" behavior nothing asked
for. Considered and rejected: sharing one collapse-state across both graphical modes (lifting it to
the route). Rejected because a node collapsed in a tight orthogonal grid and the same id collapsed
in a wide-open radial layout have no shared "correct" visual meaning to preserve — matching
Decision 6/8's overall "don't invent cross-mode behavior beyond a shared data model" posture.

## Decisions made autonomously

1. **Optional third parameter, default `"tree"`**, not a required param — keeps all 11 existing
   `domain-map-layout.test.ts` cases green with zero edits, isolating this ticket's diff to
   additions only in that file. Reversible: trivial to make required later once no caller relies on
   the default.
2. **Radial math split into `domain-map-radial-layout.ts`**, matching this exact package's own
   established precedent (`domain-map-graph-edge.tsx` was split out of `domain-map-graph.tsx` for
   the identical file-size reason during the original #86 pass).
3. **Radius grows with ring crowding (`radiusForDepth`), not a fixed per-depth constant** — a fixed
   constant cannot simultaneously keep deep narrow branches compact and stop the real 15-node
   top-level ring from overlapping; verified against the real seeded taxonomy's actual top-level
   count, not a guessed number.
4. **Mind-map edges are straight lines (`getStraightPath`) from raw coordinates, not
   Handle-Position-driven bezier** — the existing bezier edge assumes vertical flow and would draw
   visibly wrong curves for any off-axis child, which is nearly every edge in a radial layout.
   Disclosed cosmetic tradeoff: the visible line's exact touch point on a node's border may not
   line up with that node's fixed Handle position; not fixed this ticket.
5. **No separate compact node variant for mind-map mode** — same card, same badges, same click
   targets in both modes; Decision 3's crowding-aware radius is what prevents overlap, not a
   smaller card. Reversible if a live check finds the full-size card still reads poorly at tight
   rings.
6. **Collapse state resets on every mode switch** (keyed remount), rather than being shared or
   independently persisted per mode — extends the existing Map-toggle behavior (already resets on
   reselect) to three states instead of inventing new cross-mode persistence.
7. **No new dependency.** Radial angle allocation reuses `d3-hierarchy`'s existing `hierarchy()`/
   `tree()` primitives already present in `packages/core` from the original ticket; radius is
   hand-computed, not from a second charting library.
8. **`DomainMapGraphNode` and its badges/testids are completely unmodified** — proven by appearing
   in no diff. Only `domain-map-graph.tsx` (mode prop, edgeTypes registration, flowEdges'
   per-mode `type` tagging), `domain-map-layout.ts`/`domain-map-radial-layout.ts` (new math), the
   toggle, and the route change.

## Architecture

### Business logic changes

- The domain-map page's graphical view — previously a single "Map" option — becomes two distinct,
  independently selectable layouts: a top-down "Tree" view (unchanged from what shipped before)
  and a new radial "Mind-map" view where every top-level domain radiates outward from a shared
  center. A learner picks whichever reads better for how they think about the material; nothing
  about mastery color, gap badges, curricula-covered highlighting, or the click-through detail
  panel changes between the two — only the shape of the diagram does.
- The plain-text List view (add-course, merge, target-depth actions) is completely untouched —
  still the only place those actions live, still the default view for anyone who's never touched
  the toggle.

### Architectural changes

- `computeDomainMapLayout` (`packages/core/src/domain-map/domain-map-layout.ts`) becomes the single
  entry point for both layouts via a mode parameter, rather than two independent layout functions —
  the tree-building, collapse-filtering, and curricula-coverage-highlight logic underneath is
  shared and computed once regardless of mode.
- A new sibling module, `domain-map-radial-layout.ts`, owns only the radial-specific positioning
  math (ring radius, angle-to-cartesian conversion) — kept separate from the main layout file to
  respect this package's file-size convention, matching an already-established split in this same
  feature area.
- `DomainMapGraph`'s `edgeTypes` registration widens from one to two frozen entries; `nodeTypes`
  and the node component itself are untouched — the two layouts share every piece of rendering
  except positioning and edge-path computation.
- The view-toggle's state type widens from a boolean-shaped two-state union to a three-state union;
  no new backend field, no persisted preference, no URL parameter — same component-local-state
  posture the original #86 ticket chose and this plan doesn't revisit.

## Files to create

```
packages/core/src/domain-map/
  domain-map-radial-layout.ts       — positionRadial, radiusForDepth
  domain-map-radial-layout.test.ts  — ring-crowding/no-overlap tests against the real 15-domain
                                       top-level count and a synthetic dense fan-out

apps/web/src/domain-map/
  domain-map-graph-radial-edge.tsx      — DomainMapGraphRadialEdge (straight-path edge component)
  domain-map-graph-radial-edge.test.tsx — path-endpoint assertions against raw layout coordinates
```

## Files to modify

```
packages/core/src/domain-map/
  domain-map-layout.ts       — add DomainMapLayoutMode type + mode param; extract existing tree()
                                call into positionTree; dispatch to positionRadial for 'mindmap'
  domain-map-layout.test.ts  — add mode='mindmap' dispatch-path cases; every existing case
                                untouched
  index.ts                   — export DomainMapLayoutMode, positionRadial (if kept testable at
                                the public boundary), radiusForDepth

apps/web/src/domain-map/
  domain-map-graph.tsx           — required `mode: 'tree' | 'mindmap'` prop; edgeTypes gains the
                                    radial entry; flowEdges tags each edge's `type` per mode
  domain-map-graph.test.tsx      — add mode='mindmap' render-path cases alongside existing
                                    mode='tree' cases (renamed from today's implicit single-mode
                                    tests)
  domain-map-view-toggle.tsx     — DomainMapView widens to 3 states; 3-tab render
  domain-map-view-toggle.test.tsx — default-is-List (unchanged assertion) + both graphical tabs
                                    reachable

apps/web/src/routes/
  subject.$subjectId.map.tsx — DomainMapGraph invocation passes mode={view}; DomainMapTree branch
                                unchanged
```

No existing file's current behavior changes for anyone who never touches the Tree/Mind-map tabs.
`DomainMapTree`, `DomainMapGraphNode`, `DomainMapGraphEdge`, `DomainMapGraphDetailPanel`,
`domain-mastery-color.ts` are all reused completely unmodified.

## Data model changes

Not applicable. No schema change, no migration, no new API field — identical to the original #86
ticket's own scope boundary. `GET /subjects/:id/domain-map` is reused verbatim.

## Documentation changes

`docs/architecture/86-mind-map-tree-toggle/architecture.md` (or a similarly slugged folder) at
implementation/debrief time, following this repo's own established flat ticket-slug convention
under `docs/architecture/` (per the original #86 spec's own already-verified finding — no
repo-wide taxonomy index exists to conform to instead). Not written now; planning only writes to
`.planning/`.

### Files this plan does NOT touch (explicit fence check)

`packages/shared/src/cards.ts`, `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`,
`apps/api/src/topic/topic.repo.ts` — none of this plan's files-to-create/modify lists above
overlap any of these four fenced paths. Confirmed by direct comparison, not assumed.

## BAML test coverage

Not applicable — no BAML functions touched. Pure frontend rendering + a `packages/core` layout
deriver, same posture as the original #86 ticket.

## Quality gates

1. `npx tsc --noEmit` clean across `packages/core`, `apps/web` (and the rest of the monorepo via
   the root fan-out).
2. `npx vitest run` green — in particular `domain-map-layout.test.ts` (all 11 existing cases
   untouched + new mode='mindmap' cases), the new `domain-map-radial-layout.test.ts`, the new
   `domain-map-graph-radial-edge.test.tsx`, and the extended `domain-map-graph.test.tsx`/
   `domain-map-view-toggle.test.tsx`.
3. No repo-wide ESLint exists (verified during #33's planning, reconfirmed since) — the typecheck
   gate is the lint gate.
4. Live-browser runtime proof at desktop and the existing 375×667 mobile viewport (this repo's
   established DoD pattern for UI without Playwright coverage): both Tree and Mind-map tabs render
   the real seeded taxonomy as visually distinct layouts, collapse/expand and the detail panel work
   identically in both, and the List tab is unaffected.

## Explicitly out of scope

- A compact/bubble-style node variant exclusively for mind-map mode (Decision 6) — same card in
  both modes.
- Angle-aware Handle positions on nodes for a pixel-perfect radial connection point (Decision 4's
  disclosed cosmetic tradeoff) — named follow-up, not built here.
- Persisting the List/Tree/Mind-map toggle preference (per-user or per-subject) — component-local
  state only, matching the original #86 ticket's own scope boundary, not revisited.
- Sharing collapse state across the two graphical modes (Decision 8) — each mode gets the same
  depth-bounded default on every (re)selection, same rule the original two-state toggle already
  used.
- Prerequisite relationships as graph edges — still out of scope; `domain_nodes` still has no
  cross-link field beyond the sparse `also_in` links, unchanged from the original #86 ticket's own
  finding.
- Any change to `GET /subjects/:id/domain-map`'s response shape or to how mastery percent is
  computed.
- Replacing List with either graphical mode, or building action forms inside graph nodes — both
  already decided against in the original #86 ticket and not reopened by today's widening (today's
  decision only asked for two graphical modes instead of one; it didn't touch the
  List-stays-separate decision).

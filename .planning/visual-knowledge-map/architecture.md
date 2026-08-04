---
type: architecture
branch: decouple-curricula-from-domain-nodes
task: "Visual knowledge map — graph/mind-map rendering of objective taxonomy with mastery overlay (issue #86)"
state: confirmed
updated: 2026-08-04
---
# Architecture: Visual knowledge map

This ticket does not cross a new service boundary, add an async boundary, or touch infrastructure —
the strict trigger for `architecture.md` in this repo's planning process doesn't technically fire.
It's written anyway because the rendering-library choice is a real, hard-to-cheaply-reverse decision
(a new, fairly large frontend dependency) that deserves a documented rationale, not just a line in
spec.md's decisions table.

## What changes structurally

**Today:** `/subject/$subjectId/map` renders one thing — `DomainMapTree`, a text list/tree with
per-node action forms (add curriculum, merge node, set target depth) and badges (percent, gap,
superseded, priority-distance). All of that data already comes from one existing endpoint,
`GET /subjects/:id/domain-map` → `getDomainMapForSubject`, which returns the full `DomainNodeTreeItem[]`
tree unconditionally (issue #84/#85's own work, unchanged by this ticket).

**Proposed:** the same route gains a second, togglable presentation of the *same* already-fetched
tree — a node/edge graph, laid out as a mind-map (root-to-leaf hierarchy). No new API call, no new
endpoint, no new stored field. The new work is entirely a frontend rendering layer:

1. **`computeDomainMapLayout`** (new pure deriver, `packages/core/src/domain-map/`) — takes the
   existing tree plus a `collapsedNodeIds` set and returns positioned nodes/edges, using
   `d3-hierarchy`'s `tree()` layout function to compute x/y coordinates from the parent-child shape.
   Pure, synchronous, no DOM — same class of function as this package's existing
   `domainNodeProgress`/`isAncestor`.
2. **`DomainMapGraph`** (new component, `apps/web/src/domain-map/`) — renders the deriver's output
   through `@xyflow/react` (React Flow), the library actually doing the rendering, pan/zoom, and
   touch-gesture work. Owns the collapsed-node-ids and detail-panel-open state (component-local,
   never persisted).
3. **`DomainMapGraphNode`** (new custom React Flow node component) — the per-node visual: mastery
   color (a presentational-only helper, not a core deriver — see "Decisions" in spec.md), gap/
   superseded/priority-distance badges (data already on `DomainNodeTreeItem`), click target for
   collapse/expand, separate click target for the detail panel.
4. **`DomainMapGraphDetailPanel`** (new component) — read-only summary + curricula links + a link
   back to the List toggle. No action forms — those stay exclusively in the existing `DomainMapTree`.
5. **`DomainMapViewToggle`** (new component) — local List/Map toggle state on
   `subject.$subjectId.map.tsx`, defaulting to List (today's unchanged behavior).

Data flow for a page visit with Map selected: the existing `GET /subjects/:id/domain-map` response
(unchanged, #84/#85's own work) is fetched once on page load, exactly as it is today. From there,
component-local `collapsedNodeIds` state feeds into `computeDomainMapLayout()` (packages/core, pure,
unit-tested), which produces the positioned `{ nodes, edges }` (with highlight/collapse flags)
that `<ReactFlow>` (`@xyflow/react` — pan/zoom/touch, rendering) renders as `DomainMapGraphNode`
instances (mastery color, badges, click targets). Clicking a node's "details" target opens
`DomainMapGraphDetailPanel` (read-only, links to `/curriculum/:id`, and back to the List toggle).
No loop back into the backend anywhere in this flow — expand/collapse and the detail panel are both
pure client-side state changes over data already fetched once, on page load, exactly as it is today.
This flow is simple enough (one page, one directional data path, no branching services) that a
rendered diagram wasn't judged worth the overhead here — see the ASCII sketch in this ticket's
planning hand-off summary for the same shape, kept in the conversation rather than this file per
this repo's own diagram-format rule (durable diagrams in `architecture.md` must be exported PNGs,
never inline text).

## New infrastructure

None. Two new npm dependencies, both ordinary MIT-licensed libraries installed like any other:

- **`@xyflow/react`** (React Flow, `apps/web`) — the node/edge rendering, pan/zoom, and touch-gesture
  library. Chosen over the alternatives considered (Cytoscape.js, raw D3, vis.js, react-d3-tree)
  because it's the only one that is (a) purpose-built for React — no wrapper layer, first-class
  custom node/edge components — matching this codebase's "componentize UI logic" convention;
  (b) by far the most actively maintained and widely adopted option for this exact problem (~37.3k
  GitHub stars, ~6M weekly npm downloads, a release within the last month, per npm/GitHub as of this
  writing); and (c) ships built-in pan/zoom/touch handling, which is what satisfies SCENARIO 8's
  mobile requirement without hand-rolling any gesture code — the thing this codebase's own
  "never hand-roll what a library covers" rule exists to prevent. Peer dependency is `react >=17`
  (confirmed via `npm view @xyflow/react peerDependencies`), compatible with this app's React 19.2.
- **`d3-hierarchy`** (`packages/core`) — the tree-layout math (`tree()` — computes x/y positions
  from parent-child data). Part of the long-established D3 module family; React Flow ships no
  layout algorithm of its own, and `d3-hierarchy` is what essentially every published React-Flow
  tree-layout example pairs it with, rather than hand-rolling tree positioning math. Pure
  computation, no DOM dependency — fits `packages/core`'s existing "pure logic only" package
  boundary the same way `zod` already does there.

Rejected alternatives and why: Cytoscape.js (canvas-based, not React-native, aimed at general graph
algorithms this feature doesn't need); raw D3 with hand-drawn SVG (would mean hand-rolling pan/zoom/
touch/drag — exactly what the "don't hand-roll what a library covers" rule warns against);
`react-d3-tree` (tree-specific and lighter, but a much smaller, slower-moving project — ~2.6k stars
vs. React Flow's ~37k — for a feature that may keep growing custom per-node interaction needs).

## Data model evolution

None. `DomainNodeTreeItem` (packages/shared) is unchanged — every field this feature needs
(`percent`, `curricula`, `children`, `supersededAt`, `priorityDistance`) already exists, established
by issue #84/#85.

## Failure modes

No new async operations, external calls, or write paths are introduced — layout computation is
synchronous and client-side, and the graph view never writes anything. The only failure mode is a
JS render error inside the new components, which is caught by whatever route-level error boundary
this app already uses (TanStack Router's built-in error component) — no new error-handling
mechanism is added for this ticket.

## Rollout

No migration, no backend deploy, no seed-script change, no feature flag. The two new npm
dependencies install at build time like any other frontend dependency. The feature ships directly
via the additive List/Map toggle (List stays the default view), so there is no gap between "code
merged" and "safe to be live" — nothing changes for a user who never touches the toggle.

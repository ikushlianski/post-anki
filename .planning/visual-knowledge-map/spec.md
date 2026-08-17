---
type: spec
branch: decouple-curricula-from-domain-nodes
task: "Visual knowledge map — graph/mind-map rendering of objective taxonomy with mastery overlay (issue #86)"
complexity: medium
state: confirmed
updated: 2026-08-04
---
# Spec: Visual knowledge map

Two forks queued on GitHub issue #86 (`needs:decision` label) — this spec is written against the
recommended option for each (see "Decisions pending confirmation" below). If Ilya answers
differently, this spec gets revised before implementation starts, same pattern issue #84 used.

Depends on issue #85 (separate progress overlay from structure) — its `domainMasteryStatus`
deriver and its regression test locking in "domain nodes always render regardless of coverage" are
both reused here unmodified. As of this writing #85's changes are uncommitted working-tree changes
in this same worktree, same as #84's — `/implement-ie` for this ticket must run here, after both
are committed, never against a fresh `main` checkout.

### Implementation Phases

Single phase — frontend-only, no backend or data model change. One vertical slice: layout deriver
→ graph rendering component → custom node/detail-panel components → view-toggle wiring → tests.

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `computeDomainMapLayout` (`packages/core/src/domain-map/domain-map-layout.ts`) | `nodes: DomainNodeTreeItem[]` (the existing tree, unchanged shape), `collapsedNodeIds: Set<string>` | `{ nodes: DomainMapLayoutNode[]; edges: DomainMapLayoutEdge[] }` — each layout node carries `{ id, x, y, depth, hasChildren, childCount, node: DomainNodeTreeItem }`; each edge carries `{ id, source, target, highlighted: boolean }`. Descendants of any collapsed id are excluded from both arrays. `highlighted` is true iff the target node or any node in its (possibly-collapsed) subtree has `curricula.length > 0`. Positions computed via `d3-hierarchy`'s `tree()`. | SCENARIO 3, 4, 7, 9 |
| `defaultCollapsedNodeIds` (`packages/core/src/domain-map/domain-map-layout.ts`) | `nodes: DomainNodeTreeItem[]` | `Set<string>` — every node id at depth ≥ 2 (depth computed by walking `parentId`, same traversal style as `domainNodeProgress`) | SCENARIO 9 |

No other derivers are touched. `domainMasteryStatus` (issue #85, `packages/core/src/domain-map/domain-mastery-status.ts`) is reused unmodified for the hard gap/progress boundary (SCENARIO 2) — this ticket adds no new percent-to-status logic.

Mastery **color** (the gradient itself) is deliberately NOT a core deriver — see "Decisions made
autonomously" below. It's a small, presentation-only helper co-located with the node component,
mapping `domainMasteryStatus` + `percent` to a Tailwind class, the same way `domain-map-tree.tsx`
already inlines its badge color classes today rather than returning them from a deriver.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 (List/Map toggle) | None | `apps/web/src/domain-map/domain-map-view-toggle.tsx` (new), `apps/web/src/routes/subject.$subjectId.map.tsx` (modified) | None |
| SCENARIO 2 (mastery color) | None | `apps/web/src/domain-map/domain-map-graph-node.tsx` (new), `apps/web/src/domain-map/domain-mastery-color.ts` + `.test.ts` (new, presentational helper with the hard-boundary unit test) | None |
| SCENARIO 3 (curricula-covered path highlighting) | None | `packages/core/src/domain-map/domain-map-layout.ts` (new — `highlighted` flag), `apps/web/src/domain-map/domain-map-graph.tsx` (new — edge styling) | None |
| SCENARIO 4 (expand/collapse) | None | `apps/web/src/domain-map/domain-map-graph.tsx` (new — collapsed-ids state), `apps/web/src/domain-map/domain-map-graph-node.tsx` (new — toggle click target) | None |
| SCENARIO 5 (detail panel) | None | `apps/web/src/domain-map/domain-map-graph-detail-panel.tsx` (new), `apps/web/src/domain-map/domain-map-graph-node.tsx` (new — details click target) | None |
| SCENARIO 6 (empty state parity) | None | `apps/web/src/routes/subject.$subjectId.map.tsx` (modified) | None |
| SCENARIO 7 (pure layout deriver) | None | `packages/core/src/domain-map/domain-map-layout.ts` (new), `packages/core/src/domain-map/domain-map-layout.test.ts` (new) | None |
| SCENARIO 8 (mobile-responsive) | None | `apps/web/src/domain-map/domain-map-graph.tsx` (new — canvas container classes), `apps/web/src/domain-map/domain-map-graph-node.tsx` (new — touch-target sizing) | None |
| SCENARIO 9 (depth-bounded initial render) | None | `packages/core/src/domain-map/domain-map-layout.ts` (new — `defaultCollapsedNodeIds`), `apps/web/src/domain-map/domain-map-graph.tsx` (new — initial state wiring) | None |

### Files to create

```
packages/core/src/domain-map/
  domain-map-layout.ts            — computeDomainMapLayout + defaultCollapsedNodeIds derivers
  domain-map-layout.test.ts       — unit tests: node/edge output, collapse filtering, highlight
                                     flag, depth-bounded default, cycle-safety (SCENARIO 3,4,7,9)

apps/web/src/domain-map/
  domain-map-graph.tsx            — <ReactFlow> wrapper: owns collapsedNodeIds + detail-panel
                                     state, calls computeDomainMapLayout. `nodeTypes` (and
                                     `edgeTypes`, since SCENARIO 3's highlighted edges need a
                                     custom edge component) are defined as stable MODULE-LEVEL
                                     constants, never inline object literals in the component
                                     body — React Flow remounts every custom node/edge on every
                                     render otherwise (a real bug, not a style nit: it would fire
                                     on every collapse/expand and every detail-panel open,
                                     exactly the interactions SCENARIO 4/5 exercise). Node body
                                     is `data-testid="domain-map-graph-node-${id}"` (collapse/
                                     expand click target), details affordance is
                                     `data-testid="domain-map-graph-node-details-${id}"`
                                     (separate target, opens the panel) — named explicitly here
                                     so implementation doesn't have to invent them.
  domain-map-graph.test.tsx       — component tests: depth-bounded initial node count, click
                                     toggles collapse, details click opens panel, mobile
                                     container classes present (SCENARIO 1,4,5,8,9). Requires a
                                     `ResizeObserver` stub — `apps/web`'s vitest config
                                     (`environment: 'jsdom'`, no setupFiles) has no
                                     `ResizeObserver` global today, and React Flow requires one
                                     to measure/position nodes; without it, node-count and
                                     click-target assertions fail even when the component logic
                                     is correct. Add the stub either as a `vi.stubGlobal` at the
                                     top of this test file or a new `apps/web/vitest.setup.ts`
                                     wired into `vitest.config.ts`'s `setupFiles` — either is
                                     fine, but it must exist before SCENARIO 9's node-count
                                     assertions can pass.
  domain-map-graph-node.tsx       — custom React Flow node: mastery color, gap/superseded/
                                     priority-distance badges, collapse-toggle + details click
                                     targets (testids above), touch-target sizing via Tailwind's
                                     `min-h-11 min-w-11` (= 44×44px) on both click targets —
                                     named explicitly so the test asserts a real 44px value, not
                                     just "some className is present"
  domain-map-graph-detail-panel.tsx — read-only panel: name, description, percent, badges,
                                     curricula links, "Manage in list view" link
  domain-map-view-toggle.tsx      — List/Map toggle, local state, defaults to List
  domain-map-view-toggle.test.tsx — default-is-List test, toggle-switches-view test
  domain-mastery-color.ts         — presentational helper: (status, percent) -> Tailwind class
  domain-mastery-color.test.ts    — unit test: percent=0 (any status="gap") produces the fixed
                                     grey/rose class; percent=1 and percent=100 both produce a
                                     class from the green-gradient set and are visibly distinct
                                     from the gap class AND from each other — SCENARIO 2's hard-
                                     boundary claim is a real, testable business rule (color is
                                     the ENTIRE mechanism by which a user tells "gap" from
                                     "progress" at a glance), so it gets a real unit test rather
                                     than a smoke check
```

### Files to modify

```
apps/web/src/
  routes/subject.$subjectId.map.tsx — hosts DomainMapViewToggle; conditionally renders
                                       DomainMapTree (unchanged) or DomainMapGraph (new); empty
                                       state (tree.length === 0) unchanged, shown regardless of
                                       toggle selection (SCENARIO 6). Also adds
                                       `@xyflow/react/dist/style.css` to this route's OWN
                                       `head()` link array via the `?url` import — e.g.
                                       `import reactFlowCss from '@xyflow/react/dist/style.css?url'`
                                       then a `{ rel: 'stylesheet', href: reactFlowCss }` entry —
                                       mirroring `__root.tsx`'s existing (and only) precedent for
                                       CSS in this app (`appCss` via `?url` + `head()`), rather
                                       than an unverified bare side-effect import with no
                                       precedent under this app's Vite/TanStack-Start SSR setup.
                                       Scoped to this route only, not `__root.tsx`, since no
                                       other route needs React Flow's styles.
  package.json                      — add @xyflow/react dependency

packages/core/
  package.json                      — add d3-hierarchy (+ @types/d3-hierarchy dev dependency)
  src/domain-map/index.ts           — export computeDomainMapLayout, defaultCollapsedNodeIds,
                                       and their output types
```

No existing file's current behavior changes for anyone who never touches the new Map toggle —
`DomainMapTree` itself is not modified by this ticket.

### Data model changes

Not applicable. No schema change, no migration, no new API field. `DomainNodeTreeItem` (packages/shared) is read as-is.

### Documentation changes

This repo does not follow the constitution's domain/component `docs/architecture/<domain>/<component>.md`
taxonomy — every existing entry under `docs/architecture/` (20+ folders, including
`decouple-curricula-from-domain-nodes/` and `separate-progress-overlay-from-structure/` from issues
#84/#85 in this same worktree) is a flat ticket-slug folder, and no `docs/architecture/README.md`
taxonomy index exists to bootstrap. Following that established local practice for consistency
(rather than unilaterally introducing a new repo-wide taxonomy mid-ticket, which would affect every
future ticket, not just this one): `docs/architecture/visual-knowledge-map/architecture.md` will be
created at implementation/debrief time, mirroring #84/#85's own pattern — not written now, since
planning only writes to `.planning/`. No existing component doc needs updating; this is a new
capability with no prior documentation to merge into.

### BAML test coverage

Not applicable — no BAML functions touched. This ticket is pure frontend rendering over
already-fetched data; no LLM/agent call is involved anywhere in scope.

### Decisions made autonomously

1. **Mastery color gradient lives in the frontend, not as a core deriver.** `domainMasteryStatus`
   (issue #85) stays the one business-meaningful signal (gap vs. progress); the actual color
   mapping (which shade of green for which percent) is presentation-only and follows
   `domain-map-tree.tsx`'s own existing precedent of inlining Tailwind color classes directly in
   the component rather than returning colors from `packages/core`. Reversible, zero business
   meaning beyond visual scanability.
2. **Detail panel is read-only, not a copy of the list view's action forms.** Embedding
   `CreateCurriculumForm`/`MergeDomainNodeButton`/`TargetDepthControl` inside graph nodes or the
   panel would be significant added scope beyond this ticket's stated done-when criteria (a visual
   representation with mastery coloring, drill-down, and mobile-responsiveness — not a redesign of
   the action UI). "Manage in list view" is the escape hatch back to the existing, fully-capable
   List view. Reversible — nothing prevents adding inline actions to the graph later if read-only
   proves insufficient in practice.
3. **View-toggle state is component-local, not persisted.** No new stored preference field, no
   URL search param. Matches the "keep scope to what the done-when criteria ask for" principle;
   trivially upgradable to a persisted/URL-driven preference later without any migration.
4. **Docs taxonomy: followed existing ticket-slug local practice instead of invoking
   `/docs-taxonomy-ie`.** See "Documentation changes" above — this repo's own established,
   consistent 20+-folder practice already answers this question; bootstrapping a new taxonomy for
   one ticket among many is out of this ticket's scope and not something a single autonomous
   planning run should decide unilaterally for the whole repo.
5. **`d3-hierarchy` lives in `packages/core`, `@xyflow/react` lives in `apps/web`.** The layout
   math is pure and DOM-free (fits `packages/core`'s existing "pure logic only" boundary, same as
   `zod` already living there); the rendering library is inherently React/DOM-dependent and has no
   place in a framework-agnostic core package.

### Implementation order

1. `computeDomainMapLayout` + `defaultCollapsedNodeIds` — red-green-refactor per implement-ie's
   "Layer 1 — Derivers" step, covers SCENARIO 3, 4, 7, 9
2. `packages/core/src/domain-map/index.ts` export wiring
3. `domain-mastery-color.ts` + `domain-mastery-color.test.ts` (presentational helper, but the
   hard percent===0 boundary gets a real unit test — see the file's own bullet above; this is
   not the same as the layout deriver's business-rule tests, but it isn't a no-test smoke check
   either)
4. `domain-map-graph-node.tsx` (custom React Flow node), covers SCENARIO 2, 4, 5, 8
5. `domain-map-graph-detail-panel.tsx`, covers SCENARIO 5
6. `domain-map-graph.tsx` (ReactFlow wrapper, state wiring, CSS import), covers SCENARIO 3, 4, 8, 9
7. `domain-map-view-toggle.tsx`, covers SCENARIO 1
8. `subject.$subjectId.map.tsx` wiring (toggle + conditional render + empty-state parity), covers
   SCENARIO 1, 6
9. Component/unit tests for every file above
10. Runtime proof: live dev server, desktop viewport click-through (toggle, collapse/expand,
    detail panel) + a 375×667 viewport check (SCENARIO 8), matching #84/#85's own DoD pattern of a
    real-browser check where this repo has no committed e2e suite of its own

### Definition of Done — per layer

**Backend:** N/A — not touched. `GET /subjects/:id/domain-map` is reused verbatim; its contract is
already locked in by issue #84/#85's own regression tests (`domain-map-full-structure.integration.test.ts`).

**Frontend:**
- `npx vitest run packages/core/src/domain-map/domain-map-layout.test.ts` — all tests pass,
  including: a synthetic 50+-node, 3-level tree produces exactly the depth-0/1 node count in the
  default-collapsed output (SCENARIO 9); collapsing a mid-tree node removes its entire subtree
  (SCENARIO 7); a node with `curricula.length > 0` and every ancestor edge up to root is flagged
  `highlighted: true` (SCENARIO 3).
- `npx vitest run apps/web/src/domain-map/domain-mastery-color.test.ts` — all tests pass,
  including the hard percent===0 vs. percent>0 boundary (SCENARIO 2).
- `npx vitest run apps/web/src/domain-map/domain-map-graph.test.tsx apps/web/src/domain-map/domain-map-view-toggle.test.tsx`
  — all tests pass (requires the `ResizeObserver` stub noted in the file list above — without it
  these tests fail regardless of whether the component logic is correct), including: default view
  is List (SCENARIO 1); clicking `data-testid="domain-map-graph-node-${id}"` on a node with
  children toggles collapse (SCENARIO 4); clicking
  `data-testid="domain-map-graph-node-details-${id}"` opens
  `data-testid="domain-map-graph-detail-panel"` (SCENARIO 5); the canvas container element carries
  the full-width/fixed-height mobile classes and both node click targets carry `min-h-11 min-w-11`
  (SCENARIO 8, asserted via class-name presence — a real 44px value, not just "some className is
  present" — this component test cannot itself prove that translates to real tappability, hence
  the manual viewport check below).
- Route check: visiting `/subject/$subjectId/map` for a subject with a seeded taxonomy (e.g. the
  ~18-node seed from `apps/api/scripts/seed-domain-taxonomy.ts`) renders `data-testid="domain-map-tree"`
  by default; clicking `data-testid="domain-map-view-toggle-graph"` renders
  `data-testid="domain-map-graph"` with only depth-0/1 nodes visible, each colored per its
  `percent`/`domainMasteryStatus`.
- Manual/live-browser proof at a 375×667 viewport (this repo's established pattern for UI it
  doesn't Playwright-cover, per #84/#85's own todo.md notes): the graph canvas renders full width,
  a node tap opens the detail panel, and pan/pinch-zoom respond (React Flow's built-in touch
  handling, no custom gesture code to verify beyond "it responds").

**Infrastructure:** N/A — not touched. Two new npm dependencies (`@xyflow/react` in `apps/web`,
`d3-hierarchy` in `packages/core`) install via the existing `npm install` flow; no new service,
queue, IaC resource, or CI step.

### Scope boundary

Out of scope for this ticket:
- Prerequisite relationships as graph edges — the GitHub issue's own open question, resolved by
  fact rather than choice: `domain_nodes` has no prerequisite/cross-link field in its schema at
  all, only `parentId`. Nothing to render; would require a separate data-model ticket first.
- Treemap, radial/sunburst, or network-graph visualization types — see "Decisions pending
  confirmation" below; only mind-map/tree ships in this ticket regardless of which option Ilya
  picks for the other open items, since the recommendation for the visualization-type fork is
  itself mind-map/tree.
- Replacing the List view, or building action forms (add curriculum, merge, target depth) inside
  the graph — see "Decisions pending confirmation" (fork 2) and "Decisions made autonomously" #2.
- Persisting the List/Map toggle preference (per-user or per-subject) — component-local state only,
  this pass.
- Any change to `GET /subjects/:id/domain-map`'s response shape, or to how mastery percent itself
  is computed — both untouched, reused exactly as issue #84/#85 left them.

### Decisions pending confirmation (GitHub issue #86, `needs:decision`)

1. Visualization type is **mind map / tree layout** (not network graph, treemap, or radial) —
   matches the data model exactly (strict parent-child tree, no cross-links) and the chosen
   library's first-class layout support.
2. The graph **supplements** the existing text-tree view via a toggle on the same route, rather
   than replacing it — preserves every existing per-node action (add curriculum, merge, set target
   depth) unchanged.

Full reasoning and options for each: `.planning/visual-knowledge-map/decision-comment.md` (also
posted to issue #86).

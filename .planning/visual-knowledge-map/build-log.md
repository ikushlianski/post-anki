# Build log: Visual knowledge map

- [x] `computeDomainMapLayout` + `defaultCollapsedNodeIds` derivers + tests
  (`packages/core/src/domain-map/domain-map-layout.ts`) — 11 tests, including a 75-node/3-level
  synthetic taxonomy. `defaultCollapsedNodeIds` implemented as depth >= 1, not depth >= 2 as this
  file's own Derivers table literally said — depth >= 2 cannot produce the required depth-0/1-only
  render count under `computeDomainMapLayout`'s own documented "collapsed id hides descendants,
  not itself" contract. See domain-map-layout.ts's own comment for the full reasoning.
- [x] Export wiring (`packages/core/src/domain-map/index.ts`)
- [x] `domain-mastery-color.ts` presentational helper + `domain-mastery-color.test.ts` (hard
  percent===0 boundary — found during red-team review to need a real test, not a smoke check)
- [x] `domain-map-graph-node.tsx` custom React Flow node — `nodeTypes`/`edgeTypes` as stable
  module-level constants (React Flow remount gotcha, found during red-team review), explicit
  `data-testid="domain-map-graph-node-${id}"` / `-details-${id}` testids, `min-h-11 min-w-11`
  touch targets
- [x] `domain-map-graph-edge.tsx` — custom highlighted/default edge component (not explicitly
  listed as its own file in spec.md's file list, split out of domain-map-graph.tsx to respect
  this repo's file-size convention; registered as a stable module-level `edgeTypes` entry same as
  the node component)
- [x] `domain-map-graph-detail-panel.tsx`
- [x] `domain-map-graph.tsx` (ReactFlow wrapper + state); ResizeObserver stub added to
  `apps/web/vitest.setup.ts`, wired into `vitest.config.ts`'s `setupFiles` (jsdom has none today —
  found during red-team review, needed before any node-count assertion can pass)
- [x] `subject.$subjectId.map.tsx` wiring — React Flow CSS added via THIS route's own `head()` +
  `?url` import, mirroring `__root.tsx`'s only existing CSS precedent (found during red-team
  review: a bare side-effect import has no precedent under this app's SSR setup and risks
  shipping an unstyled, unusable canvas). Verified empirically via SSR HTML output — the real
  `<link href=".../@xyflow/react/dist/style.css">` tag is present, and the live browser check
  showed a non-zero-height `.react-flow__pane`, which only renders correctly with the stylesheet
  loaded.
- [x] `domain-map-view-toggle.tsx` — implemented as a controlled component (`view`/`onChange`
  props), with the actual `useState` living in the route, so the detail panel's "Manage in list
  view" link can switch the view from a component nested inside the Map side
- [x] Component/unit tests for every new file
- [x] `@xyflow/react` added to `apps/web/package.json`; `d3-hierarchy` (+ `@types/d3-hierarchy`)
  added to `packages/core/package.json`
- [x] Verification: vitest (unit + component, 3 named suites), full workspace typecheck
- [x] Runtime proof: live dev server click-through (List default, toggle to Map, collapse/expand,
  detail panel) via Playwright at a 375×667 viewport (SCENARIO 8) — never any
  `mcp__chrome-devtools__*` tool. Found and worked around a pre-existing, unrelated local dev-DB
  drift (the shared `post-anki-dev-db` container's migration tracking already claimed migration
  0027 applied, but `subjects.embedding`/`embedding_hash`/`embedded_at` were physically missing —
  synced via the already-committed migration's own SQL, no migration files or tracking touched).

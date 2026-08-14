---
type: todo
branch: 86-mind-map-tree-toggle
task: "Split the domain-map graph view into two distinct layouts — mind-map and tree/hierarchy — with a toggle between them (#86 widened scope)"
state: open
updated: 2026-08-14
---

# Todo: Mind-map / tree-hierarchy dual view (#86 widened)

## Decisions to make

Nothing blocking. Every fork in this story had a safe, reversible, pattern-following default — 8
of them, logged one line each below for `ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in
spec.md's "Decisions made autonomously". No migration, no new table, no new route, no schema
touch — nothing here needs Ilya before implementation starts.

1. Optional third `mode` parameter on `computeDomainMapLayout`, default `"tree"` — keeps all 11
   existing layout tests green with zero edits.
2. Radial math split into its own sibling file (`domain-map-radial-layout.ts`), matching this same
   feature area's own established precedent for keeping files under this repo's size convention.
3. Ring radius grows with how many siblings share it (`radiusForDepth`), not a fixed per-depth
   constant — a fixed number can't fit the real 15-node top-level ring without either overlapping
   it or over-spacing every sparser deeper ring.
4. Mind-map edges are straight lines from raw coordinates (`getStraightPath`), not
   Handle-Position-driven bezier — the existing bezier assumes vertical flow and draws visibly
   wrong curves for an off-axis child, which is nearly every edge in a radial layout.
5. No separate compact/bubble node variant for mind-map mode — same card, same badges in both
   modes; the crowding-aware radius (decision 3) is what prevents overlap, not a smaller card.
6. Collapse state resets to the depth-bounded default on every mode switch (keyed remount) —
   extends the existing Map-toggle's own reset-on-reselect rule to three states instead of two,
   rather than inventing cross-mode persistence.
7. No new npm dependency — radial angle allocation reuses `d3-hierarchy` primitives already in
   `packages/core` from the original #86 ticket.
8. `edgeTypes` gains one new frozen module-level entry alongside the existing one; `nodeTypes` is
   completely untouched — same node component renders both modes.

## To review / clarify (not blockers, flagged for awareness)

1. **Handle-position/visible-line mismatch in mind-map mode is a disclosed, not-fixed cosmetic
   tradeoff.** Each node's `<Handle>` elements stay at their existing fixed Top/Bottom position
   (shared node component, decision 5); the straight-line edge is computed from real coordinates
   independent of that Handle position, so the line's visible touch point on a node's border may
   not exactly match where the small connection-dot renders. Doesn't affect whether the edge
   correctly shows which nodes are connected — spec.md Decision 4.
2. **The exact `MIN_RADIAL_STEP`/`MIN_NODE_ARC_LENGTH`/`MIN_NODE_SEPARATION_PX` constants
   (260px / 216px, derived from the `w-48` = 192px card width + 24px gap) are a reasoned starting
   point, not empirically tuned against a real rendered screenshot.** AC 22's live-browser proof is
   what actually confirms these numbers read well at real screen sizes; if the first live check
   shows cards still crowding at the 15-node top-level ring, these three constants are the ones to
   adjust — not the crowding *formula* itself, which is the part this plan is confident about.
3. **This plan's radial-layout tests need a fixture matching the real taxonomy's actual branching
   factors** (15 top-level domains, ~4 depth-1 children per domain per the verified Networking
   example), not just a small hand-built 3-node tree — reuse or extend the original #86 ticket's
   own 75-node/3-level synthetic fixture pattern from `domain-map-layout.test.ts`, sized/shaped to
   match rather than reused unmodified, since that fixture wasn't built with THIS ticket's
   ring-crowding claim in mind.

## Manual steps / sequencing constraints

None. No migration, no infra change, no new secrets or config. Standard implement → typecheck →
test → live-browser proof flow, same as the original #86 ticket.

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to every workspace)
- `npx vitest run` (root) — in particular `domain-map-layout.test.ts` (11 existing cases untouched
  + new mode='mindmap' cases), the new `domain-map-radial-layout.test.ts`, the new
  `domain-map-graph-radial-edge.test.tsx`, and the extended `domain-map-graph.test.tsx`/
  `domain-map-view-toggle.test.tsx`
- No repo-wide ESLint exists (verified during #33's planning, reconfirmed since) — the typecheck
  gate is the lint gate
- Live-browser runtime proof at desktop and the existing 375×667 mobile viewport — this repo's
  established DoD pattern for domain-map UI, since no Playwright plan covers this area

## Easiest things to get wrong (read before implementing)

1. **`edgeTypes` must be extended in place, never rebuilt.** Add the `domainMapRadialEdge` entry to
   the SAME frozen module-level object `domain-map-graph.tsx` already declares — do not create a
   second `edgeTypes`-like object selected conditionally by `mode` in the component body. That
   exact pattern is the React Flow remount bug the original #86 red-team review already found and
   fixed once; reintroducing it via the new entry would silently undo that fix. AC 17.
2. **`positionTree` must be the existing function body, extracted verbatim — not rewritten.** The
   11 existing `domain-map-layout.test.ts` cases are the proof this refactor didn't change tree-mode
   behavior; if any of them need a code change (not just continuing to pass), the extraction went
   wrong. AC 2.
3. **Radius comes from `radiusForDepth`, angle comes from `d3-hierarchy`'s own `x` output — don't
   let `d3-hierarchy`'s `y` (its own built-in radius-equivalent) leak into the final radius.**
   Configure `tree()` with `.size([2 * Math.PI, 1])` specifically so its `y` output stays a
   throwaway placeholder; the real radius is `radiusForDepth(depth, nodeCountAtDepth)`, computed
   separately. AC 6-10.
4. **Don't add a second `ResizeObserver` stub.** `apps/web/vitest.setup.ts` already has one, wired
   into `apps/web/vitest.config.ts`'s `setupFiles` — both graphical modes render through the same
   `<ReactFlow>` instance and share it.
5. **`DomainMapGraphNode`, `DomainMapGraphEdge` (the existing bezier one), `DomainMapTree`,
   `DomainMapGraphDetailPanel`, and `domain-mastery-color.ts` should all appear in the diff not at
   all.** If any of these need an edit to make this ticket's tests pass, something about the
   shared-data-model design has gone wrong — re-read spec.md's Decision 6/8 rather than patching the
   symptom. AC 14, 16.
6. **Don't touch `packages/shared/src/cards.ts`, `apps/api/src/cards/`,
   `apps/api/src/mastra/mastra.ts`, or `apps/api/src/topic/topic.repo.ts`.** Separate, unrelated WIP
   currently in the working tree — none of this ticket's files overlap them, but a broad
   find-and-replace across `apps/` could accidentally touch one; grep-confirm before committing.

## Follow-ups this story deliberately does not build

- Angle-aware Handle positions on nodes for a pixel-perfect radial connection point (spec.md
  Decision 4's disclosed tradeoff).
- A compact/bubble-style node variant exclusively for mind-map mode (spec.md Decision 6).
- Persisting the List/Tree/Mind-map toggle preference, per-user or per-subject.
- Sharing collapse state across the two graphical modes.
- Prerequisite relationships as graph edges (still blocked on `domain_nodes` having no cross-link
  field beyond the sparse `also_in` links — unchanged finding from the original #86 ticket).

## Notes

Predecessor implementation and its own build record: `.planning/visual-knowledge-map/` (`state:
implemented`, shipped as part of commit `cab0dc8`). This plan extends that work; it does not
replace or duplicate it.

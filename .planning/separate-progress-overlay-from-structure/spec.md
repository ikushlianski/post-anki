---
type: spec
branch: decouple-curricula-from-domain-nodes
task: "Separate progress overlay from structure — show mastery on top of static map (issue #85)"
complexity: medium
state: confirmed
updated: 2026-08-04
---
# Spec: Separate progress overlay from structure

Pre-verified fact this spec is written against: `getDomainMapForSubject`
(`apps/api/src/domain-map/domain-map.repo.ts` lines 157-250) already returns every `domain_nodes`
row for a subject unconditionally, independent of curriculum coverage — issue #84 made this true
structurally by removing curricula's ability to create nodes. "Domain nodes are always shown" is
therefore NOT new work for this ticket; it gets a regression test (SCENARIO 1) so it can't silently
regress, not a re-implementation. This ticket's real scope is the mastery **overlay** — visually
separating "structure exists" from "you've learned X% of it," and making zero-mastery areas
(`percent === 0`) visibly and actionably flagged as gaps.

**Hard dependency, found during red-team review**: issue #84's schema/code changes (the
`curriculum_domain_node_mappings` table, `domainNodeProgress`'s topic-dedup fix,
`domain-map.repo.ts`'s rewritten `getDomainMapForSubject`) are, as of this writing, uncommitted
working-tree changes in this same worktree — not a merged commit. This ticket's SCENARIO 1
integration test and its whole premise depend on that code existing. `/implement-ie` for this
ticket must run in this same worktree, after #84's changes are committed (even if not yet merged to
main) — never against a fresh checkout of `main`, where none of #84's changes exist yet.

### Implementation Phases

Single phase — no new async boundary, service, or data model change; a pure deriver plus a UI
wiring change, plus a regression test locking in existing backend behavior.

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `domainMasteryStatus` (`packages/core/src/domain-map/domain-mastery-status.ts`) | `percent: number` (the existing `DomainNodeTreeItem.percent`, already computed by `domainNodeProgress`) | `"gap" \| "progress"` — `"gap"` iff `percent === 0`, `"progress"` otherwise | SCENARIO 2, 3, 6 |

No other derivers are touched. `domainNodeProgress` (`packages/core/src/domain-map/domain-map-progress.ts`)
and its subtree rollup are unchanged — SCENARIO 5 and 6 exercise that existing rollup, they don't
modify it.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 (full structure always renders) | `domain-map-full-structure.integration.test.ts` (new) | None | None |
| SCENARIO 2 (zero-mastery node flagged as gap) | None | `domain-mastery-status.ts` (new), `domain-map-tree.tsx`, `domain-map-tree.test.tsx` (new) | None |
| SCENARIO 3 (mastery is a layer, not baked into identity) | None | `domain-map-tree.tsx`, `domain-map-tree.test.tsx` | None |
| SCENARIO 4 (gap has a working next action) | None | `domain-map-tree.tsx` (verify only — `CreateCurriculumForm` wiring is unchanged), `domain-map-tree.test.tsx` | None |
| SCENARIO 5 (grouping node gap reflects whole subtree) | `domain-map-full-structure.integration.test.ts` | `domain-map-tree.tsx` (verify only — recursion already renders per-node) | None |
| SCENARIO 6 (mixed subtree doesn't hide a real gap) | `domain-map-full-structure.integration.test.ts` — proves the REAL rollup: a parent with one curriculum-covered child and one uncovered child produces `percent > 0` at the parent and `percent === 0` at the uncovered child, via `domainNodeProgress`'s actual averaging (not just asserted UI props) | `domain-mastery-status.ts`, `domain-map-tree.tsx`, `domain-map-tree.test.tsx` — proves the UI honors two *given* sibling percents correctly (isolates rendering logic from the rollup math, which the backend test above proves separately) | None |

### Files to create

```
packages/core/src/domain-map/
  domain-mastery-status.ts       — domainMasteryStatus(percent): "gap" | "progress", pure, no I/O
  domain-mastery-status.test.ts  — red-green-refactor: percent 0 → "gap", percent 1-100 → "progress"

apps/api/src/domain-map/
  domain-map-full-structure.integration.test.ts — SCENARIO 1, 5 + 6: (1/5) a subject with a
    domain-node subtree that has zero curricula mapped anywhere in it still returns every node in
    that subtree from getDomainMapForSubject, each with percent: 0 and curricula: [], at every
    depth; (6) a parent with two real children — one with a confirmed curriculum mapping and
    mastered topics, one with none — asserts the ACTUAL returned percent is > 0 at the parent and
    === 0 at the uncovered child, proving domainNodeProgress's real subtree averaging (not a
    hand-set prop) produces the mixed result SCENARIO 6 describes

apps/web/src/domain-map/
  domain-map-tree.test.tsx       — SCENARIO 2, 3, 4, 6 (rendering-given-percent only — the real
    rollup math for SCENARIO 6 is proven by the backend test above, not re-derived here): renders
    the gap badge testid iff percent === 0, renders CreateCurriculumForm's existing testid for a
    gap node, renders a covered sibling (percent > 0, given as a prop) without the gap badge under
    the same parent. Mocking follows this repo's existing precedent for testing a
    domain-map/curriculum component tree
    (apps/web/src/curriculum/tag-picker.test.tsx's pattern): `// @vitest-environment jsdom` pragma;
    `vi.mock('@tanstack/react-router', ...)` stubbing `useRouter: () => ({ invalidate: vi.fn() })`
    and `Link` as a plain anchor (both `CreateCurriculumForm` and `MergeDomainNodeButton` call
    `useRouter()` unconditionally on every render, so the component cannot mount in a test without
    this — confirmed via `git grep -n "useRouter" apps/web/src/curriculum/create-curriculum-form.tsx
    apps/web/src/domain-map/merge-domain-node-button.tsx`); `vi.mock('./domain-map.api', ...)`
    stubbing `setDomainNodeTargetDepth`/`mergeDomainNodes`; `vi.mock('../curriculum/curriculum.api',
    ...)` stubbing `createCurriculum`
```

### Files to modify

```
packages/core/src/domain-map/index.ts   — export domain-mastery-status
apps/web/src/domain-map/domain-map-tree.tsx — import domainMasteryStatus from @post-anki/core;
  render a data-testid="domain-map-node-gap-badge-{node.id}" element (rose/red, e.g. "0% — gap")
  when domainMasteryStatus(node.percent) === "gap"; keep the existing percent pill
  (data-testid="domain-map-node-percent-{node.id}") rendering for every node unchanged (name,
  description, children, CreateCurriculumForm, MergeDomainNodeButton, TargetDepthControl all
  untouched — only the badge region gains the new conditional element)
```

### Data model changes

Not applicable — no schema, no shared-type, no API response shape change. `percent` is already on
`DomainNodeTreeItem` and already correctly computed; this ticket only adds a pure classification of
an existing value and a UI treatment for it.

### Documentation changes

No documentation changes required. This ticket introduces no architectural shift (no new boundary,
service, or infra — see Phase 3 detection in plan-ie's flow), so no `architecture.md` is written for
it and the existing `docs/architecture/decouple-curricula-from-domain-nodes/architecture.md` (a
ticket-scoped doc for #84, per that ticket's own note that this repo has no `docs/architecture/
<domain>/<component-slug>.md` taxonomy yet) does not need updating — it describes #84's mapping
mechanism, which this ticket doesn't change.

### BAML test coverage

Not applicable — no BAML functions touched.

### Decisions made autonomously

Four forks identified during planning, all classified `safe-default` (0/10 fork-classifier criteria
matched each time — none touch a core entity schema, money, auth, an irreversible action, a
multi-module refactor, unspecified business behavior, new external cost, the planning harness
itself, or an outward-facing side effect, and each has a reversible, stack-consistent,
pattern-following default):

- **Gap definition: `percent === 0`, not a separate "never studied" vs. "studied but scored zero"
  distinction.** Matches the wishlist's own literal wording, "gaps (areas with 0% mastery)" — not
  "areas with no curriculum." Requires zero shared-type or API changes since `percent` is already
  computed and tested by `domainNodeProgress`/`moduleProgress`, keeping the type surface minimal.
  Exposing `topicsIncluded` as a second signal is left for a follow-on if "never studied" vs.
  "studied but zero" ever needs to read differently in the UI.
- **Actionable mechanism: reuse the existing "add course here" control (`CreateCurriculumForm`),
  already rendered under every node today** — no new component, route, or endpoint. A dedicated
  gap-navigation feature (jump-to-next-gap, a subject-wide gap filter) is left for a follow-on if
  the per-node CTA proves insufficient once there's real taxonomy data to look at.
- **Visual scheme: a two-state badge — gap (rose/red) vs. everything else (existing gray percent
  pill), not a multi-tier mastery gradient.** Two states cleanly answers "gap or not," matching what
  the wishlist asked for; a graded scheme (weak/medium/strong) is extra design surface not
  requested. Rose doesn't collide with the existing amber (`priorityDistance`) or orange
  (`supersededAt`) badges already on this component.
- **Scope: applies uniformly to every subject's domain map, not gated to `source: "static_taxonomy"`
  nodes only.** The existing `percent`/`curricula` rendering already applies to any subject with
  `domain_nodes` rows regardless of `source`, and the wishlist itself doesn't restrict to
  taxonomy-backed subjects — gating it would be new, unrequested scope, not a simplification.

### Implementation order

1. `domainMasteryStatus` — red-green-refactor per implement-ie's "Layer 1 — Derivers" step, covers
   SCENARIO 2, 3, 6
2. `domain-map-tree.tsx` — wire the gap badge in using the deriver, covers SCENARIO 2, 3, 4, 5, 6
3. `domain-map-full-structure.integration.test.ts` — covers SCENARIO 1, 5, 6 (regression-proves
   existing backend behavior, no production code change expected to make it pass)
4. `domain-map-tree.test.tsx` — component test covering SCENARIO 2, 3, 4, 6 (mocking
   `@tanstack/react-router`, `./domain-map.api`, `../curriculum/curriculum.api` per the pattern in
   `tag-picker.test.tsx` — see Files to create above)

### Definition of Done — per layer

- **Backend**: `npx vitest run apps/api/src/domain-map/domain-map-full-structure.integration.test.ts`
  passes, including (1) the case "a domain node with zero curricula ever mapped anywhere in its
  subtree is still returned by getDomainMapForSubject, with percent: 0 and curricula: [], at every
  depth of a multi-level chain" (SCENARIO 1/5 — expected to pass unmodified against #84's code,
  once #84 is committed in this worktree per the Hard dependency note above; if it doesn't, that is
  itself a real regression this ticket must fix) and (2) the case "a parent with one child holding a
  confirmed, mastered curriculum mapping and one child with no mapping at all returns percent > 0 at
  the parent and percent === 0 at the unmapped child" (SCENARIO 6 — the real rollup, not a stubbed
  value). `npx vitest run packages/core/src/domain-map/domain-mastery-status.test.ts` passes:
  `domainMasteryStatus(0)` returns `"gap"`, `domainMasteryStatus(1)` through `domainMasteryStatus(100)`
  return `"progress"`.
- **Frontend**: `npx vitest run apps/web/src/domain-map/domain-map-tree.test.tsx` passes, asserting
  that a node with `percent: 0` renders `data-testid="domain-map-node-gap-badge-{nodeId}"` and a
  sibling node with `percent: 30` under the same parent does not; both render
  `data-testid="domain-map-add-course-{nodeId}"` unchanged. Runtime proof: on
  `/subject/$subjectId/map` for a subject with at least one uncovered domain node, that node's card
  visibly shows a rose "0% — gap" badge next to its name, with the "add course here" toggle still
  present and clickable beneath it — verified via a live dev server + Playwright click-through (same
  precedent #84 used for its own frontend DoD proof, since this repo's actual e2e test corpus lives
  in the separate `verification-repo`, out of scope here).
- **Infrastructure**: N/A — not touched (no new cloud resources, IaC, or deploy pipeline changes).

### Scope boundary

Out of scope for this ticket:
- Distinguishing "never studied" from "studied but scored zero average maturity" as two different
  gap semantics — both read as `percent === 0` per this ticket's Decisions above; a future ticket if
  that distinction proves useful once there's real usage data.
- Any new gap-oriented navigation — a "jump to next gap" control, a subject-wide gap list or filter
  view. The existing per-node "add course here" control is the full scope of "actionable" here.
- Bubbling an "has an uncovered descendant" signal up to a grouping/parent node whose own rollup
  `percent` is `> 0` (SCENARIO 6) — a parent's badge reflects only its own subtree average, exactly
  as `domainNodeProgress` already computes it today.
- Gating this behavior to `source: "static_taxonomy"` subjects only — applies to every subject's
  domain map uniformly.
- Any broader color/palette redesign of the domain map tree beyond the one new gap badge.
- Everything #84 already scoped out (legacy domain-node reconciliation, a subject-wide mapping
  review panel, changes to `resolveDomainPlacement`) — unchanged, untouched by this ticket either.

### Consistency gate

PASS — all 11 checks passed (0 gaps): every scenario has a "What to verify" block and a row in
Files by scenario; the one deriver's "Scenarios covered" names real scenarios; no diagrams exist to
orphan; todo.md's only note (the #84 sequencing dependency) is reflected in this spec; nothing
contradicts the constitution; no architectural shift, so no `docs/architecture/<domain>/
<component-slug>.md` obligation; not BAML; no `research.md` for this ticket.

### Red-team review (dispatched, fresh-eyes subagent)

Findings and resolution, before first confirmation:
- **Frontend test-mocking gap** — `domain-map-tree.test.tsx` wasn't going to mount at all without
  mocking `@tanstack/react-router`'s `useRouter` (called unconditionally by `CreateCurriculumForm`
  and `MergeDomainNodeButton`) and `./domain-map.api`/`../curriculum/curriculum.api`. Fixed: Files to
  create now names the exact mocking pattern, matching this repo's own precedent
  (`tag-picker.test.tsx`).
- **SCENARIO 6's core claim was never wired to a real test** — the plan described a mixed-subtree
  rollup but only planned to assert it via a hand-set UI prop, never proving `domainNodeProgress`'s
  actual averaging produces that mixed result. Fixed: the backend integration test now includes a
  real case (one curriculum-mapped, mastered child + one unmapped child) asserting the actual
  returned `percent` values, not a stubbed one.
- **Sequencing risk on #84** — this ticket's premise depends on #84's still-uncommitted code. Fixed:
  added an explicit "Hard dependency" note (this file, top) and a matching note in `todo.md`.
- Checked and found adequate, no fix needed: the many-to-many mapping table's `status: "confirmed"`
  filter in `getDomainMapForSubject` (line ~170-180) already excludes rejected/suggested rows from
  `percent`, so no double-counting or stale-suggestion leak reaches this ticket's gap/progress
  badge; no file-conflict risk exists between this ticket's planned edits and #84's actual diff
  (`git diff` on both touched files is empty from #84's side).

Plan auto-confirmed by grand-loop (no human present to review) — consistency gate passed with 0
gaps, and a dispatched fresh-eyes subagent red-team pass found 3 real gaps (listed above, all fixed
and re-verified) plus 2 checked angles that were already adequately covered.

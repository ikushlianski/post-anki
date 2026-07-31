---
type: playwright
branch: domain-node-merge
task: domain-node-merge
state: confirmed
target-project: post-anki
target-feature: features/domain-map
actions-snapshot-date: 2026-07-31
updated: 2026-07-31
---

# Playwright readiness — Domain-node merge

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — A near-duplicate knowledge-map node (e.g. two nodes for the same real concept created by
  two different AI suggestions) can be folded into one, and everything that was under the
  duplicate — its course, its own child topic — keeps working exactly as before, just under the
  surviving node. → S1
- B2 — The app refuses to let a merge create an impossible tree (a node absorbed into its own
  descendant) before it ever reaches the database, and the merge picker never even offers that
  choice. → S2, S3

**UX scenarios**
- U1 — From any node's tile on the map, the user picks another node anywhere in the tree (not just
  a sibling) to merge into and confirms; the duplicate's tile disappears, its course and child node
  reappear under the survivor. → S1
- U2 — The merge picker's dropdown only ever shows valid targets — never the node itself, never any
  node inside its own subtree. → S2

(Each B/U item links to its detailed S-row in the mapping below.)

**Not e2e (verified at backend/unit only)**
- S3 — a deliberately malformed merge call (target already a descendant of source) bypassing the
  UI entirely. Once S2's picker filtering ships, this state can't be reached by clicking; proving
  the backend's own independent rejection needs a direct call. Verified via a real-Postgres
  integration test.
- S4 — two concurrent merges racing for the same source node. The exact interleaving can't be
  reliably constructed by browser clicks; verified via a real-Postgres integration test firing two
  concurrent calls directly, mirroring `ontology-split-merge`'s own S5 precedent.
- S5 — `domainNodeProgress()`'s rollup correctness against a merged tree shape. Pure-logic
  arithmetic with no independent UI surface beyond what S1 already exercises for rendering.
  Verified as a unit test.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/domain-map/` (S1, S2 — merge lives on the map's own node tile)
- Target DB: `post-anki-e2e` (local Docker Postgres, :5436 — per `project.json`)
- Dev server URL: `http://localhost:3100` (web), API `http://localhost:8031`

## Action surface — snapshot

`features/domain-map/actions/index.ts` re-exports: `openDomainMapPage` (params
`{ page, subjectId }`, navigates to `/subject/:id/map`, waits for `domain-map-tree`),
`createCurriculumByName`, `addCourseUnderNode` (EXISTING, params
`{ page, subjectId, nodeId, name }`, drives the tree's "add course here" affordance, returns
`{ curriculumId }`), `changePlacement`, `set-node-target-depth`, and the priority-review/doc-scan
action set (not reused here).

`features/subject/actions/merge-subject.action.ts` is the direct precedent for the new domain-node
merge action pair below — same confirm-arm interaction, same `openMergePicker`-style read-back
action for S2's exclusion assertion.

`features/domain-map/seeds/seed-domain-map-fixture.ts` already has `insertDomainNode` (back-door
SQL insert — this table has no HTTP creation path independent of the agent-driven placement flow,
same fact already documented there) and `seedAdditionalDomainNode` — reused directly for building
S1/S3/S4's tree shapes rather than duplicating a raw-SQL helper.

## Scenario → action + state + testid map

### S1 — Merge two domain nodes with real children, none orphaned or duplicated

**Composes actions:** `createSubject` (subject feature, EXISTING), `openDomainMapPage` (EXISTING),
`addCourseUnderNode` (EXISTING — attaches the source's curriculum).

**Seed helpers reused (back door, not actions):** `insertDomainNode` /
`seedAdditionalDomainNode` from `seed-domain-map-fixture.ts` — builds the tree shape directly: a
target node A, an unrelated node under a different parent, the source node B as a child of that
unrelated parent (deliberately not a direct sibling of A — proves the "anywhere in the tree" design
point), and a child node C under B (the re-parenting case). Verified there is no HTTP creation path
for `domain_nodes` independent of the agent-driven placement flow — this is the correct, honest way
to set up this precondition, matching `seed-domain-map-fixture.ts`'s own documented reasoning, not
a workaround.

**Action gaps:**
- `mergeDomainNode({ page, subjectId, sourceNodeName, targetNodeName }): Promise<{ sourceNodeId: string; targetNodeId: string }>`
  — new, `features/domain-map/actions/merge-domain-node.action.ts`. Opens the source node's tile,
  clicks its merge control, selects the target from the `<select>` by its path-qualified visible
  label, confirms, waits for the source node's own tile to be removed from the DOM, resolves both
  ids via `GET /subjects/:id/domain-map` (mirrors `mergeSubject`'s own post-submit id-resolution
  pattern).

**Pre-test state:** `baseline-only` for the subject (created in-test); the domain-node tree is
back-door seeded (see above — there is no front-door way to build a multi-level tree without
dozens of "add course here" round trips, which would test tree construction, not merge); the
source's curriculum is created via `addCourseUnderNode` (front door — this is the entity whose
reassignment the scenario verifies).

**Setup role:** subject = scenery (seeded via `createSubject`, precondition only); domain-node
tree shape (target, unrelated branch, source, source's child) = scenery (back-door SQL, per above
— the tree topology being correct going IN is a precondition, not what's under test); the merge
action itself and the curriculum attached to the source = **subject** (front door — the merge
operation and the curriculum's real placement are exactly what this scenario verifies).

**Required `data-testid` attributes:**
- `domain-map-node-merge-button-<nodeId>` — opens the merge picker on a node's tile
- `domain-map-node-merge-target-select-<nodeId>` — the target `<select>`, options labeled by
  full path
- `domain-map-node-merge-confirm-<nodeId>` / `domain-map-node-merge-cancel-<nodeId>`

**Fixture variants:** none — all state built via seed helper + actions, no generated file
fixtures needed.

**Vision check candidate:** no (structural DOM + DB assertions suffice).

---

### S2 — Merge-target picker excludes invalid targets

**Composes actions:** `createSubject`, `openDomainMapPage`.

**Seed helpers reused:** `insertDomainNode` — builds a small tree: the node under test with one
child and one grandchild (its own subtree, both must be excluded), plus one sibling and one
unrelated-branch node (both must be included, path-labeled).

**Action gaps:**
- `openDomainNodeMergePicker({ page, subjectId, nodeName }): Promise<{ optionLabels: string[] }>`
  — new, co-located with `mergeDomainNode` in `merge-domain-node.action.ts` (same file, two
  exports — mirrors `merge-subject.action.ts`'s own `mergeSubject`/`openMergePicker` pairing).
  Opens the merge control and reads back the target `<select>`'s option list as visible text.
  Leaves the picker open/unconfirmed.

**Pre-test state:** `baseline-only` subject; domain-node tree back-door seeded (see above) —
this scenario's whole point is the exclusion list, not how the tree was built.

**Setup role:** the node-under-test and its subtree/sibling/unrelated nodes = scenery (seeded,
precondition for the picker's filtering logic to have something real to filter); the picker's
option list itself = **subject** (front door — reading it back through the real UI is exactly what
proves the filtering).

**Required `data-testid` attributes:** same as S1 (`domain-map-node-merge-button-*`,
`domain-map-node-merge-target-select-*`); no new ones.

**Fixture variants:** none.

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `mergeDomainNode` | S1 | No — single-purpose, ticket-local flow |
| `openDomainNodeMergePicker` | S2 | No |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | baseline-only + back-door tree seed | Subject created in-test; tree topology seeded via `insertDomainNode` (no front-door tree-builder exists); curriculum created via existing `addCourseUnderNode` action |
| S2 | baseline-only + back-door tree seed | Same seeding approach as S1, smaller tree |
| S3 (backend-only) | n/a — integration test, not e2e | Chain built directly via `pg` client in the test file, mirrors `subject-merge-concurrency.integration.test.ts`'s own direct-insert pattern |
| S4 (backend-only) | n/a — integration test, not e2e | Two subjects + nodes seeded directly via SQL in the test setup |
| S5 (unit) | n/a — pure function, no DB | Tree shape constructed as in-memory `DomainNodeRef[]`/topic arrays directly in the test file |

## Open questions

None carried forward — every fork this plan needed had a settled answer before writing
`scenarios.md` (see `spec.md`'s "Decisions made autonomously" and `discussion.md`).

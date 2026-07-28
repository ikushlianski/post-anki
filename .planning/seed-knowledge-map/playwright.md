---
type: playwright
branch: seed-knowledge-map
task: seed-knowledge-map
state: confirmed
target-project: post-anki
target-feature: features/domain-map
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Seed subjects and courses/topics (domain hierarchy, placement, knowledge map)

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — Every subdomain of programming — studied or not — has a real place in a personal knowledge
  map the user can see, not just the handful of curricula actually created so far. → S7
- B2 — Starting to learn something new (typing a course name) automatically lands it in the right
  place in that map, without the user having to manually file it — whether that place already exists
  or has to be discovered. → S3, S4, S5
- B3 — The map shows, at a glance, roughly how much of each area — down to a specific technology and
  up through its broader category — is actually known, based on real study activity. → S8
- B4 — A placement the system guessed can always be corrected without losing or duplicating the
  course. → S9

**UX scenarios**
- U1 — Clicking "add course here" on a node in the map creates a course pinned exactly there. → S3
- U2 — Typing a course name that matches something already in the map silently files it there — no
  extra step, no duplicate entry appears. → S4
- U3 — Typing a genuinely new course name grows the map around it — the new node appears, plus a
  few related nodes nobody asked for but that plausibly exist in the real ecosystem — and the course
  visibly shows where it landed, with a way to change that. → S5
- U4 — Nodes nobody has studied yet are still visible in the map, clearly reading 0%. → S7
- U5 — A studied node's percentage is visibly reflected not just on itself but on its broader
  category above it. → S8
- U6 — Re-filing a course under a different existing node moves it there, cleanly, in the UI. → S9

(Each B/U item links to its detailed S-row in the mapping below.)

**Not e2e (verified at unit/integration only)**
- SCENARIO 1 (seed script idempotency) — an operational script with no UI, same category as this
  project's existing `seed-subjects.ts` (also uncovered by e2e). Proven by a real DB integration test.
- SCENARIO 2 (percentage rollup math) — a pure function with no UI/DB surface. Proven by vitest unit
  tests, including the specific case (uneven topic counts per branch) that distinguishes the chosen
  rollup rule from the naive alternative that was rejected.
- SCENARIO 6 (agent-failure fallback) — the only user-visible outcome is "the curriculum was
  created," already exercised through the browser by S4/S5's success paths; the failure-doesn't-
  propagate behavior itself is a backend/integration concern (mock the agent to throw, assert the
  HTTP response + DB row).

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/domain-map/` (new — no existing feature folder covers a subject-level tree;
  distinct from `features/curriculum/`, which owns a single curriculum's own internal structure, and
  from `features/tree-growth/`, an unrelated, currently-unimplemented feature discovered during
  planning that reconciles a single curriculum's own module/topic tree against re-crawled docs — see
  "Note" below)
- Target DB: the project's standard e2e Postgres (`localhost:5436`, `e2e/docker-compose.yml`)
- Dev server URL: `http://localhost:3100` (web) / `http://localhost:8031` (api), per `project.json`

**Note — a related-sounding but unrelated discovery.** While inventorying the action surface, an
existing `features/tree-growth/` folder was found with tests (`grow-confirm-applies`,
`grow-empty-state`, `grow-first-doc-reconciles`, `grow-rerun-guard`) and actions
(`startTreeGrowth`/`confirmTreeGrowth`/`acceptAllChanges`) already scaffolded, targeting a
`/curriculum/:id/tree-growth` route. Per `.planning/LOG.md`'s `02:05` entry, these were already
failing (404s) before this plan started and are explicitly called out there as "a different feature
entirely," untouched by any work in this queue. Reading the scenario docs confirms the scope really
is different: `tree-growth` reconciles **one curriculum's own** module/topic tree against a
re-crawled doc source (create/update/skip proposals, staged for review) — it has nothing to do with
placing a curriculum in a **cross-curriculum, subject-level** domain hierarchy, which is what this
plan builds. No file, table, or route name in this plan collides with it. Flagged for the user's own
awareness (10 pre-existing e2e failures sit in `tree-growth`/`resource-enrichment`, unrelated to this
work) — not something this plan fixes or depends on.

## Action surface — snapshot

Actions available at planning time (relevant ones only):
- `features/subject/actions/create-subject.action.ts` — `createSubject({page, name, kind?}) ->
  {name, id}` (returns the real id via a `GET /subjects` lookup, per the `english-subject-merge`
  precedent — neither `create-subject-form.tsx` nor `subject-section.tsx` render the id in the DOM).
- `features/curriculum/actions/study-technology.action.ts` — `studyTechnology({page, name, docUrl,
  level?})` — creates a curriculum via the doc-URL research path. **Not reused here** — every
  scenario in this plan creates a curriculum by name only (no `docUrl`), which routes through
  `parseCurriculum` (confirmed by reading `curriculum.controller.ts`: `researchTriggered` is only
  `true` when `docUrl` or `researchTopic` is set), not the source-approval-gated research path —
  deliberately, so this plan's scenarios aren't entangled with an unrelated approval gate.
- `features/curriculum/actions/promote-demote-module.action.ts`,
  `toggle-strict-order.action.ts` — unrelated to this plan's scenarios.

New for this ticket (real action gaps):
- `openDomainMapPage({page, subjectId}) -> void` — navigates to `/subject/:subjectId/map`, waits for
  the tree root to render.
- `createCurriculumByName({page, subjectId, name}) -> {curriculumId}` — the plain name-only creation
  flow (no `docUrl`), used by S4 and S5. A genuine gap: no existing action creates a curriculum
  without a `docUrl`.
- `addCourseUnderNode({page, subjectId, nodeId, name}) -> {curriculumId}` — clicks a node's "add
  course here", fills the reused `CreateCurriculumForm`, submits, waits for the real network
  response. Used by S3.
- `changePlacement({page, curriculumId, targetNodeName}) -> void` — opens the curriculum's placement
  control, selects a different node by name, submits, waits for the real response. Used by S9.

**Mock-openrouter responder gap:** a new `sibling-discovery` responder in
`verification-repo/projects/post-anki/post-anki/mock-openrouter/responses.ts`, matched by
`ctx.schemaProps.includes('siblingSuggestions')` — confirmed non-colliding by grep at planning time
against the 16 existing responders' schemas (no other responder's top-level schema keys include
`siblingSuggestions`; the nearest neighbor, `curriculum-architect`'s structure schema, uses `modules`/
`topics`, not this). Must be placed before the generic catch-alls (`study-chat`, `web-grounding`),
same constraint every prior new-agent responder in this project's history has documented. Response
selection (for the one fixture this plan needs, `MOCK_SIBLING_DISCOVERY_ASTRO`) is unconditional — no
enqueue/dequeue mechanism exists in this mock (confirmed by reading the file, same finding every
sibling plan in this queue has independently confirmed), and unlike `check-my-writing-mode`'s
responder this one doesn't need content-based branching since only one ambiguous-placement fixture is
needed across S5.

**S5's second, independent mock call:** creating any curriculum by name (S3, S4, S5 alike) also
triggers the **existing, unrelated** `curriculumArchitect` structure-generation call via
`parseCurriculum` — already covered by the existing `curriculum-architect` mock-openrouter responder,
not a new gap. S3/S4/S5 all need that existing responder to return *some* valid minimal structure so
`parseCurriculum` completes without erroring; this plan does not change that responder or its
fixtures.

## Scenario → action + state + testid map

### S3 — Explicit placement via the tree UI's "add course here"

**Composes actions:** `createSubject` (scenery), `openDomainMapPage`, `addCourseUnderNode` (new).

**Action gaps:** `openDomainMapPage`, `addCourseUnderNode({page, subjectId, nodeId, name}) ->
{curriculumId}`.

**Pre-test state:** a fresh `architecture-mentor` subject (front door via `createSubject`) + a small
seeded `domain_nodes` tree under it (back door — see `state-fixtures.md`'s `seedDomainMapFixture`).

**Required `data-testid` attributes:**
- `domain-map-node-{nodeId}` — each tree node's container.
- `domain-map-add-course-{nodeId}` — the "add course here" trigger.
- `domain-node-curriculum-{curriculumId}` — a curriculum's entry under its node.

**Fixture variants:** none — no LLM-fixture dependency beyond the existing `curriculum-architect`
default response (structure generation happens regardless of placement path).

**Vision check candidate:** no.

---

### S4 — Silent exact match, zero agent calls

**Composes actions:** `createSubject` (scenery), `createCurriculumByName` (new), `openDomainMapPage`.

**Action gaps:** `createCurriculumByName({page, subjectId, name}) -> {curriculumId}`.

**Pre-test state:** same fixture as S3 — a node named "Next.js" must exist in the seeded tree.

**Required `data-testid` attributes:** same `domain-map-node-{nodeId}` / `domain-node-curriculum-
{curriculumId}` as S3 (reused, not new).

**Fixture variants:** none.

**Vision check candidate:** no.

---

### S5 — Ambiguous placement via the sibling-discovery agent

**Composes actions:** `createSubject` (scenery), `createCurriculumByName`, `openDomainMapPage`.

**Action gaps:** none beyond S4's `createCurriculumByName`.

**Pre-test state:** same fixture as S3/S4.

**Required `data-testid` attributes:**
- `curriculum-placement` — the created curriculum's own placement-path text.
- `change-placement-select` — present but not interacted with in this scenario (S9 exercises it).

**Fixture variants:** `MOCK_SIBLING_DISCOVERY_ASTRO` (new — see "Action surface" above).

**Vision check candidate:** no (structural + text assertions on node presence/count are sufficient).

---

### S7 — An unstudied node renders at exactly 0%

**Composes actions:** `createSubject` (scenery), `openDomainMapPage`.

**Action gaps:** none beyond `openDomainMapPage` (already listed under S3).

**Pre-test state:** same fixture as S3 — the "Nuxt.js" node must exist, untouched (no curriculum
attached anywhere in its subtree).

**Required `data-testid` attributes:** `domain-map-node-percent-{nodeId}`.

**Fixture variants:** none.

**Vision check candidate:** no.

---

### S8 — A studied node's rollup percentage is correct and visible on its ancestors

**Composes actions:** `createSubject` (scenery), `openDomainMapPage`.

**Action gaps:** none.

**Pre-test state:** the S3 fixture, **plus** a back-door-seeded curriculum with modules/topics
carrying fixed `progressMaturity` values, directly attached (`domain_node_id`) to the "Next.js" node
(see `state-fixtures.md`) — deliberately not created through this scenario's own UI, since proving
curriculum-creation-with-real-progress end to end would require a full probe/grading session, out of
this scenario's scope (the math itself is SCENARIO 2's job).

**Required `data-testid` attributes:** `domain-map-node-percent-{nodeId}` (reused from S7) for three
specific nodes (Next.js, Meta-frameworks, Frontend).

**Fixture variants:** none (no LLM call in this scenario's own path — the curriculum is seeded, not
created through the UI).

**Vision check candidate:** no.

---

### S9 — Changing a curriculum's placement

**Composes actions:** `createSubject` (scenery), `changePlacement` (new), `openDomainMapPage`.

**Action gaps:** `changePlacement({page, curriculumId, targetNodeName}) -> void`.

**Pre-test state:** the S3 fixture, plus one curriculum already attached to the "Astro" node (back-
door-seeded directly — this scenario is about the re-pointing operation, not about how the
curriculum first got there, which S5 already covers through the UI).

**Required `data-testid` attributes:**
- `change-placement-select` (reused from S5).
- `change-placement-submit`.
- `curriculum-placement` (reused from S5) — asserted to update after the change.

**Fixture variants:** none.

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `openDomainMapPage` | S3, S4, S5, S7, S8, S9 | No — a plain navigation helper, not a flow worth AI-invoking directly |
| `createCurriculumByName` | S4, S5 | No — single-feature-area utility; promote only if a future ticket composes it independently |
| `addCourseUnderNode` | S3 | No |
| `changePlacement` | S9 | No |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S3 | `additive-seed` (fresh subject via UI + back-door tree) | tree seeded via `seedDomainMapFixture`, not via repeated UI clicks |
| S4 | `additive-seed` | same fixture as S3 |
| S5 | `additive-seed` | same fixture as S3; `mock-openrouter` selects `MOCK_SIBLING_DISCOVERY_ASTRO` unconditionally for the new responder |
| S7 | `additive-seed` | same fixture as S3 — this scenario reads, never mutates |
| S8 | `additive-seed` + back-door curriculum/topic seed | fixed maturity values seeded directly, no probe session run |
| S9 | `additive-seed` + back-door curriculum seed | curriculum pre-attached to "Astro" before the test's own action runs |

## Open questions

None carried forward. Every fork this plan encountered had either a safe reversible default (logged
in `discussion.md`) or was a genuine architectural fork resolved and reasoned explicitly (also in
`discussion.md`) — nothing was left open pending a human answer, per this run's unattended-planning
instruction.

---
type: scenarios
branch: seed-knowledge-map
state: confirmed
updated: 2026-07-28
---

# Scenarios: Seed subjects and courses/topics — domain hierarchy, placement, knowledge map

9 scenarios total: 6 e2e (Playwright, run against the real e2e stack — `:3100` web / `:8031` api /
`:5436` postgres, per `project.json`, with `mock-openrouter` standing in for the LLM call, same
mechanism every other language/architecture-mentor feature in this project already uses), 3
backend/vitest-only (SCENARIOS 1, 2, 6 — a seed script's idempotency, a pure math deriver, and an
agent-failure fallback are pure-logic/integration surfaces with no UI to click through; per this
project's e2e-first triage bias, these are the genuine exception, not the default). Auth is the
project's single static bearer (`API_SHARED_SECRET`), already wired into every existing
action/fixture.

Each e2e scenario's `Acceptance` block is grouped **Code (BE)** / **Behavior (FE)** / **Integration
(Infra)** / **Observability** / **Tests**. Each backend-only scenario's block is grouped **Code
(BE)** / **Integration** / **Tests** (no FE section — `None`, per the consistency gate's explicit-`None`
requirement).

---

## SCENARIO 1 — Seed script produces a starter hierarchy, idempotently (not e2e)

**Narrative:** Running `apps/api/scripts/seed-domain-nodes.ts` against a fresh database inserts a
sensible starter `domain_nodes` tree under the existing "Programming / Web Development" subject —
Frontend / Backend / Cloud & DevOps / Architecture & Patterns branches, ~14 nodes, 3 levels deep
(mirrors the taxonomy already drafted in the issue's own 2026-07-18 comment, kept small as a first
cut rather than the full ~50-course proposal). Running it again afterward inserts nothing new.

**Why not e2e:** no UI surface — this is a one-shot operational script, same category as
`seed-subjects.ts` (which also has no e2e coverage; it's proven by re-running against a real DB and
checking row counts).

**Acceptance:**
```
Code (BE):
  - apps/api/scripts/seed-domain-nodes.ts: a static SEED_HIERARCHY tree (name + description +
    ordered children, no LLM call), looked up under the existing "Programming / Web Development"
    subject by name (fails loudly if that subject doesn't exist — it's a prerequisite, seeded by the
    existing seed-subjects.ts). For each node: check existence by (subjectId, parentId, name) via a
    SELECT before INSERT — mirrors seed-subjects.ts's existing-name check pattern exactly.
  - domain-map.repo.ts: insertDomainNode(subjectId, parentId, name, description, order).
Integration:
  - Running the script twice against the same database produces the same final row count both times
    — the second run's own summary line (created: 0, skipped: N) proves the idempotency check fired
    for every node, not just the roots.
Tests:
  [ ] apps/api/scripts/seed-domain-nodes.integration.test.ts covers: fresh DB → creates the full tree
      (assert count + at least one non-null parent_id); re-run → creates 0, all skipped; missing
      "Programming / Web Development" subject → throws, no partial insert.
```

---

## SCENARIO 2 — Percentage rollup deriver: pure, unified, no time decay (not e2e)

**Narrative:** `domainNodeProgress()` computes a node's approximate knowledge percentage by
flattening every topic under every curriculum in that node's subtree and averaging maturity — the
same math `moduleProgress`/`curriculumProgress` already use, just gathered from a wider, tree-shaped
scope.

**Why not e2e:** pure function, no UI, no DB — exactly the "genuinely pure logic with no flow surface"
exception this project's own triage rule reserves for unit tests.

**Acceptance:**
```
Code (BE):
  - packages/core/src/domain-map/domain-map-progress.ts: domainNodeProgress(nodeId, nodes, curriculumTopics)
    → ModuleProgress. Walks descendants via parentId with a visited-set (cycle-safe) and a depth cap
    of 6; collects every topic from every curriculum whose domainNodeId falls in the subtree;
    delegates the actual averaging to the existing, unmodified moduleProgress(topics).
Tests:
  [ ] domain-map-progress.test.ts covers:
      - a leaf node with one attached curriculum whose topics have maturity [80, 40, 0] → percent 40
        (identical to calling curriculumProgress directly on those topics — same underlying math).
      - a 3-level-deep grouping node with two descendant curricula (one 2 levels down with topics
        [100, 100], one 3 levels down with topics [0, 0]) → percent 50 (every topic weighted equally
        regardless of depth/branch — NOT (100 + 0) / 2 branches = 50 coincidentally matching here;
        add a second case with uneven topic counts per branch, e.g. [100] vs [0,0,0], asserting the
        result is 25 (1 of 4 topics fully mature), not 50 (which a naive per-branch average would
        wrongly produce) — this is the case that actually distinguishes the two rollup strategies.
      - a node with zero topics anywhere in its subtree (no attached curricula at all, direct or
        descendant) → percent exactly 0.
      - calling the function twice with the identical input (no wall-clock argument exists to vary)
        returns identical output both times — the no-time-decay contract, asserted directly.
      - a deliberately cyclic nodes array (a bug-injection test: node A's parentId points to node B,
        B's points to A) does not infinite-loop — returns within the depth cap rather than hanging.
```

---

## SCENARIO 3 — Explicit placement: user picks an existing node in the tree UI

**Narrative:** On the "Programming / Web Development" domain-map page, the user finds the
"Meta-frameworks" node, clicks its "add course here" affordance, types a curriculum name ("Next.js
App Router deep dive"), and submits. The new curriculum appears attached directly under
"Meta-frameworks" in the tree — no agent call, no ambiguity to resolve, since the parent was chosen
explicitly.

**Setup role:** Subject = the curriculum creation + its placement (front door — a real
`addCourseUnderNode` action driving the actual "add course here" button + form submit). Scenery =
the seeded "Programming / Web Development" domain-map tree (front-door via the seed script running
as part of e2e setup — see `state-fixtures.md`; this is scenery here because SCENARIO 1 already
proves the seed script itself, so this scenario just needs the tree to exist, not to re-verify how it
got there).

**UI clicking notes:** "add course here" on a tree node opens the existing `CreateCurriculumForm`
inline (reused, not a new form) with `domainNodeId` pre-set and hidden — the visible fields are
identical to creating a curriculum anywhere else in the app (name input, submit button). Success
indicator: `router.invalidate()` on the domain-map route re-fetches the loader data, and the new
curriculum's name appears as a child entry under the "Meta-frameworks" tree node (a
`data-testid="domain-node-curriculum-{curriculumId}"` row), not as a toast or redirect.

**Acceptance:**
```
Code (BE):
  - createCurriculumInput gains optional domainNodeId. resolveDomainPlacement() short-circuits to
    { domainNodeId: input.domainNodeId } with a single validation query (does this node belong to
    input.subjectId?) when domainNodeId is present — no normalized-match query, no agent call.
  - createCurriculum() persists domainNodeId on the inserted row.
Behavior (FE):
  - Domain-map tree page (subject.$subjectId.map.tsx) renders each domain_nodes row recursively
    (data-testid="domain-map-node-{nodeId}") with an "add course here" button
    (data-testid="domain-map-add-course-{nodeId}").
  - Clicking it reveals CreateCurriculumForm inline under that node; submitting a non-empty name
    calls createCurriculum with domainNodeId set to that node's id.
  - After the mutation resolves and the loader re-fetches, the new curriculum appears as a child
    entry directly under the "Meta-frameworks" node, nowhere else in the tree.
Integration (Infra):
  - A real GET /subjects/:id/domain-map (or a direct SELECT) after submission confirms exactly one
    curricula row has domain_node_id equal to the "Meta-frameworks" node's real id.
  - Zero calls to the sibling-discovery mock-openrouter responder during this scenario — asserted by
    the mock server's own request log/count staying at 0 for that responder (proves path 1 truly
    skips paths 2 and 3, not just that the end result happens to look right).
Observability: n/a.
Tests:
  [x] @seed-knowledge-map.S3 — e2e test written
```

---

## SCENARIO 4 — Silent exact match: typed name matches an existing node, no agent call

**Narrative:** The user creates a curriculum on "Programming / Web Development" (not through the
tree UI's explicit picker — the ordinary curriculum-creation entry point) and types a name that,
once normalized (trim, lowercase, collapse whitespace), exactly matches an existing node — e.g.
typing "  next.js  " when a "Next.js" node already exists under Meta-frameworks (seeded by
SCENARIO 1). The curriculum attaches directly to that node. No agent call fires, no duplicate
"Next.js" node is created.

**Setup role:** Subject = the curriculum creation + the silent-match resolution (front door — a real
form submission through the ordinary creation entry point, no explicit node selection). Scenery =
the seeded tree (as S3).

**UI clicking notes:** Identical form/flow to today's ordinary curriculum creation (no new UI for
this path — the matching happens entirely server-side during the existing submit). Success
indicator: the new curriculum shows up under the matched "Next.js" node on the domain-map page after
navigating there, same testid convention as S3.

**Acceptance:**
```
Code (BE):
  - resolveDomainPlacement(): when domainNodeId is absent AND the subject has ≥1 domain_nodes row,
    normalize the submitted name (same normalization rule as tags.normalizedName — lowercase, trim,
    collapse internal whitespace) and compare against every node name in that subject's tree
    (case/whitespace-insensitive). On an exact normalized match, return that node's id directly —
    no agent call.
  - Normalization is a pure, exported, independently testable function (not inlined) — shared with
    or mirroring the existing tag-normalization logic rather than reinventing it.
Behavior (FE):
  - No new FE surface for this path — the ordinary create-curriculum form, unmodified, is what's
    exercised. This scenario's FE assertion is purely observational: after creation, navigating to
    the domain-map page shows the new curriculum under the pre-existing "Next.js" node.
Integration (Infra):
  - Zero calls to the sibling-discovery mock-openrouter responder during this scenario (same
    request-log assertion technique as S3).
  - Exactly one "Next.js" node exists in domain_nodes for the subject after this scenario — proves no
    duplicate was created alongside the match.
Observability: n/a.
Tests:
  [x] @seed-knowledge-map.S4 — e2e test written
```

---

## SCENARIO 5 — Ambiguous placement: the cheap sibling-discovery agent proposes a home

**Narrative:** The user creates a curriculum on "Programming / Web Development" typing a genuinely
new topic name that doesn't match anything in the seeded tree (e.g. "Astro" — a meta-framework not
in the small starter seed). The sibling-discovery agent is called exactly once, proposes
"Meta-frameworks" as the parent and "Astro" as the new node's name, plus a bounded list of sibling
suggestions (e.g. "Qwik", "SvelteKit" — informational nodes with no curriculum attached). The new
"Astro" node (plus its proposed siblings) appear under "Meta-frameworks" in the tree, the curriculum
attaches to "Astro", and a "placed under Meta-frameworks — change placement" affordance is visible
on the result.

**Setup role:** Subject = the agent call + the resulting node creation + attachment (front door — a
real form submission whose typed name doesn't match anything, driving the real placement
orchestrator; the agent's response itself is scenery, stubbed via `mock-openrouter`). Scenery = the
seeded tree (as S3/S4).

**UI clicking notes:** Same ordinary create-curriculum form as S4 (no explicit picker used). Because
this path calls a real (mocked) LLM, the submit button shows the same in-flight/loading treatment
this project's other agent-backed submissions already use (e.g. `batch-practice`'s generating state)
— wait for the real network response, not a fixed timeout. Success indicator: the new "Astro" node
appears in the tree under "Meta-frameworks" alongside its siblings, and the curriculum's own
detail/settings area shows a `data-testid="curriculum-placement"` line reading its placement path
plus a `data-testid="change-placement-select"` control (the same component S9 exercises).

**Acceptance:**
```
Code (BE):
  - createSiblingDiscoveryAgent() (apps/api/src/mastra/sibling-discovery.agent.ts): instructions
    given the subject's existing tree (compact name+parent-path list, not raw ids) and a new topic
    name, propose (a) an existing parent by NAME PATH (or none = subject root), (b) a name for the
    new node representing the topic, (c) up to 8 sibling/subtopic names that plausibly exist in the
    real ecosystem around this topic, whether or not the user has studied them. Registered under
    AGENT_KEYS.siblingDiscovery in mastra.ts, alongside the existing 15 — none edited. Reuses
    resolveAgentModel(env) — no new model tier.
  - siblingDiscoveryResultSchema (packages/shared/src/domain-map.ts): z.object({ parentNodePath:
    z.array(z.string()).nullable(), nodeName: z.string().min(1), siblingSuggestions:
    z.array(z.string()).max(8) }).
  - domain-placement.orchestrator.ts: resolveDomainPlacement() reaches this path only when paths 1-2
    both miss; calls the agent once; resolves parentNodePath against real nodes by case-insensitive
    name match, walking one segment at a time, falling back to the last successfully resolved
    ancestor (or subject root) on the first unresolved segment; creates the new node under that
    parent, creates up to 8 sibling nodes under the same parent (name-deduplicated against existing
    siblings — a suggestion matching an existing sibling name is skipped, not duplicated); returns
    the new node's id as domainNodeId.
Behavior (FE):
  - Ordinary create-curriculum form, unmodified (as S4).
  - After creation, the domain-map tree (once navigated to) shows "Astro" under "Meta-frameworks"
    plus the proposed sibling nodes (each a domain-map-node-{nodeId} entry with a curriculum count of
    0 and a percent of 0 — this is also a live cross-check of SCENARIO 7's core claim, produced as a
    side effect of a real user action rather than only via direct seeding).
  - The created curriculum's own page/settings shows curriculum-placement text naming the resolved
    path ("Programming / Web Development > Frontend > Meta-frameworks > Astro") and a visible
    change-placement-select control.
Integration (Infra):
  - Exactly one call to the sibling-discovery mock-openrouter responder for this scenario (request-
    log count = 1, not 0, not 2+) — the positive counterpart to S3/S4's zero-call assertion, proving
    this is the one path that actually reaches the agent.
  - New `sibling-discovery` mock-openrouter responder matched by a schema-prop discriminator
    (schemaProps includes `siblingSuggestions`, confirmed non-colliding against all existing
    responders by grep at planning time — see `playwright.md`), placed before the generic catch-alls
    (`study-chat`, `web-grounding`). Fixture: MOCK_SIBLING_DISCOVERY_ASTRO returning parentNodePath:
    ["Programming / Web Development", "Frontend", "Meta-frameworks"], nodeName: "Astro",
    siblingSuggestions: ["Qwik", "SvelteKit"].
Observability: n/a.
Tests:
  [x] @seed-knowledge-map.S5 — e2e test written
```

---

## SCENARIO 6 — Agent failure falls back to unplaced, never blocks creation (not e2e)

**Narrative:** The sibling-discovery agent call throws (network error, timeout, or a structured-
output validation failure). Curriculum creation still succeeds — the curriculum is created exactly
as it would be today, with no domain-node placement, no error surfaced, no retry.

**Why not e2e:** proving a caught backend exception doesn't propagate to a 500 is an integration-test
concern (mock the agent to throw, assert the HTTP response and the DB row), not a browser-observable
UX difference worth its own Playwright run — the only user-visible outcome is "the curriculum was
created," which S4/S5 already exercise through the browser on the success path.

**Acceptance:**
```
Code (BE):
  - domain-placement.orchestrator.ts: the agent call inside resolveDomainPlacement() is wrapped in
    try/catch (same shape as study-chat.service.ts's existing fallback pattern); on any thrown error,
    resolveDomainPlacement() returns { domainNodeId: null } rather than propagating.
  - handleCreateCurriculum: unaffected by resolveDomainPlacement()'s outcome beyond reading
    domainNodeId off the result — no special-case branching for the failure case, since null is
    already the input's own default meaning "unplaced".
Integration:
  - Mocked agent throws (vi.mock the Mastra agent's generate() to reject) → POST /curricula still
    returns 200 with a valid curriculum row, domain_node_id: null confirmed via a real SELECT.
Tests:
  [ ] apps/api/src/domain-map/domain-placement.orchestrator.test.ts covers: agent rejects with a
      network error → domainNodeId null, no throw; agent resolves with a schema-invalid shape (e.g.
      siblingSuggestions has 9 entries, over the max(8) cap) → structured-output validation itself
      throws, caught the same way → domainNodeId null.
```

---

## SCENARIO 7 — An unstudied node renders at exactly 0% (mandatory — the core "reflects reality" claim)

**Narrative:** The seeded "Nuxt.js" node — created by SCENARIO 1's static seed, never studied, no
curriculum attached to it or anywhere in its subtree — is visible in the domain-map tree at exactly
0% knowledge, not hidden and not showing a placeholder/blank value. This is the concrete, checkable
version of the issue's central claim: "the map reflects reality of the domain, independent of what's
been studied."

**Setup role:** Subject = the tree page rendering this specific untouched node (front door — a real
page navigation and DOM read). Scenery = the seeded tree (SCENARIO 1's output, present via
`state-fixtures.md`'s seed step, not re-verified here).

**UI clicking notes:** Pure read — navigate to `/subject/:subjectId/map`, locate the "Nuxt.js" node
(nested under Frontend > Meta-frameworks), read its percent badge. No mutation, no submit.

**Acceptance:**
```
Code (BE):
  - GET /subjects/:id/domain-map (domain-map.controller.ts + domain-map.repo.ts's
    getDomainMapForSubject): assembles the full tree (one query for domain_nodes WHERE subject_id,
    one query for curricula+modules+topics WHERE subject_id AND domain_node_id IS NOT NULL — no
    recursive CTE, no N+1), calls domainNodeProgress() per node using the in-memory assembled data,
    and includes a percent field on EVERY node in the response, including ones with no curriculum
    anywhere in their subtree — the API contract itself makes "absent from the tree" impossible for
    an untouched node, since the tree is built from domain_nodes rows, not from curricula.
Behavior (FE):
  - domain-map-node-{nuxtNodeId} is present in the DOM (not conditionally hidden for zero-progress
    nodes) and its percent badge (data-testid="domain-map-node-percent-{nuxtNodeId}") reads exactly
    "0%", not blank, not "N/A", not omitted.
Integration (Infra): n/a — pure GET, no LLM, no mutation.
Observability: n/a.
Tests:
  [x] @seed-knowledge-map.S7 — e2e test written
```

---

## SCENARIO 8 — A studied node renders its real rollup percentage, visible up the ancestor chain

**Narrative:** A curriculum is seeded (additive, not created through this scenario's own UI flow —
its creation isn't what's under test here) directly attached to the "Next.js" node, with topics
carrying real stored `progressMaturity` values (mixed, not all-mastered). The domain-map page renders
"Next.js" at the exact percent `domainNodeProgress` would compute for those topics, and its parent
"Meta-frameworks" and grandparent "Frontend" nodes also show non-zero percentages reflecting that
same data rolled up, proving the rollup isn't just computed for the leaf but genuinely walks up.

**Setup role:** Subject = the tree page rendering the rollup (front door — a real page navigation and
DOM read of three specific nodes). Scenery = the seeded tree (SCENARIO 1) plus a seeded curriculum +
modules + topics with fixed `progressMaturity` values attached directly to the "Next.js" node (back
door — inserted directly via a test-only seed helper, since this scenario is about the read/rollup
path, not about proving curriculum-creation-with-real-progress end to end, which would require a full
probe/grading session and belongs to SCENARIO 2's unit coverage for the math itself).

**UI clicking notes:** Pure read, same as S7 — navigate, locate three specific nodes, read three
percent badges. No mutation.

**Acceptance:**
```
Code (BE): (reuses getDomainMapForSubject/domainNodeProgress from S7 verbatim — this scenario proves
  correctness against known seeded data, not new logic)
Behavior (FE):
  - domain-map-node-percent-{nextjsNodeId} reads the exact percent value computed by feeding the
    fixture's own topic maturity values into domainNodeProgress() directly in the test (not a
    hardcoded number in the test — computed the same way SCENARIO 2's unit tests compute expected
    values, so a future change to the rounding rule doesn't silently desync this e2e's expectation).
  - domain-map-node-percent-{metaFrameworksNodeId} and domain-map-node-percent-{frontendNodeId} are
    both non-zero and reflect the same underlying topic data rolled up (not equal to the leaf's own
    percent, since Meta-frameworks/Frontend's subtrees also include the untouched siblings from
    SCENARIO 1/7 diluting the average toward 0 — asserting they are LOWER than the leaf's percent,
    not just "non-zero", is what actually proves the rollup is reading the wider subtree rather than
    just copying the leaf's value up).
Integration (Infra): n/a — pure GET.
Observability: n/a.
Tests:
  [x] @seed-knowledge-map.S8 — e2e test written
```

---

## SCENARIO 9 — Changing a curriculum's placement re-points it to a different node

**Narrative:** The curriculum created in S5 ("Astro", attached under Meta-frameworks by the agent) is
opened, its `change-placement-select` control is used to pick a different existing node ("Backend"),
and submitted. The tree now shows the curriculum under "Backend"; "Meta-frameworks" > "Astro" no
longer lists it. The "Astro" node itself is untouched (still exists, still under Meta-frameworks) —
only the curriculum's own attachment moved, proving this is a curriculum-field update, not a
node-restructuring operation (the thing issue #56 owns).

**Setup role:** Subject = the placement change itself (front door — a real select + submit through
`change-placement-select`). Scenery = a curriculum already attached somewhere in the tree (additive
seed — this scenario doesn't depend on S5 having run first in the same suite; it seeds its own
already-placed curriculum directly, same reasoning as S8's back-door curriculum seed).

**UI clicking notes:** `change-placement-select` is a `<select>` populated from the subject's
existing node names (flattened tree, indented by depth in the option label, e.g. "— — Astro" for a
2-level-deep node) via the same `GET /subjects/:id/domain-map` data the tree page uses. Selecting a
different node and clicking a confirm button (data-testid="change-placement-submit") calls the
existing `PATCH /curricula/:id` (updateCurriculumInput extended with domainNodeId), waits for that
network response, then the page's own placement text (data-testid="curriculum-placement") updates to
reflect the new path — no full page reload required, matches this project's existing pattern of
`router.invalidate()` after a mutation.

**Acceptance:**
```
Code (BE):
  - updateCurriculumInput (packages/shared/src/curriculum.ts) gains optional domainNodeId:
    z.string().nullable().optional(). updateCurriculum() (curriculum.repo.ts) persists it when
    present, validated to belong to the curriculum's own subjectId (400 if a caller tries to attach
    a curriculum to a different subject's node — cross-subject placement is never valid).
  - No change to domain_nodes at all — this endpoint only ever writes curricula.domain_node_id.
Behavior (FE):
  - change-placement-select (apps/web/src/domain-map/change-placement-select.tsx) renders every node
    in the curriculum's own subject's tree as an option, current placement pre-selected.
  - Selecting a different node + clicking change-placement-submit calls updateCurriculum with the new
    domainNodeId; on success, curriculum-placement's text updates to the new path without a full page
    reload (router.invalidate() re-fetches).
Integration (Infra):
  - A real GET /subjects/:id/domain-map after the change confirms the curriculum id now appears under
    "Backend" and no longer under "Astro"/"Meta-frameworks" — proven via the response body, not just
    the rendered DOM (catches a bug where the DB write succeeds but the tree query's join logic still
    shows it in the old spot).
Observability: n/a.
Tests:
  [x] @seed-knowledge-map.S9 — e2e test written
```

---
type: spec
branch: seed-knowledge-map
task: Seed subjects and courses/topics — incremental domain/technology intake (issue #48)
complexity: complex
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/seed-knowledge-map/playwright.md
  stateFixtures: .planning/seed-knowledge-map/state-fixtures.md
---

# Spec: Seed subjects and courses/topics — domain hierarchy, placement, knowledge map

### What to do

Add a new hierarchy that sits between a `subject` and its `curricula`, reflecting the real shape of
a domain (e.g. "Programming / Web Development" → "Frontend" → "Meta-frameworks" →
"Next.js"/"Remix"/"TanStack Start"/"Nuxt.js") independent of what's actually been studied. Seed a
starter hierarchy for the one existing "Programming / Web Development" subject. When a curriculum is
created, place it in this hierarchy — explicitly if the user picks a node, silently if the typed
topic name matches an existing node, or via a new cheap agent that proposes a parent plus sibling
nodes when neither applies. Visualize the tree per subject with a per-node approximate knowledge
percentage, computed from real stored topic progress, including nodes nobody has studied yet (which
must show 0%, not be absent from the tree).

### Data model (decided)

**New table `domain_nodes`** — self-referential, one tree per subject:

```
domain_nodes
  id            text primary key
  subject_id    text not null        -- every node, not just roots, denormalized for O(1) queries
  parent_id     text                 -- nullable self-ref; null = direct child of the subject root
  name          text not null
  description   text
  order         integer not null default 0
  created_at    timestamp not null default now()
```

No `.references()` FK constraints — matches this schema's dominant convention (plain text columns +
app-level validation; `subjects`/`curricula`/`modules`/`topics`/`phrases`/`attempts` all do this,
the one exception being the phrase-bank-concurrency-fix's recent real FK, which was added
specifically because that table had proven concurrency/integrity gaps this one hasn't). Revisit as a
real FK if issue #56 (ontology split/merge) finds integrity problems — not needed for v1.

**One additive nullable column on `curricula`:** `domain_node_id text` (no default, existing rows
stay `null`, zero data migration, zero risk to any existing curriculum in dev or prod).

**No `curriculum_id` column on `domain_nodes`.** The relationship is one-directional
(`curricula.domain_node_id → domain_nodes.id`), not bidirectional — a domain node's "attached
curricula" are discovered by querying `curricula WHERE domain_node_id = <id>`, not stored redundantly
on the node. This also means a single node can have more than one curriculum attached without any
schema change (e.g. "Next.js" could eventually hold both an "App Router basics" and a "deep dive"
curriculum) — not needed for v1's scenarios, but free from this shape.

Migration: next number is `0021` (highest existing is `0020_new_lady_mastermind.sql`), generated via
`npm run db:generate:api`, applied via `npm run db:migrate:api` — never hand-written, never pushed
directly (per this project's — and the wider engineering constitution's — migration rule).

### Percentage rollup (decided — one unified rule, no time decay)

New pure deriver, `packages/core/src/domain-map/domain-map-progress.ts`:

```ts
domainNodeProgress(nodeId, nodes: {id, parentId}[], curriculumTopics: {domainNodeId, topics: Topic[]}[]): ModuleProgress
```

Walks `nodes` from `nodeId` down through every descendant (via `parentId`, cycle-safe visited-set,
depth-capped at 6 as a defensive bound — v1 never creates cycles, since there is no re-parenting, but
the deriver shouldn't infinite-loop if that invariant is ever violated by a bug), collects **every**
topic belonging to **every** curriculum attached anywhere in that subtree (not just directly on
`nodeId`), flattens them into one list, and calls the **existing, unmodified**
`moduleProgress(topics)` from `packages/core/src/curriculum/progress.ts` on the result.

This is a single rule for both cases the issue describes, not two branches:
- A leaf node with exactly one attached curriculum reduces to that curriculum's own
  `curriculumProgress` (its topics are the only ones in the subtree).
- A grouping node with several descendant curricula gets every leaf topic weighted equally,
  regardless of how deep or how many siblings its branches have — deliberately not an average of
  already-rounded child percentages, which would skew unpredictably with tree shape (one studied
  leaf among nine unstudied siblings should read as a small non-zero number, not get diluted or
  inflated by how the averaging nests).
- A node with **zero** topics anywhere in its subtree (nothing studied, nothing even attached) —
  e.g. a seeded-but-untouched "Nuxt.js" leaf — returns exactly `0`, the same convention
  `moduleProgress` already uses for zero included topics. This is the concrete, checkable version of
  the issue's "the map reflects reality of the domain, independent of what's been studied."

Pure function of stored `topic.progress.maturity` only — no wall-clock input anywhere in the call
graph, satisfying `.product/PRINCIPLES.md`'s "No passive maturity decay" by construction, not by
convention.

### Placement mechanism (decided)

Three paths, evaluated in this order at curriculum-creation time, inside a new
`resolveDomainPlacement()` step in `apps/api/src/domain-map/domain-placement.orchestrator.ts`,
called from `handleCreateCurriculum` before `createCurriculum()` inserts the row:

1. **Explicit.** `createCurriculumInput` gains an optional `domainNodeId`. If the client sends one
   (the tree UI's "add course here" button on a node), it's used directly — validated to belong to
   the same `subjectId`, zero agent calls, zero cost.
2. **Silent exact/normalized match.** Only when `domainNodeId` is absent **and** the subject already
   has at least one `domain_nodes` row (see "subject gating" below): normalize the submitted
   curriculum name the same way `tags.normalizedName` already normalizes tag names (lowercase, trim,
   collapse whitespace) and compare against every existing node's name in that subject's tree. A
   confident match (exact after normalization) attaches directly — no agent call, no new node
   created.
3. **Cheap agent — only on the remaining ambiguous case.** No explicit node, no confident match, and
   the subject has an existing tree. A new Mastra agent
   (`apps/api/src/mastra/sibling-discovery.agent.ts`, `createSiblingDiscoveryAgent()`, registered as
   `AGENT_KEYS.siblingDiscovery`) receives the subject's current tree (name + parent-path only —
   never asked to invent or echo a database id) and the new topic name. It returns names, not ids:
   a `parentNodePath` (array of existing node names from the subject root down to the chosen parent,
   or empty/null for "attach at the subject root"), a `nodeName` for the new node representing the
   topic itself, and up to 8 `siblingSuggestions` — sibling node names to create alongside it under
   the same parent (informational-only nodes, no curriculum attached — this is the mechanism that
   puts "Nuxt.js" in the tree the moment someone studies "Next.js", even though nobody's touched
   Nuxt.js). The orchestrator resolves `parentNodePath` against real nodes by case-insensitive name
   match, walking one segment at a time and stopping at the first unresolved segment (falls back to
   its last successfully resolved ancestor, never to a database-id hallucination). Exactly one call
   per ambiguous placement; never on paths 1 or 2. Reuses `resolveAgentModel(env)` as-is (already
   `gemini-2.5-flash`) — the issue's "cheap agent, no strong reasoning model needed" requirement is
   already satisfied by this project's one existing model tier; no new env var, no new plumbing.

**Subject gating (decided — cost control).** Placement (paths 2 and 3) only runs for a subject that
**already has at least one `domain_nodes` row**. In v1 that's only "Programming / Web Development"
(the one seeded subject). The other 7 existing subjects (Business, Investing, English×2, Polish,
Spanish, Swedish, Music) have zero `domain_nodes` rows, so every curriculum created under them
behaves **exactly as it does today** — no placement attempt, no agent call, `domain_node_id` stays
`null`. This is the direct, load-bearing consequence of the CLAUDE.md cost-awareness mandate: a
subject with no tree has nothing to place into, and silently trying anyway would mean every
curriculum creation on 7 of 8 subjects starts firing a new LLM call it never fired before, for a
feature that only claims to cover "programming" in this first cut.

**Failure fallback — non-blocking, no new state.** If the sibling-discovery agent call throws (any
error: network, timeout, schema-invalid structured output), the orchestrator catches it and returns
`domainNodeId: null` — the curriculum is created exactly as it behaves today, unplaced, no error
surfaced to the user, no retry. Same `try/catch`-fallback shape already established elsewhere in this
codebase (`study-chat.service.ts`, `probe-grounding.ts`'s `webGround`). No blocking prompt is ever
shown — "no confident position" and "an infra failure happened" are treated identically: skip
placement, don't block curriculum creation on it.

**Change placement (decided — the correctness mechanism behind "auto-apply, never block").** A
curriculum's `domainNodeId` can be changed after creation via the **existing**
`updateCurriculumInput`/`PATCH /curricula/:id` endpoint (extended with an optional
`domainNodeId: string | null`), not a new dedicated route. This re-points which node the curriculum
is attached under; it never moves or restructures a `domain_nodes` row itself, so it carries none of
the cycle-detection or re-parenting risk that issue #56 owns — it's a plain field update on
`curricula`, same shape as changing `speed` or `defaultDepth` already is.

### Decisions made autonomously (no human present — see `discussion.md` for full reasoning and the
advisor's second-pass review that shaped several of these)

1. **New `domain_nodes` table, not a reuse of `tags`/`tagAssignments`.** `tag_assignments` is unique
   on `(tagId, nodeType, nodeId)` — built for one node carrying many tags and one tag spanning many
   unrelated branches (e.g. "Performance" tagging both a Redis module and an unrelated Postgres
   module simultaneously). A domain hierarchy needs the opposite invariant: every node has **exactly
   one** parent — that's what the whole "where does this sit" placement mechanism depends on.
   Reusing `tags` would mean either multi-parent nodes (the tree invariant gone) or a discriminator
   column so every read and every future AI tag-suggestion has to ask "is this a domain node or a
   cross-cutting tag" — real ongoing complexity for zero structural reuse, since `tag_assignments`'
   unique-triple design offers nothing toward tree traversal. The issue's own 2026-07-18 comment
   already separates these two concepts explicitly (cross-cutting concepts → tags; domain/subdomain
   structure → hierarchy) — this is user intent, not just inference. `tags`/`tagAssignments` are
   completely untouched by this plan.
2. **Subjects stay flat and untouched.** `domain_nodes` hangs beneath a subject (`subjectId` on every
   node), it does not fold subjects into itself or restructure the 8 existing rows. The two
   near-duplicate "Webdev"/"Programming / Web Development" subjects already sitting in production
   (per wishlist item #56) will render as two separate trees — known, accepted, not this plan's job
   to fix.
3. **No re-parenting or cycle detection in v1.** This plan only ever creates new `domain_nodes` rows
   and attaches curricula to existing ones. Moving/splitting/merging nodes is issue #56, the very
   next item in this queue.
4. **Percentage rollup is one unified subtree-flattening rule**, reusing `moduleProgress` unchanged,
   rather than two special-cased branches (leaf-with-curriculum vs. grouping-node) — see the
   "Percentage rollup" section above for why the naive "average of child percentages" alternative was
   rejected (unpredictable skew depending on tree shape).
5. **Placement is auto-applied, never gated behind a blocking approval step** — a deliberate
   departure from the grounded-knowledge-map precedent of gating course generation behind human
   source approval. That gate exists because ungrounded/hallucinated **external** content is a trust
   risk; domain-tree placement is a low-stakes **internal** organizational decision, cheaply and
   visibly correctable after the fact via "change placement." Stacking a second blocking review step
   onto curriculum creation (which already has the source-approval gate for research-triggered
   curricula) would make creation a multi-stop wizard and directly conflicts with
   `.product/PRINCIPLES.md`'s "System selects — user never manages a queue."
6. **Placement only runs for subjects that already have a tree** (see "Subject gating" above) — cost
   control, not a scenario the issue itself flagged, but a direct requirement of CLAUDE.md's
   mandatory cost-awareness rule once the mechanism was designed.
7. **Sibling-discovery agent returns names, not database ids**, resolved by the orchestrator via
   name matching — matches how every other content-generating agent in this codebase already avoids
   asking an LLM to echo an opaque id (e.g. `curriculumArchitect` returns module/topic titles, never
   database keys).
8. **"Change placement" reuses the existing `PATCH /curricula/:id` endpoint**, not a new dedicated
   route — RESTful reuse (the entity is the endpoint; `domainNodeId` is just another curriculum
   field, same as `speed`/`hinting`/`defaultDepth`).
9. **"Global map" = a forest of independent per-subject trees**, not one universal root spanning all
   subjects. Reading the issue's "global personal knowledge map" as requiring subjects to unify under
   one root would be a much larger, riskier restructuring than the issue's own scope implies.
10. **Seed script mirrors `seed-subjects.ts` exactly**: a static list (not AI-generated), idempotent
    by `(subjectId, parentId, name)` app-level existence check before insert, no LLM call — matches
    both this codebase's existing seeding precedent and the "seed is a starting basis, not a rigid
    pre-built tree" framing from the issue (a small, sensible first cut, not an exhaustive port of
    all ~50 candidate courses from the issue's own comment).
11. **Consistency-gate auto-confirmation.** All consistency-gate checks passed with 0 gaps (recorded
    in `discussion.md`); per this run's explicit unattended-planning instruction, `state: draft` was
    flipped to `state: confirmed` in every plan file immediately once the gate passed, without a
    human review step in between. Plan auto-confirmed by grand-loop-style autonomous run (no
    interactive review) — consistency gate passed, 0 gaps, see decisions above for every judgment
    call with no safe default.

### Files to touch

```
packages/shared/src/
  curriculum.ts               — createCurriculumInput gains optional domainNodeId: z.string()
                                 .nullable().optional(); updateCurriculumInput gains the same field
  domain-map.ts                — NEW: domainNodeSchema, domainNodeTreeItemSchema (recursive, +
                                 percent + attached curriculum summaries), siblingDiscoveryResultSchema

packages/core/src/
  domain-map/
    domain-map-progress.ts     — NEW: domainNodeProgress() deriver (reuses moduleProgress)
    domain-map-progress.test.ts — NEW: unit coverage (SCENARIO 2)

apps/api/src/
  db/
    schema.ts                  — new domainNodes table; curricula gains domainNodeId column
    migrations/0021_*.sql      — new, generated via `npm run db:generate:api`
  domain-map/
    domain-map.repo.ts         — NEW: insertDomainNode, listDomainNodesForSubject,
                                  getDomainMapForSubject (2 flat queries: nodes + curricula-with-
                                  topics for the subject, assembled + rolled-up in memory)
    domain-map.repo.test.ts    — NEW
    domain-map.controller.ts   — NEW: handleGetDomainMap
    domain-placement.orchestrator.ts — NEW: resolveDomainPlacement() — explicit / normalized-match /
                                  agent, subject-gating, try/catch fallback (SCENARIOS 3-6)
    domain-placement.orchestrator.test.ts — NEW (mocked agent — SCENARIOS 5, 6)
  mastra/
    sibling-discovery.agent.ts — NEW: createSiblingDiscoveryAgent()
    mastra.ts                  — AGENT_KEYS gains `siblingDiscovery`; getMastra() registers it
                                  alongside the existing 15 entries (none edited)
  curriculum/
    curriculum.controller.ts   — handleCreateCurriculum calls resolveDomainPlacement() before
                                  createCurriculum(); handleUpdateCurriculum already exists, passes
                                  domainNodeId through unchanged (existing generic update path)
    curriculum.repo.ts         — createCurriculum/updateCurriculum accept + persist domainNodeId
  router.ts                    — GET /subjects/:id/domain-map
  server.ts                    — switch case for the new route name
  scripts/
    seed-domain-nodes.ts       — NEW, mirrors seed-subjects.ts, idempotent static seed for
                                  "Programming / Web Development" (SCENARIO 1)

apps/web/src/
  domain-map/
    domain-map.api.ts          — NEW: createServerFn wrapper for GET /subjects/:id/domain-map
    domain-map-tree.tsx        — NEW: recursive tree renderer, per-node percent badge, "add course
                                  here" (reuses CreateCurriculumForm with domainNodeId prop)
    change-placement-select.tsx — NEW: dropdown of the subject's existing node names, PATCHes
                                  curricula via the existing update-curriculum API client function
  curriculum/
    create-curriculum-form.tsx — CreateCurriculumForm gains optional domainNodeId prop, passed
                                  through to createCurriculum's data (existing component, additive
                                  prop only)
  routes/
    subject.$subjectId.map.tsx — NEW route, loader-seeded (SSR-first — not Electric-dependent; the
                                  batch-practice-electric-fallback item earlier in this queue exists
                                  specifically because an Electric-only read path hung in production,
                                  and this view has no live-multi-client requirement to justify
                                  reintroducing that risk)

verification-repo/projects/post-anki/post-anki/
  features/domain-map/ (new feature folder — see playwright.md)
  mock-openrouter/responses.ts — new `sibling-discovery` responder
```

### Files NOT touched (confirm explicitly)

- `apps/api/src/db/schema.ts`'s `tags`/`tagAssignments` tables — zero changes.
- `apps/api/scripts/seed-subjects.ts` — untouched; the 8 existing subjects are not renamed, merged,
  or restructured by this plan.
- No existing agent file, no existing `AGENT_KEYS` entry edited — additive only (16th agent).
- `apps/web/src/practice/**` — untouched; this plan is entirely `architecture-mentor`-side (the
  domain map concept applies to any subject kind in principle, but the one seeded subject and every
  scenario in this plan is `architecture-mentor`-kind; `language-practice` subjects are unaffected).
- No infrastructure/cloud resource files — application-level Drizzle migration only.

### Documentation changes

`architecture.md` is written (new self-referential data shape + new agent + new orchestrator layer —
meets this project's own trigger list for when an architecture doc is mandatory). No existing doc
under `docs/architecture/` covers domain hierarchy or knowledge-map placement, so a short Mermaid
diagram of the new architecture will be published to `docs/architecture/seed-knowledge-map.md` during
implementation, per the mandatory rule for any plan that writes `architecture.md`.

### Scope boundary

Out of scope for this plan (each is a separate, already-queued item in `wishlist.md`):
- Re-parenting, splitting, or merging existing `domain_nodes` (issue #56, next in the queue).
- Periodic ecosystem/doc-changelog scanning that adjusts percentages from new external releases
  (issue #49).
- Per-domain target-expertise-vs-current-percentage priority review (issue #52).
- Job-market/community trend scanning (issue #53).
- A new "attach sources to an existing curriculum" feature — `mergeSourcesIntoCurriculum` already
  exists and is unaffected by this plan; placement is the only missing half of the wishlist's
  broader "attach context to an existing branch" framing.
- Seeding a starter hierarchy for any subject other than "Programming / Web Development" — the issue's
  own "Done when" names one domain ("programming"); the other 7 subjects get no tree in this plan (see
  "Subject gating" above — this is also why their curriculum creation is provably unaffected).
- Regression coverage for the existing (unaffected) curriculum-creation flow on non-gated subjects —
  proven by the existing full e2e suite continuing to pass at review time, not a new scenario here.

### Implementation order

1. `packages/shared/src/domain-map.ts` (new schemas) + `curriculum.ts` additions.
2. `packages/core/src/domain-map/domain-map-progress.ts` + tests (SCENARIO 2, pure, no DB needed).
3. `apps/api/src/db/schema.ts` — `domainNodes` table + `curricula.domainNodeId`; `npm run
   db:generate:api` then `npm run db:migrate:api` against local dev.
4. `apps/api/src/domain-map/domain-map.repo.ts` + tests.
5. `apps/api/scripts/seed-domain-nodes.ts` — run against local dev (SCENARIO 1).
6. `apps/api/src/mastra/sibling-discovery.agent.ts` + `mastra.ts` additive registration.
7. `apps/api/src/domain-map/domain-placement.orchestrator.ts` + tests (SCENARIOS 3-6, mocked agent).
8. `apps/api/src/curriculum/curriculum.controller.ts` + `curriculum.repo.ts` — wire placement into
   creation; `updateCurriculumInput`/repo — accept `domainNodeId`.
9. `apps/api/src/domain-map/domain-map.controller.ts` + `router.ts` + `server.ts` — new GET route.
10. `apps/web/src/domain-map/domain-map.api.ts`, `domain-map-tree.tsx`, `change-placement-select.tsx`.
11. `apps/web/src/curriculum/create-curriculum-form.tsx` — additive `domainNodeId` prop.
12. `apps/web/src/routes/subject.$subjectId.map.tsx`.
13. `verification-repo/.../mock-openrouter/responses.ts` — new `sibling-discovery` responder.
14. `verification-repo/.../features/domain-map/` — actions + fixtures (see `playwright.md`).
15. Publish `docs/architecture/seed-knowledge-map.md`.
16. `/write-playwright-tests` authors SCENARIOS 3, 4, 5, 7, 8, 9's red e2e tests against the plan
    above (SCENARIOS 1, 2, 6 are vitest-only — no e2e box).

### Definition of Done — per layer

**Backend**
- `npm run db:generate:api && npm run db:migrate:api` completes with no errors against a clean local
  schema and produces migration `0021_*` adding `domain_nodes` (`id`, `subject_id`, `parent_id`,
  `name`, `description`, `order`, `created_at`) and `curricula.domain_node_id` (nullable, no default).
- **SCENARIO 1 proof:** `npx vitest run apps/api/scripts/seed-domain-nodes.integration.test.ts` (or
  equivalent) — running `seed-domain-nodes.ts` against a migrated e2e Postgres instance inserts a
  real starter hierarchy under "Programming / Web Development" (asserted via `SELECT count(*) FROM
  domain_nodes WHERE subject_id = $1` returning the expected node count, and at least one row with a
  non-null `parent_id` proving real nesting, not a flat list); running it a **second time**
  immediately after produces the exact same row count (no duplicates) — a real idempotency proof, not
  an assumption.
- **SCENARIO 2 proof:** `npx vitest run packages/core/src/domain-map/domain-map-progress.test.ts` —
  covers: a node whose subtree contains one curriculum with mixed-maturity topics returns the correct
  average; a node with zero topics anywhere in its subtree returns exactly `0`; a deep node (3+
  levels) correctly aggregates topics from multiple descendant curricula at different depths, each
  topic weighted equally regardless of which branch it's under; the function's result does not change
  between two calls with identical input taken at different wall-clock times (no time input exists to
  vary — asserted by calling it twice and diffing).
- **SCENARIO 6 proof:** `npx vitest run apps/api/src/domain-map/domain-placement.orchestrator.test.ts`
  — a mocked `sibling-discovery` agent call that rejects (network error) results in
  `resolveDomainPlacement()` returning `{ domainNodeId: null }`, and the curriculum-creation flow that
  calls it completes successfully (`200`, curriculum row inserted with `domain_node_id: null`) rather
  than propagating the error — proven by asserting the HTTP response status and a real `SELECT` on the
  inserted row, not just that no exception was thrown.
- `GET /subjects/:id/domain-map` for the seeded "Programming / Web Development" subject returns a
  tree whose every node (including ones with no attached curriculum) carries a `percent` field, and a
  known-untouched leaf's `percent` is exactly `0` — proven by `@seed-knowledge-map.S7`.
- `npx tsc --noEmit` clean across `apps/api`, `packages/core`, and `packages/shared`.

**Frontend**
- Navigating to `/subject/:subjectId/map` for the seeded subject renders the tree with every node
  visible (including untouched leaves) and each node's percent badge showing a number, `0` for
  untouched nodes — proven by `@seed-knowledge-map.S7`.
- Clicking "add course here" on an existing node, submitting a curriculum name, and confirming the
  new curriculum appears attached under that exact node (no agent call fires) — proven by
  `@seed-knowledge-map.S3`.
- Typing a curriculum name that exactly matches an existing node's name (case/whitespace-insensitive)
  attaches directly with no agent call and no new node created — proven by `@seed-knowledge-map.S4`.
- Typing an unmatched new topic name triggers exactly one agent call, results in a new node (plus up
  to 8 sibling nodes) appearing in the tree, the curriculum attached to the new node, and a visible
  "change placement" affordance on the curriculum — proven by `@seed-knowledge-map.S5`.
- A node with real seeded topic-maturity data renders a non-zero percent that matches the value the
  `domainNodeProgress` deriver would compute for the same input, and that percent visibly rolls up to
  the node's ancestor too — proven by `@seed-knowledge-map.S8`.
- Using "change placement" on an existing curriculum re-points it to a different existing node; the
  tree reflects the new attachment on reload, and the node the curriculum was moved away from no
  longer lists it — proven by `@seed-knowledge-map.S9`.
- `npx tsc --noEmit` clean across `apps/web`.

**Infrastructure** — N/A. No new cloud resources, IaC, or deploy-pipeline changes. The schema change
is an application-level Drizzle migration only, proven above under Backend — same wording precedent
as `phrase-bank-concurrency-fix/spec.md` and `check-my-writing-mode/spec.md`.

**E2E (run against the merged `main` checkout, per this project's documented `SOURCE_REPO` pinning in
`verification-repo/playwright.post-anki.config.ts` — a worktree-local pass alone is not proof):**
- `@seed-knowledge-map.S3` — explicit placement via the tree UI's "add course here".
- `@seed-knowledge-map.S4` — free-text name that exactly matches an existing node attaches silently,
  zero agent calls.
- `@seed-knowledge-map.S5` — free-text name with no match triggers the sibling-discovery agent exactly
  once; proposed node + siblings created; curriculum attached; "change placement" affordance visible.
- `@seed-knowledge-map.S7` — an unstudied node with no attached curricula renders at exactly 0%.
- `@seed-knowledge-map.S8` — a node with real studied progress renders its correct non-zero percent,
  which also rolls up visibly to its ancestor.
- `@seed-knowledge-map.S9` — changing a curriculum's placement re-points it to a different node.

(SCENARIOS 1, 2, 6 are backend/vitest-only — see their proofs above under Backend, not repeated here.)

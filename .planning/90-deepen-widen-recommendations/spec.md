---
type: spec
branch: 90-deepen-widen-recommendations
task: "Recommendation engine for adjacent knowledge — deepen or widen, accept/reject (#90)"
state: planned
updated: 2026-08-14
---

# Plan: A structural deepen/widen recommender over the static taxonomy (#90)

## What this story is, in one paragraph

Post-anki only teaches what a learner has already added to a curriculum — nothing proactively
points at what to learn next. This adds a recommender that walks the now-built static taxonomy
(`apps/api/scripts/seed-data/it-taxonomy.yaml`, 208 nodes / 15 domains) together with the
mastery-overlay rollup (`domainNodeProgress()`,
`packages/core/src/domain-map/domain-map-progress.ts`) and produces two kinds of suggestion:
**deepen** (a taxonomy child of a node the learner has already mastered) and **widen** (a
top-level sibling domain with zero coverage while another is actively being studied). Each
suggestion is a row the learner reviews and accepts or rejects — no third state. Accept creates a
new curriculum via the existing research-topic intake path, mapped to the target node in the same
write. Reject is permanent — the same node is never suggested again.

The issue's own body (`gh issue view 90`) names the mechanism precisely: "a taxonomy neighbor of a
well-mastered node = deepen candidate; a sibling domain with 0% coverage = widen candidate." That
is a deterministic, structural rule — not a judgment call requiring an LLM — and this plan treats
it as one (see Decision 1).

## Why this is buildable now (context carried from PM triage)

Quoting the PM Triage Pick comment on #90 (2026-08-14): the mastery-overlay-on-static-taxonomy
model this issue said it depended on ("wishlist #85/#86… since 'well-mastered' vs '0% coverage'
needs the mastery-overlay-on-static-taxonomy model those items are building") is no longer being
built — it is built, verified in local `main` (64 commits ahead of `origin/main`, unpushed):
`domainNodeProgress()`, the mind-map view, and the 208-node taxonomy seed all exist. A repo-wide
grep for `deepen`, `widen`, `recommend*` in that same triage comment confirmed no code implements
this specific feature under any name — `recommend-destination.ts`
(`packages/core/src/learning-list/recommend-destination.ts`) is learning-list intake routing,
`recommendation.ts` (`packages/core/src/curriculum/recommendation.ts`) is weakest-topic-first
question ranking, and `domain-priority-review.orchestrator.ts` is a different "target depth"
suggestion flow. This is genuinely new surface, applying two established patterns
(AI/structural-suggests-human-reviews rows; existing-intake course creation) to data that only
just became real.

## Precedents this plan reuses, not reinvents

### 1. The suggestion-row + accept/reject review pattern

Two existing tables share this shape; this plan's `domain_recommendations` table is a third:

- `domain_priority_suggestions` (`apps/api/src/db/schema.ts:186-209`) — `status` defaults
  `"pending"`, resolves to `"accepted"` or `"rejected"` via a **claim-first** transaction
  (`resolvePrioritySuggestion`, `apps/api/src/domain-map/domain-map.repo.ts:561-601`): `UPDATE …
  WHERE id = ? AND status = 'pending'`, so a double-click or a second tab gets `already_resolved`
  (409) instead of silently re-applying. Never deleted — rejected rows are a permanent audit
  trail.
- `curriculum_domain_node_mappings` (`apps/api/src/db/schema.ts:144-180`) — same claim-first
  shape (`resolveMapping`, `apps/api/src/curriculum-domain-mapping/
  curriculum-domain-mapping.repo.ts:216-249`), but with `status` vocabulary `suggested` →
  `confirmed`/`rejected`, and its own comment explains why: this table's "not yet resolved" value
  is literally `'suggested'`, not `'pending'` — copying the wrong literal from
  `domain_priority_suggestions` would make every accept/reject here a permanent no-op. This plan
  reuses `domain_priority_suggestions`' own `pending`/`accepted`/`rejected` vocabulary (the issue
  names that table specifically as the pattern to reuse), so this footgun does not apply, but
  Decision 5 states the invariant explicitly anyway.

The web review UI is `PriorityReviewPanel` (`apps/web/src/domain-map/priority-review-panel.tsx`) —
per-item Accept/Reject buttons, a `useResolvingSuggestions()` claim/release hook
(`apps/web/src/domain-map/use-resolving-suggestions.ts`) that guards a double-click reaching the
backend twice, and an inline confirmation message on accept. This plan's UI is a new panel
following the identical shape, reusing `useResolvingSuggestions` directly rather than duplicating
it.

### 2. Suppression semantics — this table is the odd one out, on purpose

`curriculum_domain_node_mappings` deliberately lets a **rejected** `(curriculumId, domainNodeId)`
pair be re-suggested later — its partial unique index explicitly excludes `status = 'rejected'`
(`apps/api/src/db/schema.ts:174-178`: "Rejected rows are excluded: re-suggesting a node whose
mapping was rejected is legitimate, and must not be blocked by an old tombstone").

Issue #90's own "Done when" clause requires the **opposite**: "reject never resurfaces the same
node." No existing table in this codebase enforces permanent per-node suppression across every
status — this plan's `domain_recommendations_subject_node_unique` index is a genuine, non-partial
unique index (Decision 2) precisely because the requirement is inverted from its nearest
precedent, not because the precedent was overlooked.

### 3. Accept's course-creation mechanism — the existing research-topic intake

`handleCreateCurriculum` (`apps/api/src/curriculum/curriculum.controller.ts:69-236`) already
supports creating a curriculum from **just a topic name**, no URL, no pasted text: when
`researchTopic` is set and `sources` is empty, `createCurriculum` is called, the row is returned
`202`, and `researchCurriculum(curriculum.id, { name: researchTopic })` is dispatched
asynchronously (`:233-236`) — the same auto-research pipeline #97's plan documents in detail
(source discovery → approval → structure drafting). `createCurriculumInput`
(`packages/shared/src/curriculum.ts:60-74`) accepts `domainNodeId` directly alongside
`researchTopic`, and `createCurriculum` (`apps/api/src/curriculum/curriculum.repo.ts:173-234`)
writes the resulting curriculum **and** an already-`confirmed` `curriculum_domain_node_mappings`
row in the same subject-locked transaction when `domainNodeId` is present (`:218-231`, its own
comment: "placement no longer writes `curricula.domain_node_id`… a resolved placement instead
lands as one already-`confirmed` mapping row, in the same subject-locked transaction… 'one
write'"). Accepting a #90 recommendation reuses this exact call shape — one `createCurriculum`
call, no separate mapping step (Decision 3).

`approveMiniCourseRecommendation` / `approveExtendRecommendation`
(`apps/api/src/learning-list/learning-list-approval.orchestrator.ts:86-185`) are the two existing
"accept" branches for a different suggestion type (learning-list captures): create a new mini
course, or extend an existing one by merging sources into it. #90's accept is closer to the first
branch than the second — see Decision 3 for why "extend" does not apply here even though the issue
text says "creates/extends."

### 4. The taxonomy-scoping decisions from #84 — resolved, not blocking

Issue #84 ("Decouple curricula from domain node creation") is `needs:decision` and Decision #2 on
that issue ("which subject receives this taxonomy in PRODUCTION") is still open. This plan does
**not** depend on that answer:

- `domain_nodes.subject_id` is `NOT NULL` (`apps/api/src/db/schema.ts:93`) — decision #1 on #84
  ("scoped per subject, not one global tree") is already resolved in code, not just recommended.
- `seed-domain-taxonomy.ts` takes `subjectId` as a CLI argument specifically so seeding is never
  blocked on knowing the production subject id (its own comment, `apps/api/scripts/
  seed-domain-taxonomy.ts:26-30`: "this script stays parameterized by subject id via a CLI
  argument specifically so it isn't blocked on that decision landing before code ships").
- This plan follows the identical pattern: every function here takes `subjectId` as a parameter
  and never hardcodes which subject is "the" IT taxonomy. The one thing this plan *does* need to
  know is whether a **given** subject is taxonomy-backed at all, which is already a first-class,
  queryable fact — `DomainNodeTreeItem.source` (`packages/shared/src/domain-map.ts:66-72`), whose
  own comment says it exists so callers can tell "whether a subject is taxonomy-backed… without a
  second request." See Decision 6 for the gate this becomes.

**#86 (visual knowledge map) is not a dependency of this issue at all.** It is a rendering-only
epic for the mind-map view; #90's review surface is a dedicated route following
`priority-review-panel.tsx`'s own pattern, exactly as #84's decision-pass comment describes for
the sibling `domain-priority-review` feature. Nothing here reads or writes anything #86 owns.

**Conclusion: no open #84/#86 decision blocks this plan.** Flagging this explicitly per the task
brief's own instruction, rather than silently assuming it.

## The design

### Data model (described here; no migration is generated by this plan)

One new table, `domain_recommendations`, following the shape of `domain_priority_suggestions`
with the deliberate suppression difference from §"Precedents" #2:

| column | type | notes |
|---|---|---|
| `id` | text, PK | `newId("domainrec")` |
| `subject_id` | text, not null | scoping key, matches every sibling table |
| `domain_node_id` | text, not null | the recommended/target node |
| `source_node_id` | text, not null | the node the recommendation was derived from (the mastered node for deepen; the actively-studied sibling for widen) — carried for the reason text and for any future distance metric, never re-derived at read time |
| `axis` | text, not null | `"deepen"` \| `"widen"`, app-level validated (matches this schema's dominant convention of plain text + zod validation, not a pg enum) |
| `reason` | text, not null | deterministic, generated at insert time (Decision 1 — no LLM call) |
| `source` | text, not null, default `"structural"` | the producer discriminator seam every sibling suggestion table carries, for a future non-structural producer to plug into without a schema change |
| `status` | text, not null, default `"pending"` | `"pending"` \| `"accepted"` \| `"rejected"` |
| `created_at` | timestamp, not null, default now | |
| `resolved_at` | timestamp, nullable | |
| `created_curriculum_id` | text, nullable | set on accept only, mirrors `domain_topic_suggestions.created_domain_node_id`'s own "set on accept" pattern (`apps/api/src/db/schema.ts:253-255`) |

Indexes:

- `domain_recommendations_subject_node_unique` — **true unique** index on `(subject_id,
  domain_node_id)`, no partial `WHERE` clause. This is the mechanism for "reject never resurfaces
  the same node": once any row exists for a node, in any status, no second row can ever be
  inserted for it. Deliberately stronger than `curriculum_domain_node_mappings`' partial-unique
  (Decision 2).
- `domain_recommendations_subject_status_created_idx` on `(subject_id, status, created_at desc)`
  — the review page's list query, same shape as `domain_priority_suggestions_subject_created_at_idx`
  (`apps/api/src/db/schema.ts:204-207`).

### Pure logic — `packages/core/src/domain-map/domain-recommendation.ts`

New file alongside this package's other domain-map pure derivers (`domain-priority.ts`,
`domain-mastery-status.ts`, `domain-map-progress.ts`) — no I/O, unit-tested with vitest, consuming
`DomainNodeTreeItem[]` (the exact shape `getDomainMapForSubject()` already returns, `percent` and
`curricula` precomputed on every node).

- `WELL_MASTERED_THRESHOLD = 80` — exported constant (Decision 4).
- `MAX_RECOMMENDATIONS_PER_AXIS = 5` — exported constant, one per axis so neither axis can crowd
  out the other in the capped result (Decision 7; mirrors `domain-priority-review.orchestrator
  .ts`'s own `MAX_SUGGESTIONS = 5`, applied per-axis instead of globally for the reason given
  there).
- `computeDeepenCandidates(tree: DomainNodeTreeItem[]): DomainRecommendationCandidate[]` — walks
  every node; for each node `parent` where `parent.percent >= WELL_MASTERED_THRESHOLD`, for each
  direct child `child` of `parent` where `domainMasteryStatus(child.percent) === "gap"` **and**
  `child.curricula.length === 0`, emits `{ domainNodeId: child.id, sourceNodeId: parent.id, axis:
  "deepen", reason }`. Skips any node with `kind === "area"` on either side (Decision 8). Sorted
  by descending `parent.percent`, capped at `MAX_RECOMMENDATIONS_PER_AXIS`.
- `computeWidenCandidates(tree: DomainNodeTreeItem[]): DomainRecommendationCandidate[]` — operates
  over the **root-level** nodes only (`parentId === null`, i.e. the 15 domains themselves —
  Decision 9). If at least one root has `curricula.length > 0` (an "active" domain), every other
  root where `domainMasteryStatus(root.percent) === "gap"` **and** `root.curricula.length === 0`
  emits `{ domainNodeId: candidateRoot.id, sourceNodeId: activeRoot.id, axis: "widen", reason }`,
  paired with the single most-covered active root (highest `percent`) as `sourceNodeId`. Sorted by
  tree order (stable, deterministic), capped at `MAX_RECOMMENDATIONS_PER_AXIS`.
- `buildDeepenReason(parent, child)` / `buildWidenReason(activeRoot, candidateRoot)` — pure string
  builders, e.g. `` `You've mastered "${parent.name}" (${parent.percent}%) — "${child.name}" is
  the next step within it.` `` and `` `"${activeRoot.name}" is actively being studied while
  "${candidateRoot.name}", a sibling knowledge domain, hasn't been started yet.` ``. Every
  placeholder is a real name/percent pulled from the tree, never a free-text model output — this
  is what makes Done-when's "grounded in real taxonomy structure (not free-associated)" a provable
  property of the function, not a hope about model behavior.

### Orchestrator — `apps/api/src/domain-recommendation/domain-recommendation.orchestrator.ts`

New top-level entity folder, following `curriculum-domain-mapping/`'s own precedent of living
outside both `domain-map/` and `curriculum/` despite touching both.

- `triggerDomainRecommendations(subjectId)`:
  1. `getDomainMapForSubject(subjectId)` (unmodified, reused).
  2. If the tree is empty, return `{ error: "no_domain_nodes" }` — same gating precedent as the
     doc-scan trigger (`apps/api/src/domain-map/domain-map.controller.ts`, "Requires the subject
     to already have `domain_nodes` rows").
  3. If no node in the tree has `source === "static_taxonomy"`, return `{ error:
     "not_taxonomy_backed" }` (Decision 6) — the deepen/widen structural rules assume the
     curated, 15-domain shape; an ad hoc `ai_generated` tree has no such structure to reason over.
  4. Compute deepen + widen candidates (pure functions above), concatenate.
  5. Insert each candidate whose `(subjectId, domainNodeId)` has no existing row (existence-check
     select before insert, same idiom as `insertSuggestedMappings`,
     `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.repo.ts:41-56` — the unique
     index is the hard backstop, this is the no-op-avoidance fast path).
  6. Returns the inserted rows.
- `resolveDomainRecommendation(id, status: "accepted" | "rejected")`:
  1. Claim-first: `UPDATE domain_recommendations SET status = ?, resolved_at = now() WHERE id = ?
     AND status = 'pending'`, inside a transaction — identical shape to `resolvePrioritySuggestion`
     and `resolveMapping`. Returns `{ error: "not_found" }` or `{ error: "already_resolved" }` on
     a lost claim.
  2. On `"rejected"`, done — the row is already resolved, no side effect.
  3. On `"accepted"`, load the target node (for `name`) and call `createCurriculum({ subjectId,
     name: node.name, sources: [], researchTopic: node.name, domainNodeId: node.id,
     domainNodeSource: "manual" })` — the exact call shape from §"Precedents" #3. On success,
     `UPDATE domain_recommendations SET created_curriculum_id = ?`, and the resolved row (carrying
     `createdCurriculumId`) is what the caller returns — the web panel's "link to the new course"
     is built from that field, never a second lookup. `createCurriculum`'s own
     `researchCurriculum(...)` dispatch is fire-and-forget (matches `handleCreateCurriculum`'s own
     posture at `curriculum.controller.ts:233-236`) — the resolved recommendation row does not
     wait for research to finish, matching every other "accept creates a course" flow in this
     codebase.
  4. If `createCurriculum` returns `{ error: "subject_not_found" }` (the subject was deleted
     between the recommendation being generated and accepted — the same race
     `approveMiniCourseRecommendation` guards against), **release the claim back to `"pending"`**
     rather than leaving the row stuck `"accepted"` with a null `createdCurriculumId`. Mirrors
     `approveMiniCourseRecommendation`'s own `releaseRecommendationClaim` call on the identical
     failure (`apps/api/src/learning-list/learning-list-approval.orchestrator.ts:97-101`) —
     `releaseRecommendationClaim(id)` sets `status` back to `"pending"` and clears `resolvedAt`.
     Chosen over leaving the row accepted-with-null specifically because that precedent already
     exists in this codebase for this exact failure shape (Decision 12).

### Repo — `apps/api/src/domain-recommendation/domain-recommendation.repo.ts`

`insertRecommendation`, `listRecommendationsForSubject(subjectId, status?)`,
`getRecommendation(id)`, `resolveRecommendationClaim(id, status)` (the claim-first transaction
step only — the orchestrator owns the accept side effect, same split as
`domain-priority-review.orchestrator.ts` vs. `domain-map.repo.ts`), and
`releaseRecommendationClaim(id)` (sets `status` back to `"pending"`, clears `resolvedAt` — used
only by the orchestrator's post-claim failure path, step 4 above).

### Controller + routes

Mirrors `domain-priority-review`'s exact route shape (`apps/api/src/router-table.ts:269-291`):

- `POST /subjects/:id/domain-recommendations` — trigger.
- `GET /subjects/:id/domain-recommendations?status=pending` — list.
- `PATCH /domain-recommendations/:id` — resolve, body `{ status: "accepted" | "rejected" }`.

### Web

- `apps/web/src/domain-recommendation/recommendation-panel.tsx` — new component, same shape as
  `PriorityReviewPanel`: per-item Accept/Reject buttons, an axis badge ("Deepen" / "Widen"), the
  reason text, and on accept a confirmation ("Course created: <name>") linking to the new
  curriculum. Reuses `useResolvingSuggestions()` directly (`apps/web/src/domain-map/
  use-resolving-suggestions.ts`) — no new claim/release logic.
- `apps/web/src/domain-recommendation/domain-recommendation.api.ts` — three server functions
  wrapping the routes above, following `domain-map.api.ts`'s existing shape.
- `apps/web/src/routes/subject.$subjectId.recommendations.tsx` — new route, SSR-loader-seeded
  (subject + tree + pending recommendations), same posture as `subject.$subjectId.priority-review
  .tsx` (Electric sync is not needed here either — no live-multi-client requirement).

### Shared types — `packages/shared/src/domain-recommendation.ts`

`domainRecommendationAxisSchema`, `domainRecommendationStatusSchema`,
`domainRecommendationSchema`, `resolveDomainRecommendationInput`,
`triggerDomainRecommendationsResultSchema` — same zod-schema-plus-inferred-type shape as
`domain-map.ts`'s own `domainPrioritySuggestionSchema` family. Exported via
`packages/shared/src/index.ts` (`export * from "./domain-recommendation"`, alongside the existing
`export * from "./domain-map"`).

## Decisions made autonomously

1. **No LLM call anywhere in this feature.** The issue's own body already fully specifies the
   deepen/widen rule structurally ("a taxonomy neighbor of a well-mastered node… a sibling domain
   with 0% coverage"). Every sibling suggestion-row precedent (`domain_priority_suggestions`,
   `domain_topic_suggestions`) calls an agent because its judgment ("what should the target depth
   be," "does this doc imply a new topic") is genuinely unstructured text reasoning. This feature's
   judgment is a threshold comparison over numbers Postgres already has. Adding an agent call would
   add latency, cost, and a non-deterministic test surface for zero benefit — a direct violation of
   this project's cost-awareness principle for no offsetting gain. Reversible: a `source` column
   value other than `"structural"` is the seam for a future model-based producer, exactly like
   `domain_topic_suggestions.source` already is for doc-scan vs. job-market-scan.
2. **`domain_recommendations_subject_node_unique` is a true (non-partial) unique index, diverging
   from `curriculum_domain_node_mappings`' partial-unique-excluding-rejected pattern.** That
   divergence is required, not accidental: #90's Done-when explicitly demands permanent
   suppression ("reject never resurfaces the same node"), the opposite of
   `curriculum_domain_node_mappings`' explicit design goal (re-suggestable after rejection). The
   suppression key is `(subjectId, domainNodeId)` alone, not `(subjectId, domainNodeId, axis)` — a
   node rejected as a deepen candidate is also suppressed as a widen candidate later. Plain
   reading of the issue text ("the same node," not "the same node on the same axis") supports
   this, and it is the more conservative reading (never re-annoys the learner about a node they've
   already said no to, regardless of framing). Reversible: widening the unique key to include
   `axis` is a one-column index change if this reading is wrong.
3. **Accept always creates a new curriculum via `researchTopic`; it never merges into an existing
   one, despite the issue's "creates/extends a course" wording.** Checked both existing
   non-URL-content mechanisms this codebase has and neither fits a taxonomy-node target:
   `mergeSourcesIntoCurriculum` (the "extend" branch of `approveExtendRecommendation`) requires
   real source drafts (URLs or pasted text) — a domain node has neither, only a name and
   description. `submitStructureTurn`'s `researchGapLabels` chat flow (the only other
   non-URL-content research trigger in the codebase, `apps/api/src/curriculum/
   curriculum-structure.ts:378-469`) is gated to `curriculum.status === "shaping_structure"`
   only (`curriculum.controller.ts:333-341`) — a curriculum whose taxonomy node is already
   well-mastered is by definition long past that status, sitting at `ready`. No mechanism in this
   codebase can inject a bare topic name into an already-`ready` curriculum's structure. Uniform
   creation via the `researchTopic` intake path (§"Precedents" #3) is therefore the only path that
   exists today for both axes, and it is a real, working, tested pipeline. Reversible/extendable:
   if a future story adds a "research this into my existing course" affordance to a `ready`
   curriculum, deepen's accept branch can switch to it without touching widen or the suggestion
   schema.
4. **`WELL_MASTERED_THRESHOLD = 80` (flat percent), not relative to the node's `targetDepth`.**
   `targetDepth` is nullable with no default (`domain_nodes.target_depth`,
   `apps/api/src/db/schema.ts:99-102`) and is unset across effectively the whole 208-node seeded
   taxonomy (`domain-priority-review.orchestrator.ts`'s own prompt renders it as `"unset"` for any
   node without one). A `targetDepth`-relative threshold (`domainPriorityDistance`) would be
   `null`, and therefore never trigger, for almost every node this feature needs to reason about.
   A flat percent is the only definition that produces real candidates against real, current data.
   Reversible: a one-line change to prefer `domainPriorityDistance() === 0` when `targetDepth` is
   set, falling back to the flat threshold otherwise.
5. **Explicit invariant: this table's "unresolved" value is `'pending'`, matching
   `domain_priority_suggestions`, not `'suggested'`.** Logged directly in response to the red-team
   finding recorded on `curriculum_domain_node_mappings` (§"Precedents" #1) — the claim-first
   `WHERE status = 'pending'` clause is asserted by its own scenario (Scenarios doc, criterion for
   claim-first resolve) rather than assumed correct by analogy.
6. **The trigger requires the subject to be taxonomy-backed** (`DomainNodeTreeItem.source ===
   "static_taxonomy"` on at least one node), returning `not_taxonomy_backed` otherwise. The
   deepen/widen rules assume the curated 15-domain shape from `it-taxonomy.yaml`; an
   `ai_generated` tree (every subject without a seeded taxonomy — Business, Investing, Music,
   languages, per #84's decision #5) has no equivalent "domain" structure to widen across, and
   applying the algorithm there would produce suggestions that look structural but aren't
   meaningfully grounded. Reversible: this is a single guard clause, easy to relax if a future
   story wants a looser rule for non-taxonomy subjects.
7. **`MAX_RECOMMENDATIONS_PER_AXIS = 5`, applied independently per axis rather than one combined
   cap of 5.** A combined cap risks one axis (e.g. a very "spread thin" account producing many
   deepen candidates) crowding out the other entirely, which would make the Done-when criterion
   "produces at least one deepen suggestion and one widen suggestion" fragile against real,
   lopsided account data. Independent per-axis caps make that guarantee robust as long as any
   genuine candidate of each kind exists.
8. **Nodes with `kind === "area"` are excluded from both candidate computations, on either side.**
   `domain_nodes.kind` (`apps/api/src/db/schema.ts:118-126`) marks the fixed Areas
   learning-list-intake grafts under specific sub-subjects (its own comment: "the column that
   makes 'AI may never create an Area' enforceable"). Areas are a different, purpose-built
   structure layered on top of the taxonomy, not part of the 208-node/15-domain hierarchy the
   issue describes. Treating an Area as a deepen/widen candidate would recommend curricula that
   don't fit that container's own intake mechanism. Reversible: dropping this filter is a one-line
   change if Areas turn out to need their own recommendations later.
9. **Widen candidates are scoped to root-level nodes only (`parentId === null`) — the literal 15
   "domains."** `it-taxonomy.yaml`'s own top-level key is `domains:`, and the issue's PM-triage
   framing repeatedly says "208-node/15-domain taxonomy." Reading "sibling domain" as "root-level
   sibling" is the most literal match to that vocabulary, and keeps deepen (descend within a
   branch) and widen (branch into an unrelated top-level area) as two clearly distinct, non-
   overlapping notions of "adjacent" — a mid-tree sibling pair (e.g. Firewalls vs. VPN, both under
   Network Security) is arguably neither: too close to be "widen," not a strict descendant so not
   "deepen." Reversible: broadening `computeWidenCandidates` to operate at every tree level is a
   parametrization of the same function, not a rewrite.
10. **`GET`/`PATCH` responses on `domain_recommendations` always carry `createdCurriculumId`.**
    The web panel's post-accept "link to the new course" (Scenario 6) needs it directly from the
    resolve response — no second request to look it up. Costs nothing (the column already exists
    for the audit trail per the data-model table) and avoids a second round trip on the one action
    where the learner is actively waiting for confirmation.
11. **`source_node_id` is stored, not re-derived at read time.** Both `insertPrioritySuggestion`-
    style tables and this one persist the evidence a suggestion was built from, so a suggestion
    remains explicable even if the tree changes state before it's reviewed (e.g. the "source" node
    drops below the mastery threshold between generation and review). Matches this codebase's
    general audit-trail posture (every suggestion table keeps its row forever, resolved or not).
12. **A post-claim `createCurriculum` failure releases the claim back to `"pending"` instead of
    leaving the row stuck `"accepted"` with a null `createdCurriculumId`.** Direct precedent:
    `approveMiniCourseRecommendation` calls `releaseRecommendationClaim` on the identical
    `subject_not_found` failure shape (`apps/api/src/learning-list/
    learning-list-approval.orchestrator.ts:97-101`). The alternative (leave it accepted-with-null)
    has no precedent anywhere in this codebase and creates exactly the class of silently-stuck row
    this plan's own §"Precedents" section calls out as a hazard to avoid.

## Architecture

### Business logic changes

- Learners with a taxonomy-backed subject and any real study progress can see concrete "go
  deeper" and "branch out" suggestions grounded in their own mastery data, instead of only ever
  studying what they've manually added.
- Accepting a suggestion starts a real, researched curriculum on that exact topic — the same
  pipeline behind "create a curriculum by topic name" today, so the learner sees the identical
  drafting experience they already know from manual course creation.
- Rejecting a suggestion is final for that node: it will never be re-suggested, on either axis,
  even after further mastery changes elsewhere in the tree.

### Architectural changes

- One new entity, `domain_recommendations`, and one new top-level module,
  `apps/api/src/domain-recommendation/` (mirroring `curriculum-domain-mapping/`'s precedent of
  living outside the two entities it bridges), sitting downstream of `domain-map` (reads) and
  upstream of `curriculum` (writes, via the existing `createCurriculum` intake).
- No changes to `domain_nodes`, `curriculum_domain_node_mappings`, or `domainNodeProgress()` — this
  feature is a pure consumer of the existing mastery-overlay read path.
- New pure-derivation module in `packages/core/src/domain-map/`, consistent with every other
  domain-map deriver already living there.

## Quality gates

- `npx tsc --noEmit` clean across `apps/api`, `apps/web`, `packages/core`, `packages/shared`.
- Project lint clean; report pre-existing errors rather than fixing them here.
- `npx vitest run` green, in particular the new
  `packages/core/src/domain-map/domain-recommendation.test.ts` (pure candidate computation against
  realistic tree fixtures) and the new orchestrator/repo tests asserting claim-first resolution
  and permanent suppression.
- A real-taxonomy integration test (using the actual `it-taxonomy.yaml` fixture already used by
  `seed-domain-taxonomy.integration.test.ts`, seeded with a realistic partial-mastery scenario)
  produces at least one deepen and at least one widen suggestion — this is the direct proof of the
  issue's own Done-when clause, not just a synthetic unit-test fixture.

## Explicitly out of scope

- Any LLM-based reasoning for candidate selection or reason text (Decision 1).
- A three-state (accept/later/dismiss) model — the issue explicitly constrains this to
  accept/reject, unlike wishlist #77's model.
- Extending an already-`ready` curriculum in place on accept (Decision 3) — every accept creates a
  new curriculum.
- Any change to `domain_nodes`, `curriculum_domain_node_mappings`, or the mind-map rendering
  (#86) — this plan only reads the tree `getDomainMapForSubject()` already assembles.
- Recommendations for non-taxonomy-backed subjects (Decision 6).
- Nested-level (non-root) widen candidates (Decision 9) and Area-node candidates (Decision 8).
- Wishlist #77 (external me-agent vault sourcing) — a genuinely separate, still-blocked feature per
  the issue body's own framing.
- Generating the `domain_recommendations` migration file — described here, not produced by this
  plan.

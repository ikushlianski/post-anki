---
type: spec
branch: domain-priority-review
task: Per-domain expertise priority, with a monthly re-prioritization review (issue #52)
complexity: complex
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/domain-priority-review/playwright.md
  stateFixtures: .planning/domain-priority-review/state-fixtures.md
---

# Spec: Per-domain expertise priority, with a monthly re-prioritization review

### What to do

Add a **target depth** to `domain_nodes` (item 5's knowledge-map hierarchy), independent of the
node's real rollup percentage (`domainNodeProgress`, unchanged). Display the gap between them —
called **priority distance** in this plan, never "gap" (see Decisions #3) — next to the existing
percent badge. Add a **manual** "trigger a review" action that calls one cheap Mastra agent to
propose target-depth changes for a subject's domain tree, persisted as reviewable suggestions the
user accepts or rejects. Add a "review due" indicator based on wall-clock time since the last
triggered review.

### Data model (decided)

**`domain_nodes` gains one nullable column, no default:**

```
target_depth   text   -- depthLevelSchema ("awareness" | "working" | "deep"), nullable, no default
```

Reuses `@post-anki/shared`'s existing `depthLevelSchema` — the same enum already governing
`curricula.defaultDepth` and `topics.depth` — rather than inventing the issue's own "expert"/
"familiar" wording, which has no home anywhere in the shipped vocabulary (see Decisions #7).

**New table `domain_priority_suggestions`** — one row per suggestion a review run produces:

```
domain_priority_suggestions
  id                    text primary key
  domain_node_id        text not null        -- no .references(), matches domain_nodes' own
                                              -- convention (plain text + app-level validation)
  subject_id            text not null        -- denormalized for O(1) "list suggestions for
                                              -- subject" queries, same rationale as domain_nodes.
                                              -- subject_id in seed-knowledge-map's own schema note
  current_target_depth  text                 -- snapshot of target_depth at suggestion time
                                              -- (nullable — the node may have had none)
  suggested_target_depth text not null       -- depthLevelSchema
  reason                 text not null       -- short agent-authored justification, shown in UI
  source                 text not null default 'general-knowledge'
                                              -- THE SEAM: #49/#53 add their own values here later
                                              -- ("doc-scan", "job-market") — no schema change needed
  status                 text not null default 'pending'
                                              -- 'pending' | 'accepted' | 'rejected'
  created_at             timestamp not null default now()
  resolved_at            timestamp           -- set on accept or reject; null while pending
```

No separate "review run" table — deliberately (see Decisions #6). "Last reviewed" and "review due"
are both derived from `MAX(domain_priority_suggestions.created_at)` for the subject; a subject
with zero rows has never been reviewed and is immediately due.

### Priority-distance mechanism (decided)

New constant next to `DEPTH_RANK` in `packages/shared/src/depth.ts`:

```ts
export const DEPTH_TARGET_PERCENT: Record<DepthLevel, number> = {
  awareness: 25,
  working: 60,
  deep: 100,
};
```

This is a **new, independent mapping** — not imported from `.product/PRINCIPLES.md`'s maturity-
ceiling numbers (architect 50/100, practitioner 75/100, deep 100/100), whose labels don't match
the shipped `awareness/working/deep` enum anyway (see Decisions #4).

New pure deriver, `packages/core/src/domain-map/domain-priority.ts`:

```ts
domainPriorityDistance(targetDepth: DepthLevel | null, percent: number): number | null
```

- `targetDepth === null` → returns `null` (no target set — "no priority distance to show", not
  "0 distance", which would misleadingly read as "on track"; see Decisions #2).
- Otherwise → `Math.max(0, DEPTH_TARGET_PERCENT[targetDepth] - percent)`.

Called by the API layer alongside the existing, **unmodified** `domainNodeProgress()` when
building each `DomainNodeTreeItem` — not folded into that deriver, keeping the percentage rollup
(item 5's contract) and the priority-distance calculation (this item's contract) as two separately
testable pure functions.

Second pure deriver, same file or a sibling `domain-priority-review-due.ts`:

```ts
isDomainPriorityReviewDue(lastReviewedAt: string | null, now: Date, thresholdDays = 30): boolean
```

`lastReviewedAt === null` → `true` (never reviewed). Otherwise → `now - lastReviewedAt >=
thresholdDays`. `now` is an explicit parameter, never `Date.now()` read internally — keeps the
function pure and testable with fixed dates. This is deliberate, allowed wall-clock use (see
Decisions #5) — distinct from `domainNodeProgress`'s zero-wall-clock rule, which exists for an
unrelated reason (maturity must never passively decay; review-due bookkeeping isn't maturity).

### Review mechanism (decided)

**Trigger:** `POST /subjects/:id/domain-priority-reviews` — RESTful (the resource created is a
review; matches this project's endpoint-naming convention of nouns + HTTP verbs, not
`/trigger-review`). Only enabled for subjects that already have `domain_nodes` rows (reuses
seed-knowledge-map's subject-gating precedent — in v1 that's only "Programming / Web
Development").

**Orchestrator**, `apps/api/src/domain-map/domain-priority-review.orchestrator.ts`,
`triggerDomainPriorityReview(subjectId)`:

1. Load the subject's domain tree via the **existing, unmodified** `getDomainMapForSubject()` —
   gives node names, paths, current `target_depth`, current `percent` in one call, zero new
   queries needed for the read side.
2. Build one prompt: the whole tree (name, parent path, current target depth or "unset", current
   percent) — never a per-node fan-out call (cost discipline, see Decisions #8).
3. Call a new agent, `createDomainPriorityReviewAgent()`
   (`apps/api/src/mastra/domain-priority-review.agent.ts`, registered as
   `AGENT_KEYS.domainPriorityReview`), pattern-matched on `sibling-discovery.agent.ts`'s
   cheap-agent shape (`resolveAgentModel(env)`, same tier). Returns up to 5 suggestions, each a
   `{ nodePath: string[], suggestedTargetDepth: DepthLevel, reason: string }` — **names, not
   ids**, resolved back to a real `domainNodeId` by the orchestrator via the exact same
   case-insensitive path-walking helper `domain-placement.orchestrator.ts` already uses for
   `parentNodePath` (extracted to a small shared util,
   `apps/api/src/domain-map/domain-node-name-resolver.ts`, so both orchestrators call one
   implementation instead of two near-identical ones — see Decisions #9). A suggestion whose path
   doesn't resolve to a real node is dropped silently (never inserted), same "don't hallucinate a
   node" posture as the placement orchestrator.
4. Insert one `domain_priority_suggestions` row per resolved suggestion, `source:
   "general-knowledge"`, `status: "pending"`, `current_target_depth` snapshotted from the node's
   value at step 1.
5. Return the inserted suggestions to the caller.

**Failure handling — NOT the same silent fallback as placement (decided, see Decisions #10).**
`domain-placement.orchestrator.ts`'s agent call fails silently because it's a background side
effect of curriculum creation the user isn't watching. This review trigger is the opposite: an
explicit, foreground, user-initiated action where the user is waiting for a visible result. If the
agent call throws, the orchestrator lets the error propagate; the controller returns `502` with a
clear message; the UI shows an error state, not a silent no-op. Proven by SCENARIO 8.

**Accept/reject:** `PATCH /domain-priority-suggestions/:id`, body `{ status: "accepted" |
"rejected" }` (reuses the generic-field-update PATCH convention `curricula` already uses for
`domainNodeId`/`speed`/etc.). On `accepted`: writes `suggested_target_depth` onto the
`domain_node`'s `target_depth` in the same transaction, sets `resolved_at`. On `rejected`: sets
`resolved_at` only — the row is never deleted, so a rejected suggestion stays visible as "handled"
rather than silently vanishing (Decisions #11).

**Setting target depth directly** (no review involved): `PATCH /domain-nodes/:id`, body
`{ targetDepth: DepthLevel | null }` — new endpoint, same generic-update shape, lets the user set
or clear a node's target depth by hand at any time, independent of the review flow.

### Decisions made autonomously (no human present — see `discussion.md` for full reasoning)

1. **Scope-now over defer.** Built the target-depth model + priority-distance display + a
   manual-trigger review using one cheap general-knowledge agent call, instead of deferring this
   item until #49 (doc/changelog scan) or #53 (job-market/trend scan) exist. The wishlist's own
   ordering note says #53 is deliberately last because "no data source/API/credential has been
   chosen for job-market data, so this is likely to hit a genuine human-only blocker during
   planning" — recommending "build #49/#53 first" means recommending a prerequisite the queue's
   own author already flagged as unplannable unattended. #49 is explicitly unspecced too. Issue
   #52's own Done-when — "a monthly review surfaces at least one suggested re-prioritization for
   the user to accept or reject" — says nothing about the suggestion's provenance; a
   general-knowledge call satisfies it literally. The target-depth/priority-distance half of this
   item has zero dependency on #49/#53 and is real, shippable value regardless of their timeline.
2. **`target_depth` is nullable, no default.** A default like `"working"` would make every seeded
   node show a fake non-zero priority distance immediately, and would break the Done-when's
   "distinct from its current knowledge percentage" check — distinctness only means something if
   "unset" is a real, representable state.
3. **Never named "gap" anywhere** — schema column, shared type, API field, or UI copy. The
   existing `gaps` table already means something different: user-created "I don't know" markers
   (`.product/PRINCIPLES.md`'s "User-only gap creation" — the system never auto-logs a `gaps`
   row). Named it **priority distance** instead. It is a derived display value, computed on read,
   never written to the `gaps` table — so this feature does not touch or violate "User-only gap
   creation" at all.
4. **`DEPTH_TARGET_PERCENT` is a new constant**, not sourced from `.product/PRINCIPLES.md`'s
   maturity-ceiling numbers (architect 50/100, practitioner 75/100, deep 100/100) — those labels
   don't exist in the shipped `awareness/working/deep` enum, and importing numbers tied to
   different labels would be a silent, undocumented reinterpretation. The values chosen (25/60/100)
   are new and open to future tuning; not treated as previously-established truth.
5. **v1 does NOT wire domain-node `target_depth` into `gap.ts`'s `DEPTH_RANK` probing-ceiling
   filter, `daily-push.ts`, or `replenish.ts`.** Those three files stay governed by
   `curricula.defaultDepth` only, exactly as today. Node target depth (a domain-level aspiration)
   and curriculum `defaultDepth` (a per-curriculum probing ceiling) are related but explicitly NOT
   synced in v1 — syncing them is a real behavior change to probe/push selection that #52's
   Done-when doesn't require, and doing it here would silently triple this item's blast radius.
6. **No separate "review run" table.** "Last reviewed" / "review due" are derived from
   `MAX(domain_priority_suggestions.created_at)` for the subject rather than a dedicated
   `domain_priority_reviews` table — one fewer moving part, and every review run already leaves a
   timestamped trace via its own suggestion rows (a review that resolves zero suggestions still
   inserts the rows it evaluated, even if none end up accepted).
7. **Reused the shipped `awareness/working/deep` enum, not the issue's own "expert"/"familiar"
   wording.** The issue's mermaid diagram uses "expert" and "familiar" as illustrative labels for
   two examples, not a specified taxonomy; the codebase already has a working three-tier depth
   vocabulary (`packages/shared/src/depth.ts`, complete with `DEPTH_RANK` and `DEPTH_INTENT`
   descriptions) used identically for curricula and topics. Inventing a second, unrelated
   vocabulary for domain nodes would fragment "depth" into two incompatible meanings across the
   same codebase for no product benefit.
8. **Cost discipline: one agent call per review trigger, whole tree in one prompt, capped at 5
   suggestions.** Never a per-node fan-out call — matches this codebase's existing cost-awareness
   precedent (`sibling-discovery.agent.ts`, `docs/architecture/seed-knowledge-map.md`'s subject
   gating).
9. **Extracted node-name-path resolution into a shared util**
   (`domain-node-name-resolver.ts`) instead of duplicating
   `domain-placement.orchestrator.ts`'s `resolveParentNodePath` logic a second time in the new
   review orchestrator. Both orchestrators face the identical problem (an agent returns a node
   path as names, never ids; resolve case-insensitively, fall back to the last resolved ancestor,
   never hallucinate an id) — one implementation, two call sites. `domain-placement.orchestrator.ts`
   is refactored to import the extracted function; its own behavior and tests are unchanged (pure
   refactor, covered by its existing test suite continuing to pass).
10. **The review-trigger's agent-failure path does NOT silently fall back**, unlike
    `domain-placement.orchestrator.ts`'s placement call. Placement runs as an invisible background
    step during curriculum creation — swallowing a failure there is correct, since the user isn't
    watching for it and creation must never block on it. Triggering a review is an explicit,
    foreground action the user is actively waiting on; silently doing nothing would look like a
    bug, not graceful degradation. The orchestrator lets the error propagate; the controller
    returns `502` with a message; SCENARIO 8 proves this.
11. **Rejected suggestions are persisted (`status: "rejected"`, `resolved_at` set), never
    deleted.** Keeps a visible, honest record that a suggestion was seen and declined, rather than
    letting it silently vanish — matches this codebase's existing "no data destructively deleted
    on a review-style flow" pattern (`structure_research_candidates.approval_status` includes
    `"rejected"` for the same reason).
12. **Suggestions are visibly labeled in the UI as general-knowledge/unsourced**, not grounded in
    real docs or trend data. `.product/PRINCIPLES.md`'s "Real-source grounding" principle is
    scoped to Socratic sessions, so it doesn't strictly bind this feature — but the labeling is an
    explicit, deliberate honesty choice, and it is exactly what makes #49/#53 landing later a
    visible upgrade (their suggestions will carry a different, named `source`) instead of a
    silent, undetectable one.
13. **`apps/web`'s existing `DepthSlider` (`apps/web/src/curriculum/depth-slider.tsx`) is NOT
    reused as-is.** It's typed against a web-local `depthSchema = ['aware','working','deep']`
    (`apps/web/src/curriculum/model.ts:40`) — a different enum from `@post-anki/shared`'s
    `depthLevelSchema = ['awareness','working','deep']` the domain-map API actually returns
    (`'aware'` vs `'awareness'`). A new, small `apps/web/src/domain-map/target-depth-control.tsx`
    is built against the shared enum directly instead of adding a mapping layer over a
    differently-typed component — fewer moving parts, and it avoids quietly coupling two enums
    that already drifted apart once.
14. **Consistency-gate auto-confirmation.** All 9 gate checks passed with 0 gaps (log in
    `discussion.md`); per this run's unattended-planning authorization, `state: draft` was flipped
    to `state: confirmed` in every plan file immediately once the gate passed, with no interactive
    review step in between.

### Files to touch

```
packages/shared/src/
  depth.ts                     — add DEPTH_TARGET_PERCENT constant
  domain-map.ts                — domainNodeSchema/domainNodeTreeItemSchema gain
                                  targetDepth: depthLevelSchema.nullable(), priorityDistance:
                                  z.number().nullable(); NEW: domainPrioritySuggestionSchema,
                                  triggerDomainPriorityReviewResultSchema, updateDomainNodeInput

packages/core/src/
  domain-map/
    domain-priority.ts          — NEW: domainPriorityDistance()
    domain-priority.test.ts     — NEW
    domain-priority-review-due.ts — NEW: isDomainPriorityReviewDue()
    domain-priority-review-due.test.ts — NEW

apps/api/src/
  db/
    schema.ts                   — domainNodes gains target_depth; NEW table
                                   domain_priority_suggestions
    migrations/0022_*.sql       — NEW, generated via `npm run db:generate:api`
  domain-map/
    domain-map.repo.ts          — getDomainMapForSubject calls domainPriorityDistance() per node;
                                   NEW: updateDomainNodeTargetDepth, insertPrioritySuggestion,
                                   listPrioritySuggestionsForSubject, resolvePrioritySuggestion,
                                   getLastReviewedAt
    domain-map.repo.test.ts     — updated
    domain-map.controller.ts    — NEW: handleUpdateDomainNode, handleListPrioritySuggestions,
                                   handleResolvePrioritySuggestion
    domain-node-name-resolver.ts — NEW: extracted resolveNodePathByName(), shared by both
                                   orchestrators
    domain-node-name-resolver.test.ts — NEW
    domain-placement.orchestrator.ts — refactored to import domain-node-name-resolver.ts (pure
                                   refactor, existing tests must keep passing unchanged)
    domain-priority-review.orchestrator.ts — NEW: triggerDomainPriorityReview()
    domain-priority-review.orchestrator.test.ts — NEW (mocked agent — SCENARIOS 4, 5, 8)
  mastra/
    domain-priority-review.agent.ts — NEW: createDomainPriorityReviewAgent()
    mastra.ts                   — AGENT_KEYS gains `domainPriorityReview`, getMastra() registers
                                   it alongside the existing 16 entries (none edited)
  router.ts                     — PATCH /domain-nodes/:id, POST
                                   /subjects/:id/domain-priority-reviews, GET
                                   /subjects/:id/domain-priority-suggestions, PATCH
                                   /domain-priority-suggestions/:id
  server.ts                     — switch cases for the 4 new route names

apps/web/src/
  domain-map/
    domain-map.api.ts            — new client fns: updateDomainNodeTargetDepth,
                                   triggerDomainPriorityReview, listPrioritySuggestions,
                                   resolvePrioritySuggestion
    domain-map-tree.tsx          — each node gains a TargetDepthControl + priority-distance badge
                                   (null-safe: renders nothing when priorityDistance is null)
    target-depth-control.tsx     — NEW: small 3-state control against shared depthLevelSchema
    priority-review-panel.tsx    — NEW: pending-suggestions list, accept/reject, "review due"
                                   indicator, "trigger review" button
  routes/
    subject.$subjectId.priority-review.tsx — NEW route, loader-seeded (SSR-first, same
                                   Electric-avoidance rationale as seed-knowledge-map's map route)

verification-repo/projects/post-anki/post-anki/
  features/domain-map/ (extended, not forked — see playwright.md)
  mock-openrouter/responses.ts — new `domain-priority-review` responder
```

### Files NOT touched (confirm explicitly)

- `apps/api/src/curriculum/gap.ts`, `apps/api/src/curriculum/daily-push.ts`,
  `apps/api/src/probe-session/replenish.ts` — zero changes; probing-ceiling behavior is
  unaffected (Decisions #5).
- `apps/api/src/db/schema.ts`'s `gaps` table — zero changes (Decisions #3).
- `packages/core/src/domain-map/domain-map-progress.ts` — zero changes; `domainNodeProgress()`
  stays the single source of truth for percentage rollup, called unchanged.
- No cron, scheduler, or cloud infrastructure — the review trigger is a plain HTTP endpoint.
- `apps/web/src/curriculum/depth-slider.tsx` — zero changes; not reused (Decisions #13).

### Documentation changes

`architecture.md` is written (new agent, new orchestrator, new tables — meets this project's
trigger list for a mandatory architecture doc). `docs/architecture/seed-knowledge-map.md` already
documents the domain-map read path and is NOT modified — it stays accurate as-is, since this plan
adds new capabilities alongside it rather than changing anything it already documents. A new
`docs/architecture/domain-priority-review.md` is published during implementation with a Mermaid
diagram of the review-trigger flow.

### Scope boundary

Out of scope for this plan (each is a separate, already-queued item):
- Building #49's doc/changelog scan pipeline or #53's job-market/trend scan — only the `source`
  seam they'll plug into.
- Any real cron/scheduler/automation for the monthly cadence — v1 is manual-trigger only, with a
  wall-clock-derived "due" indicator.
- Syncing domain-node `target_depth` into `curricula.defaultDepth`, `gap.ts`'s probing ceiling,
  `daily-push.ts`, or `replenish.ts`.
- Seeding target depths for the two examples named in the issue (AWS, Next.js, Postgres) as
  default data — the user sets these by hand or accepts a suggestion; no seed script change.
- Re-parenting, splitting, or merging `domain_nodes` (issue #56).

### Implementation order

1. `packages/shared/src/depth.ts` (`DEPTH_TARGET_PERCENT`) + `packages/shared/src/domain-map.ts`
   schema additions.
2. `packages/core/src/domain-map/domain-priority.ts` + `domain-priority-review-due.ts` + tests
   (SCENARIOS 1, 2 — pure, no DB).
3. `apps/api/src/db/schema.ts` — `domain_nodes.target_depth` + `domain_priority_suggestions`
   table; `npm run db:generate:api` then `npm run db:migrate:api` against local dev.
4. `apps/api/src/domain-map/domain-node-name-resolver.ts` + test (extracted); refactor
   `domain-placement.orchestrator.ts` to use it, confirm its existing tests still pass unchanged.
5. `apps/api/src/domain-map/domain-map.repo.ts` additions + tests.
6. `apps/api/src/mastra/domain-priority-review.agent.ts` + `mastra.ts` additive registration.
7. `apps/api/src/domain-map/domain-priority-review.orchestrator.ts` + tests (SCENARIOS 4, 5, 8,
   mocked agent).
8. `apps/api/src/domain-map/domain-map.controller.ts` additions + `router.ts` + `server.ts`.
9. `apps/web/src/domain-map/domain-map.api.ts`, `target-depth-control.tsx`,
   `domain-map-tree.tsx` update, `priority-review-panel.tsx`.
10. `apps/web/src/routes/subject.$subjectId.priority-review.tsx`.
11. `verification-repo/.../mock-openrouter/responses.ts` — new `domain-priority-review`
    responder.
12. `verification-repo/.../features/domain-map/` — new actions + fixtures (see `playwright.md`).
13. Publish `docs/architecture/domain-priority-review.md`.
14. `/write-playwright-tests` authors SCENARIOS 3, 5, 6, 7, 9's red e2e tests (SCENARIOS 1, 2, 4,
    8 are vitest-only — no e2e box).

### Definition of Done — per layer

**Backend**
- `npm run db:generate:api && npm run db:migrate:api` completes with no errors against a clean
  local schema and produces migration `0022_*` adding `domain_nodes.target_depth` (nullable, no
  default) and the `domain_priority_suggestions` table (`id`, `domain_node_id`, `subject_id`,
  `current_target_depth`, `suggested_target_depth`, `reason`, `source` default
  `'general-knowledge'`, `status` default `'pending'`, `created_at`, `resolved_at`).
- **SCENARIO 1 proof:** `npx vitest run packages/core/src/domain-map/domain-priority.test.ts` —
  `domainPriorityDistance(null, 40)` returns `null`; `domainPriorityDistance("working", 40)`
  returns `20` (60 − 40); `domainPriorityDistance("awareness", 90)` returns `0` (floored, not
  negative).
- **SCENARIO 2 proof:** `npx vitest run
  packages/core/src/domain-map/domain-priority-review-due.test.ts` — `null` lastReviewedAt with any
  `now` returns `true`; a `lastReviewedAt` 29 days before `now` returns `false`; a `lastReviewedAt`
  exactly 30 days before `now` returns `true`.
- **SCENARIO 4 proof:** `npx vitest run
  apps/api/src/domain-map/domain-priority-review.orchestrator.test.ts` — a mocked
  `domain-priority-review` agent returning 2 suggestions for a tree with zero existing target
  depths results in exactly 2 new `domain_priority_suggestions` rows, each `source:
  "general-knowledge"`, `status: "pending"`, `current_target_depth: null` — proven by a real
  `SELECT`, and exactly one agent call is made (call-count assertion, not just "no error thrown").
- **SCENARIO 8 proof:** same test file — a mocked agent call that rejects (network error) causes
  `triggerDomainPriorityReview()` to throw, and the controller path returns `502` with a non-empty
  `message` field — proven by asserting the HTTP response status and body, not just that an
  exception occurred somewhere.
- `PATCH /domain-nodes/:id` with `{ targetDepth: "deep" }` persists the value and a subsequent
  `GET /subjects/:id/domain-map` reflects it on the correct node, with `priorityDistance`
  recomputed to match `domainPriorityDistance("deep", <that node's percent>)` exactly.
- `PATCH /domain-priority-suggestions/:id` with `{ status: "accepted" }` writes
  `suggested_target_depth` onto the node's `target_depth` and sets `resolved_at`; with
  `{ status: "rejected" }` sets `resolved_at` but leaves `target_depth` unchanged — both proven by
  a real `SELECT` on `domain_nodes` after the call.
- `domain-node-name-resolver.test.ts` and `domain-placement.orchestrator.test.ts` (existing) both
  pass — proves the extraction (Decisions #9) is a pure refactor with no behavior change.
- `npx tsc --noEmit` clean across `apps/api`, `packages/core`, and `packages/shared`.

**Frontend**
- Navigating to `/subject/:subjectId/map` for the seeded subject shows a target-depth control on
  every node; setting one to a value updates the priority-distance badge next to the percent
  badge without a page reload — proven by `@domain-priority-review.S3`.
- Navigating to `/subject/:subjectId/priority-review` and clicking "trigger review" shows the
  returned suggestions, each with its `reason` text and a visible "general-knowledge" / unsourced
  label — proven by `@domain-priority-review.S5`.
- Clicking "accept" on a suggestion updates its status, and navigating back to the map shows the
  node's new target depth — proven by `@domain-priority-review.S6`.
- Clicking "reject" on a suggestion updates its status to rejected and it no longer appears under
  "pending", but the node's target depth is provably unchanged — proven by
  `@domain-priority-review.S7`.
- A subject whose most recent suggestion row is older than 30 days shows a "review due" indicator
  on the priority-review screen; triggering a review clears it on reload — proven by
  `@domain-priority-review.S9`.
- `npx tsc --noEmit` clean across `apps/web`.

**Infrastructure** — N/A. No new cloud resources, IaC, or deploy-pipeline changes; no
cron/scheduler is introduced. The schema change is an application-level Drizzle migration only,
proven above under Backend — same wording precedent as `seed-knowledge-map/spec.md`.

**E2E (run against the merged `main` checkout, per this project's documented `SOURCE_REPO` pinning
in `verification-repo/playwright.post-anki.config.ts` — a worktree-local pass alone is not
proof):**
- `@domain-priority-review.S3` — setting a target depth on a node persists and updates the
  priority-distance badge live.
- `@domain-priority-review.S5` — triggering a review surfaces suggestions with reason text and an
  unsourced label, exactly one agent call.
- `@domain-priority-review.S6` — accepting a suggestion writes the node's target depth.
- `@domain-priority-review.S7` — rejecting a suggestion leaves the node's target depth unchanged
  and the suggestion is recorded as resolved, not deleted.
- `@domain-priority-review.S9` — the "review due" indicator reflects the 30-day threshold and
  clears after a fresh trigger.

(SCENARIOS 1, 2, 4, 8 are backend/vitest-only — see their proofs above under Backend, not repeated
here.)

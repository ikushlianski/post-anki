---
type: spec
branch: decide-mode
task: Add an Opinion-First Decision Training mode (/decide)
complexity: complex
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/decide-mode/playwright.md
  stateFixtures: .planning/decide-mode/state-fixtures.md
---

# Spec: Opinion-First Decision Training mode (/decide)

### What this actually is — evolving a live prototype, not building from scratch

A `/decide` page, agent, controller, and shared schema **already exist and are live** in this
codebase, shipped in the project's very first commits (2026-06-01) before the current
subjects/curricula architecture existed:

- `apps/web/src/routes/decide.tsx` — nav-linked page, decision + opinion textareas, renders
  strengths/blindSpots/questions/verdict.
- `apps/api/src/decide/decide.controller.ts` — `POST /decide`, calls the `decide` Mastra agent
  with `structuredOutput`, has a graceful `FALLBACK` object for a null structured response.
- `apps/api/src/mastra/decide.agent.ts`, registered under `AGENT_KEYS.decide` — its instructions
  **already** satisfy "must not lead with an AI question": the learner states their decision and
  opinion first, the agent responds with strengths / blindSpots / questions / verdict.
- `packages/shared/src/decide.ts` — `decideInput = { decision, opinion }`,
  `decideResultSchema = { strengths: string[], blindSpots: string[], questions: string[], verdict: string }`.

**What's missing, and the entire scope of this plan:** zero persistence (every submission is
stateless — nothing survives a reload), zero entity attachment (no `subjectId` anywhere), and zero
gap-tracking hook (`blindSpots` are bare strings with no id, nothing a user can act on). This plan
adds real persistence with a history list, a documented entity-attachment decision, and a
structured, user-actionable blind-spot shape with a clean seam for #57 — while leaving
`decide.agent.ts`'s core "opinion first" instruction sequencing untouched.

### Data model (decided)

Two new tables, both standalone — no `subjectId`, no `topicId` (see "Decisions made
autonomously" #2 for why):

```
decide_sessions
  id            text primary key
  decision      text not null
  opinion       text not null
  verdict       text not null
  strengths     jsonb  ($type<string[]>())  not null
  questions     jsonb  ($type<string[]>())  not null
  created_at    timestamp with tz, default now()

decide_blind_spots
  id                 text primary key
  decide_session_id  text not null      -- plain column, no .references(), matches this
                                          -- schema's dominant convention (grep-confirmed:
                                          -- no table FKs into another via drizzle .references())
  description        text not null
  status             text not null default 'pending'   -- 'pending' | 'accepted' | 'rejected'
  source             text not null default 'decide'    -- discriminator seam for #57, mirrors
                                                          -- domain_priority_suggestions.source
  created_at         timestamp with tz, default now()
  resolved_at        timestamp with tz, nullable
```

Real Drizzle migration (`npm run db:generate:api && npm run db:migrate:api`), not ad-hoc SQL —
same pipeline every other item in this queue uses, next number after `0022`.

**No `attempts`/`writingChecks`-style single-table shape.** A `/decide` session produces MULTIPLE
independently-actionable blind spots per submission — unlike `writingChecks`' one-row-per-submission
shape (a single score/verdict/feedback/alternatives blob), `strengths`/`questions` stay
free-text arrays with no per-item action, but `blindSpots` need individual `status` and
`resolvedAt`, which is exactly why they get their own child table (mirrors
`domain_priority_suggestions` being its own table rather than a jsonb column on `domain_nodes`,
for the identical reason: each row needs its own accept/reject lifecycle).

### Agent / schema split (decided)

`decide.agent.ts`'s instructions and `decideResultSchema` (the LLM-facing shape) are **untouched**
— the agent still returns `blindSpots: string[]`. LLMs are unreliable at producing stable,
collision-free ids; asking the model to invent them would be fragile for no benefit. Instead:

- A new orchestrator (`apps/api/src/decide/decide.orchestrator.ts`, mirroring
  `writing-check.orchestrator.ts`'s split of controller/orchestrator/repo) calls the agent, then
  inserts one `decide_sessions` row plus N `decide_blind_spots` rows (one per string in the
  agent's `blindSpots` array), assigning each blind spot its own server-generated `id` via the
  existing `newId()` helper — the same pattern `insertPrioritySuggestion` already uses for
  `domain_priority_suggestions`.
- A new API-facing type `DecideSession` (in `packages/shared/src/decide.ts`) is the persisted,
  client-visible shape: `{ id, decision, opinion, verdict, strengths, questions, blindSpots:
  DecideBlindSpot[], createdAt }` where `DecideBlindSpot = { id, description, status, resolvedAt }`.

### Route design (decided — RESTful rename from the legacy `POST /decide`)

The existing `POST /decide` route name is the one RPC-shaped outlier in this router (every other
route in `apps/api/src/router.ts` is noun-based: `/subjects`, `/gaps`, `/tags`,
`/domain-priority-suggestions`). Since this plan promotes `/decide` from a stateless one-shot call
into a first-class persisted entity, it gets renamed to match the established convention rather
than carrying the old RPC shape forward:

- `POST /decide-sessions` — submit `{ decision, opinion }`, returns the full persisted
  `DecideSession` (200 on success). **Both agent-failure branches now return 502
  `evaluator_unavailable`, unified** — a thrown agent error, and the agent returning no structured
  output, are handled identically. This is a deliberate, small behavior change from the existing
  controller (which returned a 200 `FALLBACK`-shaped body for the null-output case): the response
  is now the persisted `DecideSession` type (`blindSpots: DecideBlindSpot[]` with real ids,
  `createdAt` from the DB row), and `FALLBACK`'s shape (`blindSpots: string[]`, no `id`/`createdAt`)
  cannot satisfy that type without a real inserted row — which the "no wasted cost, no junk history
  row" rule (consistent with `check-my-writing-mode`'s S3 reasoning and this project's own cost-
  discipline principle) already rules out inserting on any failure path. Collapsing both failure
  branches to 502 is simpler than inventing a separate non-persisted response variant and loses
  nothing the frontend UX depends on — the existing page has never distinguished the two failure
  modes visually. **Neither failure path persists a row.**
- `GET /decide-sessions` — list history, newest-first, each session's blind spots nested inline
  (mirrors `getPhraseBank`'s nested-response shape, avoids an N+1 second endpoint for a page that
  always needs both together).
- `PATCH /decide-blind-spots/:id` — body `{ status: 'accepted' | 'rejected' }`, sets `resolvedAt`.
  Mirrors `resolvePrioritySuggestion`'s exact PATCH shape and semantics.

Frontend: `apps/web/src/routes/decide.tsx` keeps its URL (`/decide`, nav link untouched) — only its
data layer changes. **New file `apps/web/src/decide/decide.api.ts`** holds the REST client call
(today this lives at `apps/web/src/curriculum/api-client.ts:846-847`'s `decide()` function — a
pre-existing entity-first violation this plan does not carry forward into a second file) plus the
new `listDecideSessions()`/`resolveDecideBlindSpot()` calls; **new file
`apps/web/src/decide/decide.model.ts`** (or a `decide` section of a shared model file, matching
this app's per-entity model-file convention) holds `DecideInput`/`DecideSession`/
`DecideBlindSpot` types, replacing the `DecideInput`/`DecideResult` imports currently pulled from
`../curriculum/model`. **New file `apps/web/src/decide/decide.server-fns.ts`** (or inline in
`decide.tsx` if small enough — implementer's call, not architecturally significant) holds the
TanStack Start server functions (`submitDecide`, `listDecideSessions`, `resolveDecideBlindSpot`),
replacing `curriculum.api.ts`'s existing `decide` server function. The page adds: a history list
below the existing result card (mirrors `check-writing-history-item-N`), and each rendered blind
spot gets a "Flag as a gap to revisit" / "Dismiss" pair of buttons.

### Decisions made autonomously

No human reviewed this plan interactively. Every judgment call below had no safe, reversible
default in the codebase — each is a genuine fork with real, documented reasoning.

**1. #57 (generalized gap-tracking) dependency — ship now with a local mechanism, do not wait.**
The wishlist's "Done when" reads "any gap it finds tracked wherever the generalized gap-tracking
mechanism (#57) lands" — phrased as if #57 already exists. It doesn't; #57 is the very next item in
this queue. Unlike item 7's forward-dependency on #49/#53 (data sources that plausibly don't exist
for a while), this is not purely a sequencing question — two structural facts hold regardless of
when #57 ships:
  - The **current** `gaps` table requires `topicId` (`NOT NULL`), tightly coupled to the
    topic-based Socratic curriculum model. A `/decide` session has no topic. Even a `/decide`
    session built the day after #57 ships could not write into today's `gaps` shape — #57 would
    itself need to generalize `gaps.topicId` into something optional/polymorphic, which is #57's
    own scope decision to make, not something this plan can pre-empt.
  - `.product/PRINCIPLES.md`'s "User-only gap creation" principle — confirmed in the actual code,
    not just the doc: `apps/api/src/gap/gap.controller.ts`'s `handleDeclareGap` **always** sets
    `origin: "user"`, there is no code path that writes an AI-originated row into `gaps` today.
    An AI-detected blind spot is not user-initiated the way a Fail-tap or "I don't know" is — it
    would need an explicit user accept step before it could ever become a real `gaps` row, under
    any future #57 design. That accept step is real work this plan must do regardless of #57's
    timing.
  - Item 9's own wishlist text scopes #57 to generalizing the **phrase-bank mastery state
    machine** — "gap recycled into future practice, archived after 3 non-adjacent correct
    answers" — to probe/quiz gaps specifically. It does not name `/decide` as a target surface,
    and a one-off decision blind spot has no natural "drill it until you've demonstrated it 3
    times" cycle the way a recall phrase or probe question does. It is not yet established that
    #57, once built, would even fit `/decide`'s blind spots without its own redesign work.

  **Conclusion:** build `/decide`'s own accept/reject mechanism now (`decide_blind_spots.status`),
  modeled directly on the already-shipped, already-proven `domain_priority_suggestions` pattern
  (AI proposes → sits pending → user explicitly accepts or rejects → respects "user-only gap
  creation" without needing #57 to exist). The `source: 'decide'` discriminator column is the
  seam: whatever shape #57 lands in, a migration that reads `decide_blind_spots WHERE status =
  'accepted'` and folds them into the generalized tracker is a bounded, well-defined follow-up —
  not a redesign of this plan.

**2. Entity attachment — standalone, independent of subjects. No new `subjects.kind`, no
`subjectId` column at all (not even nullable).**
  - The wishlist's "Done when" never mentions subjects. The shipped UI already has no subject
    picker.
  - Real architectural decisions ("should we move sessions from JWTs to server-side sessions" —
    the actual placeholder text already in `decide.tsx`) are inherently cross-cutting professional
    judgment calls, not tied to one curriculum's studied content — structurally unlike
    `writingChecks`, which is deliberately English-subject-specific (translation practice against
    a specific subject's pedagogy).
  - A new `subjects.kind` value would add subject-creation-flow branching (new kind option in the
    create-subject form, kind-dispatch logic in whatever reads `subjects.kind`) for zero
    identified behavioral difference — `/decide` has no generation step that would vary by subject
    or pedagogy the way `language-practice`'s agents do.
  - Not adding a speculative nullable `subjectId` "for later cross-linking" either. This
    codebase's own established pattern (`curricula.domainNodeId` — additive, nullable, no
    default) proves that column is cheap to add later, on additive migration, if a real need
    surfaces (e.g. a future "this decision touches my AWS learning" dashboard link). Adding it
    now with no consumer would be exactly the kind of speculative feature-ahead-of-proven-utility
    `.product/PRINCIPLES.md`'s "Phase-gated build" principle warns against.

**3. Gap analysis structure/scoring — qualitative, no numeric score; blind spots become
individually actionable objects, not bare strings.**
  - No score field (unlike `writingChecks.score`). The wishlist's own epic language explicitly
    frames the output as "gap analysis," not a grade — `decide.agent.ts`'s existing instructions
    already say "not a yes/no... but where their reasoning stands," which a bolted-on numeric
    score would contradict. Forcing a 0-10 number onto architectural-reasoning quality is exactly
    the rubric-grading the epic exists to move away from (see issue #10: "prevents the AI relay
    failure mode," not "produces a score").
  - `blindSpots` moves from `string[]` (ephemeral, unactionable) to a persisted child table with
    per-item `status`. This is the one piece of structure the wishlist's "structured gap analysis"
    and "any gap it finds tracked" language actually requires — `strengths` and `questions` stay
    plain text arrays since nothing in the Done-when asks them to be individually actionable.

### Route protection

No new auth surface — this project's single global gate (`apps/api/src/server.ts`'s
`authorized()`, called once before any route dispatch) already covers every new route added here,
same reasoning `check-my-writing-mode`'s spec.md already documented for its own new routes.

### Files touched (tree from repo root)

```
apps/api/src/
  db/
    schema.ts                         — add decideSessions, decideBlindSpots tables
    migrations/00XX_*.sql             — generated, adds both tables
  decide/
    decide.controller.ts              — rewritten: thin, calls orchestrator/repo
    decide.orchestrator.ts            — NEW: agent call + persistence (mirrors writing-check split)
    decide.repo.ts                    — NEW: insert/list/update, mirrors writing-check.repo.ts
  router.ts                           — rename "decide" route, add listDecideSessions +
                                         resolveDecideBlindSpot route entries
  server.ts                           — wire the two new route cases
  mastra/decide.agent.ts              — UNTOUCHED (instructions already correct)
packages/shared/src/
  decide.ts                           — add DecideSession, DecideBlindSpot,
                                         resolveDecideBlindSpotInput types/schemas;
                                         decideInput gains .trim().min(1) on both fields
apps/web/src/
  routes/decide.tsx                   — add history list, blind-spot accept/reject buttons
  decide/decide.api.ts                — NEW: REST client calls (was api-client.ts:846-847)
  decide/decide.model.ts              — NEW: DecideInput/DecideSession/DecideBlindSpot types
                                         (was imported from ../curriculum/model)
  decide/decide.server-fns.ts         — NEW: submitDecide/listDecideSessions/
                                         resolveDecideBlindSpot TanStack server functions
                                         (replaces curriculum.api.ts's decide() server fn)
  curriculum/api-client.ts            — REMOVE decide() (moved to decide/decide.api.ts),
                                         remove now-unused DecideInput/DecideResult imports
  curriculum/curriculum.api.ts        — REMOVE decide server function (moved out)
  curriculum/model.ts                 — REMOVE decideInput/decideResultSchema re-exports if
                                         present (moved to decide/decide.model.ts)
```

**Caller sweep (verified, not assumed):** grepped `apps/bot`, `apps/mobile`, `e2e/`, and
verification-repo's post-anki project for `decide` — zero real hits (verification-repo's matches
are all the unrelated English word "decide" in `resource-enrichment`'s
`decide-first-proposal.action.ts` and prose, not this feature). The only caller of the legacy
`POST /decide` anywhere in the codebase is `apps/web/src/curriculum/api-client.ts`'s `decide()`
function, moved as described above. No bot, mobile, or e2e-fixture caller exists to break.

### Definition of Done — per layer

**Backend**
- `npm run db:generate:api && npm run db:migrate:api` completes with no errors and produces a
  migration adding `decide_sessions` (`id`, `decision`, `opinion`, `verdict`, `strengths` jsonb,
  `questions` jsonb, `created_at`) and `decide_blind_spots` (`id`, `decide_session_id`,
  `description`, `status`, `source`, `created_at`, `resolved_at`).
- `POST /decide-sessions` with `{ decision: "Should we move sessions from JWTs to server-side
  sessions?", opinion: "I'd keep JWTs because..." }` returns `200` with a body shaped
  `{ id, decision, opinion, verdict, strengths, questions, blindSpots: [{id, description, status:
  "pending", resolvedAt: null}, ...], createdAt }`, and the same data is visible via a real
  `SELECT * FROM decide_sessions` / `decide_blind_spots WHERE decide_session_id = $1` afterward —
  proven by `@decide-mode.S1` (real HTTP call through the running e2e stack, real Postgres rows,
  mocked-LLM response for determinism).
- `GET /decide-sessions` returns all sessions ordered `created_at DESC`, each with its
  `blindSpots` array nested — proven by `@decide-mode.S2` (two real submissions, one real
  `page.reload()`, history order asserted against fixture content, not raw timestamps, per this
  project's documented near-simultaneous-insert collision risk under stub-mode).
- `PATCH /decide-blind-spots/:id` with `{ status: "accepted" }` sets `status = 'accepted'` and a
  non-null `resolved_at`, and the change is visible via a real `SELECT` afterward and via a
  subsequent `GET /decide-sessions` — proven by `@decide-mode.S3`.
- `POST /decide-sessions` with `{ decision: "  ", opinion: "  " }` (whitespace-only) is rejected
  by the shared `decideInput` validator (extended with `.trim().min(1)`) before the agent is ever
  called, and no `decide_sessions` row is inserted — proven by `@decide-mode.S4`.
- On an agent throw, AND on the agent returning no structured output, `POST /decide-sessions`
  returns `502 evaluator_unavailable` for both, and no row is persisted in either case — verified
  by `apps/api/src/decide/decide.orchestrator.test.ts` (unit, mocked agent, both failure branches).
- The legacy `POST /decide` route no longer resolves (`router.ts`'s `ROUTES` array has no entry
  for it) — a request to the old path returns this server's standard 404, not the old handler.
  Verified by a unit assertion against `resolveRoute("POST", "/decide")` returning `null`.
- `npx tsc --noEmit` clean across `apps/api`, `apps/web`, and `packages/shared` — this specifically
  catches the case this plan's advisor pass flagged: `apps/web/src/curriculum/api-client.ts`'s old
  `decide()` function and its `DecideInput`/`DecideResult` imports must be fully removed, not left
  as dead code importing types that no longer exist in `packages/shared/src/decide.ts`'s old shape.
- `npx vitest run apps/api/src/decide/decide.orchestrator.test.ts apps/api/src/decide/decide.repo.test.ts`
  — new unit coverage for the orchestrator (mocked agent) and repo insert/list/update functions —
  passes.

**Frontend**
- Navigating to `/decide` renders `decide-decision-input`, `decide-opinion-input`, and
  `decide-submit-button` (disabled until both fields hold non-whitespace text).
- Submitting a decision + opinion and waiting for the real `submitDecide`-matching network
  response (base64 `/_serverFn/` marker technique, same pattern `checkWriting`'s action already
  established — not a DOM poll) shows `decide-result` with `data-verdict` set, plus
  strengths/blindSpots/questions/verdict rendered, each blind spot showing
  `decide-blind-spot-flag-button-<n>` and `decide-blind-spot-dismiss-button-<n>` — proven by
  `@decide-mode.S1`.
- Reloading after two submissions shows `decide-history-item-0`/`-1` in newest-first order with no
  resubmission — proven by `@decide-mode.S2`.
- Clicking a blind spot's flag button updates that blind spot's rendered status to "flagged" (no
  full-page reload) — proven by `@decide-mode.S3`.
- Typing only whitespace into either field keeps `decide-submit-button` disabled; adding real text
  to both enables it; clearing one back to whitespace-only re-disables it (the tinker step) —
  proven by `@decide-mode.S4`.

**Infrastructure**
- N/A — no cloud resource, IaC, or deploy-pipeline change; this is an application-level Drizzle
  migration + REST route + React page change only, same class of change as `check-my-writing-mode`.

### Documentation changes

No existing `docs/architecture/*.md` covers `/decide` (it predates the `docs/architecture/`
convention entirely). Per this skill's Documentation-impact rule, since this plan does not
introduce a new async boundary, new service, or infra change (`architecture.md` is not written for
this plan — see `discussion.md`), no doc commitment is required. The evolved data model is fully
captured in this `spec.md`.

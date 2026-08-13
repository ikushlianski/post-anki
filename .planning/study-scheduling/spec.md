---
type: spec
branch: To-Learn-List
task: study scheduling — planned sessions that delegate to the existing push ranking
complexity: complex
state: draft
updated: 2026-08-08
---

# Spec: study scheduling

### Summary

A study session is a personal intent record — a target (a learning path, a domain node, a
curriculum, or "anything") and a planned duration — that the user starts on his own initiative and
runs to completion or stops early. The run loop introduces zero new ranking logic: it only narrows
the existing `PushCandidate[]` pool to the target's mapped curricula and excludes gaps already
covered this session, then hands the result to `selectDailyPush` completely unmodified — the same
"scope, don't reimplement" pattern the sibling `learning-paths` module already established for its
own step-level push. The failure mode this spec is built to avoid is a scheduler that nags: planning
a session never creates a reminder, never touches `push/`, and never adds a second proactive
channel — the product's existing single daily touchpoint (`/daily-push`) stays untouched. A missed
planned session is silently dropped, exactly like a missed daily push already is. Consistency
tracking is a narrow, read-time rollup of planned-vs-completed session counts — not a second streak,
not a queue, and explicitly not the broader retention/mastery analytics that belongs to the future
Module 4.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Session entity & scheduling | S1, S2, S6 | `study_sessions` table, repo, controller (create/start/list) | None yet | None | Single insert/read, no LLM |
| 2 — Run loop | S3, S4, S10, S11 | `scopeSessionCandidates`, target resolution, answer-counter endpoint | None yet | Phase 1 | Zero extra DB round trips beyond target resolution |
| 3 — End, review, consistency | S5, S7, S8, S9, S13 | `shouldEndSession`, `sessionElapsedMinutes`, `sessionConsistency`; complete/abandon endpoint; streak call | None yet | Phase 2 | Read-time rollup, no scheduled job |
| 4 — Web | S12 | None | Schedule form, session runner, review summary, consistency panel | Phases 1–3 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `scopeSessionCandidates` | `candidates: PushCandidate[]`, `scopedCurriculumIds: string[] \| null` (null = anything), `alreadyCoveredGapIds: string[]` | filtered `PushCandidate[]`, handed to `selectDailyPush` unmodified | S3, S10, S11, S13 |
| `shouldEndSession` | `startedAt`, `plannedDurationMinutes`, `now`, `userRequestedEnd` | boolean | S5, S13 |
| `sessionElapsedMinutes` | `startedAt`, `endedAt` (now or `completedAt`) | number | S7, S13 |
| `recordSessionAnswer` | current `{questionsAnswered, questionsCorrect}`, `correct: boolean` | next counters | S3, S9, S13 |
| `isSessionMissed` | `status`, `scheduledFor`, `now` | boolean, display-only | S6, S13 |
| `sessionConsistency` | `sessions: {status, scheduledFor, completedAt}[]`, `now`, `windowDays` | `{planned, completed, rate}` | S8, S13 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `apps/api/src/study-session/study-session.controller.ts` (`POST /study-sessions`), `study-session.repo.ts`; `packages/shared/src/study-session.ts` | `apps/web/src/study-session/schedule-form.tsx` | None |
| S2 | `study-session.controller.ts` (`PATCH /study-sessions/:id/start`), `study-session.repo.ts` | `apps/web/src/study-session/session-runner.tsx` (start action) | None |
| S3 | `packages/core/src/study-session/scope-session-candidates.ts`; `study-session.service.ts` (calls existing `push/push.repo.ts::gatherPushCandidates` + `selectDailyPush`, both unmodified) | `session-runner.tsx` (renders existing `apps/web/src/curriculum/probe-answer.tsx`) | None |
| S4 | `study-session.service.ts` (reads existing `apps/api/src/liveness/liveness.repo.ts` due-nudge logic, unmodified) | `session-runner.tsx` (renders existing `apps/web/src/learning-list/nudge-panel.tsx`) | None |
| S5 | `packages/core/src/study-session/should-end-session.ts`; `study-session.controller.ts` (`PATCH /study-sessions/:id/end`) | `session-runner.tsx` (timer + "end now") | None |
| S6 | `study-session.repo.ts` (`isSessionMissed` applied at read time, no write) | `apps/web/src/study-session/schedule-list.tsx` | None |
| S7 | `packages/core/src/study-session/session-elapsed.ts`; `study-session.controller.ts` (`GET /study-sessions/:id`) | `apps/web/src/study-session/session-review.tsx` | None |
| S8 | `packages/core/src/study-session/session-consistency.ts`; `study-session.controller.ts` (`GET /study-sessions/consistency`) | `apps/web/src/study-session/consistency-panel.tsx` | None |
| S9 | `study-session.service.ts` (calls existing `apps/api/src/streak/streak.service.ts::recordActivityToday`, unmodified) | None (existing streak display picks it up) | None |
| S10 | `study-session.service.ts` (resolves target via the `learning-paths` module's mapped-curricula read, same pattern as that module's own S8) | `schedule-form.tsx` (path picker option) | None |
| S11 | `study-session.service.ts` (`targetType: null` → the same unscoped pool `gatherPushCandidates` already produces) | `schedule-form.tsx` ("Anything" option) | None |
| S12 | None (uses existing endpoints) | `schedule-form.tsx`, `session-runner.tsx`, `session-review.tsx`, `consistency-panel.tsx`, `study-session.api-client.ts`, `study-session.model.ts`; `apps/web/src/routes/study-sessions.tsx` | None |
| S13 | `packages/core/src/study-session/*.test.ts` | None | None |

### Files to create

```
packages/core/src/study-session/       — scopeSessionCandidates, shouldEndSession, sessionElapsedMinutes, recordSessionAnswer, isSessionMissed, sessionConsistency + tests
packages/shared/src/study-session.ts   — zod schemas: session, target, create input, review summary, consistency
apps/api/src/study-session/            — study-session.controller.ts, study-session.repo.ts, study-session.service.ts
apps/web/src/study-session/            — schedule-form.tsx, schedule-list.tsx, session-runner.tsx, session-review.tsx, consistency-panel.tsx, study-session.api-client.ts, study-session.api.ts, study-session.model.ts
apps/web/src/routes/study-sessions.tsx — schedule + run + review route
```

### Files to modify

```
apps/api/src/db/schema.ts              — study_sessions table (see Data model changes); nothing existing dropped
apps/api/src/router.ts                 — /study-sessions routes (resource-named, plural)
packages/core/src/index.ts             — export ./study-session/index
packages/shared/src/index.ts           — export ./study-session
apps/web/src/router.tsx                — /study-sessions route + nav link
```

### Data model changes

- New: `study_sessions` (`id`, `targetType` text nullable [`"learning_path"|"domain_node"|"curriculum"`],
  `targetId` text nullable, `plannedDurationMinutes` integer, `scheduledFor` timestamp nullable,
  `status` text default `"planned"` [`planned|in_progress|completed|abandoned`], `startedAt`,
  `completedAt`, `questionsAnswered` integer default 0, `questionsCorrect` integer default 0,
  `createdAt`). No `.references()` FK, matching this schema's dominant convention.
- No new columns on any existing table. Session review and consistency tracking are both computed
  entirely from `study_sessions` rows at read time — no second table.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.

### Documentation changes

- Learning domain: new component doc for planned/run study sessions.
- Study-loop domain: update to note the run loop delegates to `selectDailyPush` unmodified, and that
  scheduling never adds a second reminder channel alongside `/daily-push`.

### Decisions made autonomously

- **`study_sessions` is a single table across its whole lifecycle** (planned → in_progress →
  completed/abandoned), not a separate "schedule" and "run record" — mirrors `probe_sessions`'
  own single-table-with-status-lifecycle precedent, avoids a join for the common "show me my
  session" read.
- **The run loop performs zero new ranking logic.** `scopeSessionCandidates` only filters the
  existing `PushCandidate[]` pool; `selectDailyPush` is called completely unmodified. This is the
  task's explicit design constraint, and is the same "scope, don't reimplement" pattern
  `learning-paths`' own S8 already established for its step-scoped push.
- **No reminder or notification is ever sent for a scheduled session.** Scheduling is a personal
  intent record, not a delivery obligation — creating one does not touch `push/` and adds no Cloud
  Scheduler job. This is the decision that avoids "a scheduler that nags," the failure mode the task
  names explicitly: the product's existing single daily touchpoint stays untouched, and a planned
  session is opened purely on the user's own initiative, exactly like starting a probe session
  already works today.
- **A missed planned session is never surfaced as a catch-up item.** `isSessionMissed` is a
  display-time label only, for the schedule list — it never flips a stored status, never blocks,
  never nags. This applies `.product/PRINCIPLES.md`'s "No session debt" literally: missed pushes are
  silently dropped, and a missed planned session gets the identical treatment.
- **Consistency tracking is a read-time rollup** over existing `study_sessions` rows (planned vs.
  completed count in a rolling window) — no new counter table, no streak-like mutable state, and
  deliberately narrower than the future Module 4's retention/mastery analytics: this module owns
  session-scheduling adherence only, never learning outcomes.
- **Completing a session calls the existing `recordActivityToday` unmodified** rather than
  introducing a parallel streak — `user_streaks` stays the single source of truth for "did something
  today"; a session is just one more way that gets satisfied.
- **No new per-answer table**, unlike `probe_session_questions`. A session's run loop reuses the
  SAME single-gap probe endpoints (`/topics/:id/probe`, `/topics/:id/probe/answer`) every other
  surface already calls; `study_sessions` only stores running counters, incremented as each
  existing-endpoint answer resolves. This avoids duplicating `probe-session`'s pre-generated-batch
  machinery for a use case that doesn't need it — this is a live single-gap loop, not a pre-generated
  quiz.
- **Target resolution reuses each existing owner's own repo.** A `learning_path` target reads that
  module's mapped-curricula resolution; a `domain_node` target reuses the same subtree-walk pattern
  `domainNodeProgress`/`learning-paths` already established; a `curriculum` target is a direct id. No
  new taxonomy-traversal implementation is added for this module.
- **A session's "nudge" means exactly the existing liveness due-nudge** — the same one Today shows,
  via the same `NudgePanel` — not a session-specific nudge concept. One nudge mechanism everywhere it
  appears, instead of a second one forked for scheduled sessions.

### Implementation order

1. Schema: `study_sessions`; generated migration
2. `scopeSessionCandidates`, `shouldEndSession`, `sessionElapsedMinutes`, `recordSessionAnswer`,
   `isSessionMissed`, `sessionConsistency` — derivers, unit-tested against fixtures before any IO
3. `study-session.repo.ts` (CRUD + counters)
4. `study-session.service.ts` (target resolution; delegates to existing `push.repo.ts`,
   `selectDailyPush`, `liveness.repo.ts`, `streak.service.ts`, all unmodified)
5. `study-session.controller.ts` + router wiring
6. Web: schedule form, session runner (reusing `ProbeAnswer`/`NudgePanel`), review summary,
   consistency panel

### Scope boundary

- No reminder/notification delivery for scheduled sessions — see Decisions; `/daily-push` remains
  the product's only proactive touchpoint.
- No second ranking algorithm — the run loop is a scope filter in front of the unmodified
  `selectDailyPush`.
- Learning-path targeting depends on the sibling `learning-paths` module actually shipping. Until
  then, `targetType: "learning_path"` is accepted by the schema, but the controller returns a clear
  "not available yet" error rather than a broken resolution — not blocking, since a default of
  "gracefully unavailable" is sound and reversible.
- No analytics/retention/mastery reporting beyond planned-vs-completed session counts — that is
  Module 4's territory.
- No per-answer history table for sessions — reuses the existing single-gap probe endpoints and
  their existing evaluation/gap-mastery writes, untouched.
- No mobile/Telegram surface for scheduling in v1 — web only, per the task list's own 3.4 scope.

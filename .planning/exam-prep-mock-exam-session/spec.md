---
type: spec
direction: exam-prep-from-sources
task: "Build a mock-exam session: fixed question count, timer, final score"
complexity: complex
tier: Guarded
state: planned
updated: 2026-10-03
---

# Plan: mock-exam session

## What this is

A learner starting an exam-prep review wants a one-shot, fixed-length, timed quiz with a final
score — distinct from the existing open-ended "practice" quiz (`probe_sessions`/
`probe_session_questions`, `apps/api/src/probe-session/*`), which grows indefinitely via
`maybeReplenish`, feeds gap-mastery/spaced-repetition state, and (for curriculum scope) doubles as
the calibration quiz that elects topic depth.

Blast radius: adds a schema migration and touches the gap-mastery/calibration machinery — Guarded
per `implement-factory` Step 2a.

## Facts (verified this session)

- `probe_sessions`/`probe_session_questions` (`apps/api/src/db/schema.ts:690-729`) already carry
  everything an exam's score summary needs: `total`/`correct`/`answered`/`completedAt`.
- `ProbeScope` is already `"topic"|"module"|"curriculum"|"tag"` (`packages/shared/src/probe-
  session.ts:3`) — an exam can reuse scope/scopeId as-is; a subject/tag picker (the 4th todo item)
  only needs a UI, not an API change.
- `generateProbeBatch` (`probe-session.generate.ts:454-481`) already makes exactly one model call
  per batch and decides its own `total` via `targetTotal()` — no existing path lets a caller fix
  the count.
- Reusing a plain scoped session for "exam" collides with practice sessions three ways (all in
  code read this session):
  1. `getActiveSessionRow` would hand back an in-progress practice quiz instead of starting a new
     exam; `regenerate` would delete it via `deleteSessionsForScope`.
  2. `getCalibrationCompletionForCurriculum` treats any completed curriculum-scope session as
     calibration-complete; `answerProbeSession` (`probe-session.service.ts:245-251`) would run
     `electDepthsOnCalibrationCompletion` off an exam and overwrite `topics.depth`.
  3. `maybeReplenish` only skips growth for curriculum scope (`isOneShotProbeScope`) — a tag/
     module/topic exam would grow mid-exam.
- `apps/bot/src/quiz/quiz-flow.ts` calls `getActiveProbeSession`/`prepareProbeSession` directly
  (service layer, not just the web router) — the bot never exercises exam mode, since it never
  passes the new `mode` field, so no bot change is needed as long as the service defaults to
  `"practice"` when `mode` is omitted.
- `home.repo.ts:70-77` (`countQuestionsAnswered`) and `analytics.repo.ts` (per-gap performance
  history) both query `probe_session_questions` unfiltered by session — an exam's answered
  questions land in both by default, which is desired (it's real answered-question history).

## Decision — add a `mode` column, default `'practice'`

New migration: `probe_sessions.mode text not null default 'practice'`. New shared enum
`probeSessionModeSchema = z.enum(["practice", "exam"])` in `packages/shared/src/probe-session.ts`.

Every read/write path that currently assumes "the only session for this scope" is updated to be
mode-aware:

- `getActiveSessionRow`, `getCalibrationCompletionForCurriculum`, `deleteSessionsForScope`: take an
  explicit `mode` argument, filter `eq(probeSessions.mode, mode)`. All existing callers (web router,
  bot) pass `"practice"` explicitly — no silent default inside the repo.
- `createSessionWithQuestions`: unchanged signature, callers set `mode` on the inserted row.
- `loadSession`/`ProbeSession` (shared schema): exposes `mode` so the client can tell an exam apart
  from a practice session and render the timer/final-score UI only for `"exam"`.
- `maybeReplenish`: early-returns when `session.mode === "exam"`, same guard clause as the existing
  `isOneShotProbeScope` check — an exam never grows regardless of scope.
- `answerProbeSession`'s `electDepthsOnCalibrationCompletion` guard
  (`probe-session.service.ts:245`): add `&& session.mode === "practice"` — an exam on curriculum
  scope must never elect topic depth.

## Decision — exam answers don't feed gap mastery or topic progress

An exam is a one-shot assessment, not a practice/spaced-repetition loop. `answerProbeSession`
skips `applyGapMasteryAttempt`, `refreshTopicProgress`, and `recordAnswerActivityForTopic` when
`session.mode === "exam"` — it still calls `recordAnswer` (stores the answer) and
`syncSessionCounters` (computes the running/final score), so `countQuestionsAnswered`/analytics
still see it. Judgment call, logged here per `/autonomous` rules — reasonable default since an
exam's purpose is a score, not moving a gap through its mastery stages.

## Decision — fixed question count via a capped, fixed-size menu

`generateProbeBatch` gets an optional 4th parameter, `targetCount?: number`, which — when present —
is used directly instead of calling `targetTotal()`. `prepareProbeSessionInput` gets `mode` and
`targetCount`, both optional; `prepareProbeSession` validates `targetCount` against a fixed allowed
set `[10, 20, 30]` when `mode === "exam"` (rejects anything else with a 400, the same pattern
`knowledge-source.controller.ts` already uses for its own input validation) — a free-form number
risks an unbounded single model-generation call. `targetCount` is ignored for `mode === "practice"`
(unchanged behavior).

## Decision — timer is client-only, no new column

No `durationSeconds`/`expiresAt` column. The client derives the time limit from question count via
a constant `EXAM_SECONDS_PER_QUESTION = 60` and computes remaining time from the session's existing
`createdAt` — correct across a reload, since a session can be resumed by refetching
`getActiveProbeSession`. When time runs out, the client stops accepting answers and shows the
final-score screen using `total`/`correct`/`answered`, already present. 60s/question is a judgment
call, logged here.

## Out of scope

- The subject/tag picker UI (4th todo item) — this unit's own start screen only needs a question-
  count picker against the learner's current curriculum; scope/scopeId selection is already
  API-ready for that later unit.
- Changing how a practice quiz's answers are scored or revealed — unchanged.
- Any bot/Telegram surface for exams — out of scope, the bot never passes `mode`.

## Migration

Generate via `apps/api`'s existing drizzle-kit generate step, run through the existing migrate
script per CLAUDE.md (never push directly with the ORM).

## Quality gates

1. `npx tsc --noEmit` clean for `apps/api`, `apps/web`, `packages/shared`.
2. New migration applies cleanly; existing integration tests touching `probe_sessions` still pass
   unmodified (they all implicitly exercise `mode: "practice"` once callers default to it).
3. Unit/integration coverage: an exam session never grows past its fixed count; an exam on
   curriculum scope never elects topic depth or unlocks Socratic calibration; an exam answer never
   creates/advances gap-mastery state; `getActiveSessionRow("practice", ...)` never returns an exam
   row and vice versa; `targetCount` outside `[10, 20, 30]` is rejected with a 400.
4. RED Playwright test first (user-facing): start an exam, answer all questions, see a final score
   screen; time running out ends the exam and shows the score. Written before implementation, never
   weakened/skipped afterward.
5. `/check-ui` real-browser verification before marking done (Step 5.5) — the add-knowledge unit
   earlier this run skipped this; don't repeat that gap here, since this is almost entirely a UI
   feature where a green build proves little.

---
type: architecture
direction: exam-prep-from-sources
task: "Build a mock-exam session: fixed question count, timer, final score"
updated: 2026-10-03
---

# Architecture: mock-exam session

## Why a new column instead of a parallel table

`probe_sessions`/`probe_session_questions` already model everything an exam needs structurally
(scope, fixed total, running score, completion timestamp, per-question MCQ shape). A parallel
`exam_sessions` table would duplicate that shape and force every future session-level feature
(replenish, scoring, analytics) to be written twice. A single `mode` discriminator column keeps one
schema, one set of repo functions, and pushes the practice/exam difference to the handful of call
sites that actually need to branch on it — each already identified in spec.md's "Facts" section.

## Blast radius (why this is Guarded)

Every write path below is a point where a mis-scoped query could leak an exam into practice state
or vice versa. Each one gets an explicit `mode` filter/check, not an inferred default:

```
prepareProbeSession (mode: "practice" | "exam", default "practice")
  → getActiveSessionRow(scope, scopeId, mode)      [S1]
  → deleteSessionsForScope(scope, scopeId, mode)    [S1, regenerate path]
  → generateProbeBatch(scope, ctx, allowMultiSelect, targetCount?)  [S6]
  → createSessionWithQuestions({ ..., mode })

answerProbeSession
  → recordAnswer                                     [always]
  → applyGapMasteryAttempt   — skipped when mode === "exam"   [S4]
  → refreshTopicProgress     — skipped when mode === "exam"   [S4]
  → recordAnswerActivityForTopic — skipped when mode === "exam" [S4]
  → syncSessionCounters                              [always — this is the score]
  → electDepthsOnCalibrationCompletion — guarded on mode === "practice" [S3]
  → maybeReplenish → early-return when mode === "exam"        [S2]

getCalibrationCompletionForCurriculum(curriculumId, mode: "practice" fixed)  [S3]
```

## Data flow: starting and taking an exam

1. Client calls `prepareProbeSession` with `scope`, `scopeId`, `mode: "exam"`,
   `targetCount` (one of 10/20/30).
2. Server validates `targetCount` against the fixed menu, generates one batch via
   `generateProbeBatch(scope, ctx, allowMultiSelect, targetCount)` — one model call, `total` fixed
   at `targetCount` rather than `targetTotal()`'s scope-derived value.
3. Session row inserted with `mode: "exam"`, `total: targetCount`.
4. Client renders the existing quiz component against this session, plus a timer header computed
   client-side from `createdAt` + `EXAM_SECONDS_PER_QUESTION * total`.
5. Each answer goes through the existing `answerProbeSession` endpoint; the server-side mode checks
   above keep the exam from mutating gap-mastery/topic-depth state.
6. On the last question answered, or the client timer reaching zero (client stops submitting, not
   a server-side cutoff — the server has no concept of "time's up"), the client shows a final-score
   screen from the session's own `total`/`correct`/`answered`.

## Explicitly not server-enforced

The exam's time limit is advisory/client-side only — the server will still accept an answer
submitted after the client's timer would have expired (e.g. a slow network request in flight when
time ran out). This is a deliberate scope cut: a server-enforced cutoff would need a stored
deadline and a check on every answer, which is more surface for a feature whose real purpose is
giving the learner a sense of exam pacing, not preventing cheating against themselves.

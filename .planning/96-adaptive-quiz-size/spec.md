---
type: spec
branch: 96-adaptive-quiz-size
task: "Cap topic-scope quiz size and stop early on strong mastery signal (#96)"
complexity: medium
state: planned
updated: 2026-08-14
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
---

# Plan: Adaptive quiz/probe generation count (#96)

## What this story is, in one paragraph

`packages/core/src/probe-session/quiz-size.ts`'s `scaleTopicQuizTotal` scales a topic-scope quiz's
initial batch size directly off open gap count (`Math.ceil(gapCount * 1.5)`, floor 10) with no
ceiling — a 40-gap topic generates 60 questions in one LLM call, a 130-gap topic generates 200+.
Every other scope is already bounded (`MODULE_TARGET = 16`, `CURRICULUM_QUIZ_MAX_TOTAL = 20`).
Separately, once a session is running, `maybeReplenish` (`probe-session.service.ts:265-333`) keeps
topping it up in fixed 10-question increments forever, by design (`replenish.test.ts:40-42`'s own
"still triggers once fully answered ... can keep growing" case) — with no signal anywhere that the
learner has already demonstrated mastery and stopped needing more. This plan closes both gaps:
a hard ceiling on the one-shot initial batch (Decision 1), and a cumulative-accuracy gate on the
existing replenish loop that stops it from generating further once the learner is clearly not
struggling (Decision 2) — reusing the replenish mechanism's own fixed-increment shape rather than
inventing new per-question adaptive logic.

## Verified facts (independently re-checked, not just re-quoting PM triage)

- `scaleTopicQuizTotal` (`packages/core/src/probe-session/quiz-size.ts:3-7`) really has no upper
  bound: `Math.max(floor, Math.ceil(gapCount * QUESTIONS_PER_GAP))`. Its own test file has a case
  named **"has no hardcoded ceiling — a very gap-heavy topic keeps growing"**
  (`quiz-size.test.ts:17-21`), asserting `scaleTopicQuizTotal(200, 10) > 50` — the absence of a cap
  is a *tested, named* property today, not an oversight nobody looked at.
- `targetTotal` (`probe-session.generate.ts:55-74`) confirms the asymmetry directly: module scope
  clamps to `MODULE_TARGET = 16` (line 38, via `planModuleQuizDistribution`); curriculum scope
  clamps to `CURRICULUM_QUIZ_MIN_TOTAL`/`CURRICULUM_QUIZ_MAX_TOTAL` (10/20,
  `curriculum-plan.ts:12-13`); topic scope alone calls `scaleTopicQuizTotal` with no ceiling
  argument at all.
- `maybeReplenish` (`probe-session.service.ts:265-333`) has **no upper bound of its own either** —
  it fires whenever `shouldReplenish(total, answered, REPLENISH_FLOOR=10)` is true
  (`replenish.ts:4-10`: `total - answered <= floor`), for every scope except the one-shot
  curriculum calibration probe (`isOneShotProbeScope`, `replenish.ts:19-21`). This is a second,
  distinct unbounded-growth path from the one the issue's "10 to 200+" example names directly — an
  ongoing topic/module/tag practice session can accumulate an unbounded number of questions over a
  long study session with no brake tied to whether the learner still needs them. This plan's
  Decision 2 closes this path, not just the one-shot batch.
- The web client independently mirrors `shouldReplenish` to decide whether to refetch
  (`probe-session-quiz.tsx:4,200-205`) — its own comment frames "generation not finished before the
  refetch lands" as an *accepted staleness window, not a bug*. A silently-skipped replenish is
  representationally identical to that already-accepted case from the client's point of view, which
  is why Decision 2 needs no new frontend state machine (see Decision 7).
- `runGeneration` (`probe-session.generate.ts:491-624`) rebuilds grounding and the known-URL
  citation block **from scratch on every call** — `gatherProbeGrounding`
  (`apps/api/src/probe/probe-grounding.ts:42-146`) can hit a real external web-search call
  (`webGround` → `webSearch`, line 60/146) when the curriculum has no pasted material. This is not
  cached across a session's replenish calls. Directly relevant to Decision 6's cost tradeoff below.

## The design

### Decision 1 — a hard ceiling on the topic-scope initial batch

`scaleTopicQuizTotal` gains a third parameter and clamps both ends:

```ts
// packages/core/src/probe-session/quiz-size.ts
const QUESTIONS_PER_GAP = 1.5;

export function scaleTopicQuizTotal(gapCount: number, floor: number, ceiling: number): number {
  const proportional = Math.ceil(gapCount * QUESTIONS_PER_GAP);

  // Ceiling applied BEFORE floor, deliberately: if a caller ever passes
  // ceiling < floor, Math.min(ceiling, proportional) <= ceiling < floor, and
  // the outer Math.max still recovers `floor` — the function can never
  // return below its own floor no matter how the two bounds are misused.
  return Math.max(floor, Math.min(ceiling, proportional));
}
```

`targetTotal`'s topic branch (`probe-session.generate.ts:60-62`) passes a new constant:

```ts
// Matches this file's own MODULE_TARGET (16) and curriculum-plan.ts's
// CURRICULUM_QUIZ_MAX_TOTAL (20) — the two existing "sane one-sitting quiz
// size" precedents in this package bracket 16-20. Topic scope is the
// deepest single-topic focus of the three (module spreads MODULE_TARGET
// across several topics at ~1-2 questions each; curriculum spans an entire
// course at one question per topic), so it sits at the TOP of that
// already-established range rather than introducing an unrelated fourth
// number (issue #96).
const TOPIC_QUIZ_CEILING = 20;
```

```ts
return scaleTopicQuizTotal(topicGapCount, MIN_TOTAL, TOPIC_QUIZ_CEILING);
```

No other branch of `targetTotal` changes.

### Decision 2 — an early-mastery gate on the existing replenish loop

New pure function, same file as `shouldReplenish`/`isOneShotProbeScope` since it is a peer
go/no-go gate on the identical replenish decision, not a new subsystem:

```ts
// packages/core/src/probe-session/replenish.ts

// Issue #96 — a strong CUMULATIVE accuracy signal within this session (not
// prior topic maturity, which selectQuizDifficultyMix already uses for
// difficulty mix) is what lets the ongoing-practice replenish loop above
// stop growing a session the learner has already demonstrated they don't
// need more of. MIN_SAMPLE loosely mirrors gap-mastery's own
// MASTERY_THRESHOLD (3 correct-in-a-row masters ONE gap,
// packages/core/src/mastery/mastery-state.ts:20) scaled up slightly for a
// coarser whole-session judgment spanning potentially many different gaps;
// the accuracy check allows one miss in the sample rather than demanding a
// literal perfect run. Integer comparison (cross-multiplication), not
// floating-point division, so there is no rounding edge case to test around.
export const EARLY_MASTERY_MIN_SAMPLE = 5;
const EARLY_MASTERY_ACCURACY_NUMERATOR = 4;
const EARLY_MASTERY_ACCURACY_DENOMINATOR = 5;

export function hasEarlyMasterySignal(correct: number, answered: number): boolean {
  return (
    answered >= EARLY_MASTERY_MIN_SAMPLE &&
    correct * EARLY_MASTERY_ACCURACY_DENOMINATOR >= answered * EARLY_MASTERY_ACCURACY_NUMERATOR
  );
}
```

`maybeReplenish` (`probe-session.service.ts:265-333`) gains one check, placed right after the
existing one-shot-scope guard and before the floor check — a session showing strong mastery never
even reaches `tryClaimReplenish`:

```ts
async function maybeReplenish(
  session: ProbeSessionRow,
  progress: { total: number; answered: number; correct: number },  // +correct
): Promise<void> {
  if (isOneShotProbeScope(session.scope as ProbeScope)) {
    return;
  }

  if (hasEarlyMasterySignal(progress.correct, progress.answered)) {
    return;
  }

  if (!shouldReplenish(progress.total, progress.answered, REPLENISH_FLOOR)) {
    return;
  }
  // ...unchanged from here
}
```

The call site (`answerProbeSession`, line 239) needs no change — `syncSessionCounters`'s return
value already carries `correct`; only the parameter's declared type widens to match what was
already being passed.

**Applies uniformly to topic, module, and tag scope.** `isOneShotProbeScope` is the only
scope-conditional branch in this whole gate; module and tag scope's *initial* batches were already
bounded (`MODULE_TARGET`), but their *ongoing replenish* growth was exactly as unbounded as topic
scope's — nothing in `maybeReplenish` today distinguishes them. Extending the same check to all
three costs nothing extra and closes the identical gap for all of them, not just the scope the
issue's own example used.

## Decisions made autonomously

1. **`TOPIC_QUIZ_CEILING = 20`**, bracketed by this package's own `MODULE_TARGET` (16) and
   `CURRICULUM_QUIZ_MAX_TOTAL` (20) precedents rather than an unrelated new number. Reversible: a
   one-line constant change.
2. **Ceiling-before-floor clamp ordering**, so a future caller passing `ceiling < floor` by mistake
   still gets back at least `floor` rather than a broken sub-floor value. Defensive, zero cost,
   directly testable (`scaleTopicQuizTotal(50, 10, 5)` → `10`).
3. **`EARLY_MASTERY_MIN_SAMPLE = 5`, threshold = 4-of-5 (80%), integer-safe comparison.** Five
   answers before ever evaluating (loosely above gap-mastery's own 3-correct-in-a-row single-gap
   threshold, since this is a coarser whole-session judgment); one miss tolerated rather than
   requiring a literal perfect run, since a single silly mistake shouldn't force the gate closed for
   a learner who clearly knows the material. Reversible: two constants.
4. **Cumulative session-wide accuracy, not windowed, not per-topic.** The issue is titled "early
   signal" and cumulative-since-session-start is the cheapest, most literal reading — it needs no
   new query (`correct`/`answered` are already tracked on every session row) and no new session
   state. **Disclosed limitation, not hidden:** for a long-running module/tag session that started
   weak and later goes on a strong streak (e.g. 30/60 early, then 20/20), cumulative accuracy sits
   at 62% and the gate never engages even though the last 20 answers alone would clear the
   threshold easily — the brake has inertia proportional to how much of the session already
   happened before the streak. A windowed ("last N") variant would fix this but needs the full
   answer history loaded before the gate can run, which today is only fetched *after*
   `tryClaimReplenish` succeeds (`loadSession` at `probe-session.service.ts:303`) — moving that
   query earlier costs a DB read on every single answer, for every session, to serve a scenario this
   plan judges rare relative to the cost. Logged as a named follow-up, not built here.
5. **Applies to topic, module, and tag scope uniformly** (see design section above) rather than
   topic-only, since the gate composes on the scope-agnostic replenish path, not the
   scope-conditional initial-batch path.
6. **The initial batch is NOT restructured into fixed increments; it stays one call, now bounded.**
   Considered and rejected: generating the initial batch in `REPLENISH_BATCH_SIZE`-sized chunks (the
   literal reading of the PM triage comment's "natural extension") so the mastery gate could also
   suppress *initial* generation, not just replenishment. Rejected for two concrete reasons: (a)
   module/tag scope's `buildPrompt` computes its per-topic distribution
   (`planModuleQuizDistribution(topicIds, MODULE_TARGET)`, `probe-session.generate.ts:251-254`)
   against the **hardcoded** `MODULE_TARGET`, independent of whatever `total` is actually requested
   — chunking the initial call would require decoupling that plan from a fixed target too, a second
   real design problem out of proportion to a "contained, low-risk fix"; (b) even for topic scope
   alone, where no such coupling exists, the marginal benefit shrank once Decision 1 landed — the
   worst case is now 20 questions in one call, not 200, and **the trade is genuinely two-sided, not
   a free win**: `runGeneration` rebuilds grounding and the known-URL block from scratch on every
   call, including a real external web-search call when a curriculum has no pasted material
   (`gatherProbeGrounding`, `probe-grounding.ts:42-146`) — turning one 20-question call into
   `10 + 10` (or worse, `10 + 10 + 10 + ...` for a heavily-gapped topic with a learner who keeps
   practicing without ever tripping the mastery gate) means paying that re-grounding cost multiple
   times over the course of one session instead of once. Decision 1's cap already eliminates the
   acute "200+ in one shot, most never consumed" waste the issue's own example names; Decision 2's
   gate already stops runaway *ongoing* growth once mastery is shown. Chunking the initial batch on
   top would trade a bounded, already-solved problem for a new, uncapped-by-this-plan one
   (repeated re-grounding cost for a genuinely-practicing learner). Logged as a rejected alternative
   with a named follow-up (cache grounding per session across replenish calls) rather than either
   built silently or left unconsidered.
7. **The web client (`probe-session-quiz.tsx`) mirrors the same gate to skip a wasted refetch.**
   `hasEarlyMasterySignal` is imported directly from `@post-anki/core` (the client already imports
   `shouldReplenish`/`isOneShotProbeScope` from there) — no re-declared literal constant, unlike the
   pre-existing `REPLENISH_FLOOR` mirror (`probe-session-quiz.tsx:13-17`), which has to duplicate
   because that particular constant lives server-side only in `probe-session.service.ts`. Purely an
   optimization (avoids one `invalidateQueries` round trip per answer for the remainder of a
   high-accuracy session); correctness does not depend on it — the server already degrades
   gracefully into the existing "generation not done yet" staleness window either way.
8. **No schema change, no migration.** `targetTotal`'s capped result is cheaply recomputable on
   demand (as it already is, every time `generateProbeBatch`/`maybeReplenish` runs) and the mastery
   signal reads fields (`correct`, `answered`) already persisted on `probe_sessions`
   (`schema.ts:555-567`). Nothing new needs to be stored.

## Architecture

### Business logic changes

- A topic with many open concept gaps no longer generates a single unreviewable pile of up to 200+
  questions in one LLM call — the initial batch is capped at 20, matching the size range every
  other quiz scope already respects.
- A learner who clearly already knows a topic (or module, or tag-scoped practice set) — strong,
  early, consistent accuracy — stops triggering further question generation once that signal is
  clear, instead of the session growing in fixed 10-question increments indefinitely as long as
  they keep answering. They still finish whatever is already loaded; nothing already generated is
  taken away.
- A learner who is genuinely still working through material keeps replenishing exactly as before —
  nothing changes for the struggling case.

### Architectural changes

- `packages/core/src/probe-session/quiz-size.ts` and `replenish.ts` gain one new parameter and one
  new pure predicate respectively — no new files, no new modules.
- `apps/api/src/probe-session/probe-session.service.ts`'s `maybeReplenish` gains one additional
  early-return branch, composed on top of its existing `isOneShotProbeScope` /
  `shouldReplenish` gates rather than replacing either.
- `apps/web/src/curriculum/probe-session-quiz.tsx` gains the identical check on its own
  refetch-trigger condition, sourced from the same shared package (no duplicated logic).
- No API contract change (`AnswerProbeSessionResult` etc. are unchanged — this plan reads fields
  that already exist on it), no new route, no new table, no migration.

## Quality gates

1. `npx tsc --noEmit` clean across `packages/core`, `apps/api`, `apps/web`.
2. `npx vitest run` green, in particular the rewritten `quiz-size.test.ts` and the new
   `hasEarlyMasterySignal` cases in `replenish.test.ts`.
3. `npm run test:integration -w @post-anki/api` — new paired integration test (see scenarios.md),
   needs `npm run e2e:db:up` (docker, port 5436) first.
4. Project lint (this repo has no standalone ESLint — the type-check gate above is the lint gate,
   per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s own verified finding, unchanged since).

## Explicitly out of scope

- Restructuring the initial-batch call into fixed increments for any scope (Decision 6).
- Caching `gatherProbeGrounding`'s result across a session's replenish calls (named follow-up, real
  but separate optimization).
- A windowed ("last N answers") or per-topic mastery signal instead of cumulative session-wide
  (Decision 4's disclosed limitation; named follow-up).
- Any change to `MODULE_TARGET`, `CURRICULUM_QUIZ_MIN_TOTAL`/`MAX_TOTAL`, or
  `planModuleQuizDistribution`/`planCurriculumQuizDistribution` — both already correctly bounded.
- Any change to `apps/bot/src/quiz/quiz-flow.ts` or the mobile study-loop surface — both only ever
  re-read session state after answering and never independently decide whether to replenish, so
  neither needs touching (proven by appearing in no diff).
- Any new session status, "stopped early" flag, or user-facing messaging about why a session ended
  up shorter than its scaled target. The session simply completes once its currently-loaded
  questions are answered — the exact same completion path that already exists today.

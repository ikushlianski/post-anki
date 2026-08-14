---
type: scenarios
branch: 96-adaptive-quiz-size
task: "Cap topic-scope quiz size and stop early on strong mastery signal (#96)"
state: planned
updated: 2026-08-14
---

# Scenarios: Adaptive quiz/probe generation count (#96)

**20 acceptance criteria.** This is a clamped pure function, one new predicate, one service guard,
one client condition, and their test coverage — deliberately not padded to look like a
larger-scope story (contrast `.planning/33-untriaged-gaps-auto-defer/scenarios.md`'s 42, which
reflected two new columns, a migration, and a scheduled job; nothing here needs any of that).

No Playwright plan — this is server-side generation-count logic plus one client refetch condition
with no new UI surface; the observable difference (fewer questions loaded, one fewer network call)
is not something a browser test is better positioned to prove than a vitest test asserting the
condition directly.

## Master acceptance criteria list (20 items, each independently walkable)

**`quiz-size.ts` — the cap**

1. `scaleTopicQuizTotal(gapCount, floor, ceiling)` takes a third parameter and clamps:
   `Math.max(floor, Math.min(ceiling, Math.ceil(gapCount * 1.5)))`.
2. For a `gapCount` large enough that the proportional formula would exceed the ceiling, the
   function returns exactly `ceiling` — e.g. `scaleTopicQuizTotal(40, 10, 20)` returns `20`, not
   `60`.
3. Floor behavior is unchanged: `scaleTopicQuizTotal(0, 10, 20)` and `scaleTopicQuizTotal(1, 10, 20)`
   both still return `10`.
4. Defensive clamp ordering: `scaleTopicQuizTotal(50, 10, 5)` (a caller passing `ceiling < floor`)
   still returns `10`, never a value below the floor.
5. `quiz-size.test.ts`'s existing case named *"has no hardcoded ceiling — a very gap-heavy topic
   keeps growing"* is renamed to state the new rule (e.g. *"clamps to the ceiling for a very
   gap-heavy topic"*) and its assertion inverted to prove the clamp — the underlying rule changed,
   so per this project's own testing convention the name changes with it, not just the assertion.
6. `targetTotal`'s topic branch (`probe-session.generate.ts:60-62`) passes a new
   `TOPIC_QUIZ_CEILING = 20` constant as the third argument. `targetTotal`'s `curriculum` branch and
   the module/tag fallthrough branch are unchanged — proven by both appearing in no diff.

**`replenish.ts` — the early-mastery gate**

7. `hasEarlyMasterySignal(correct, answered)` is a new exported pure function using an
   integer-safe comparison (`correct * 5 >= answered * 4`), not floating-point division.
8. Returns `false` for any `answered < 5`, regardless of accuracy — even a perfect `4/4`.
9. Returns `true` at exactly the threshold: `4` correct of `5` answered.
10. Returns `false` just under the threshold: `3` correct of `5` answered.
11. Recomputes fresh from the two counts passed in on every call — not sticky. A session at `4/5`
    (`true`) that later reaches `8/12` (`0.667`, `false`) flips back, proven by two direct calls
    with no shared state between them.
12. `shouldReplenish`'s own existing behavior is unchanged, including its
    *"still triggers once the session is fully answered ... so a session with open gaps can keep
    growing"* case (`replenish.test.ts:40-42`), which stays green unmodified — the new gate composes
    **above** `shouldReplenish`'s existing contract, it does not alter it. This is the no-regression
    proof that ongoing practice sessions still grow exactly as before whenever mastery hasn't been
    shown yet.

**Service wiring — `apps/api/src/probe-session/probe-session.service.ts`**

13. `maybeReplenish`'s `progress` parameter type gains `correct: number`; the call site
    (`answerProbeSession`, line 239) needs no change since `syncSessionCounters`'s return value
    already carries it — proven by a type-only diff at the call site.
14. `maybeReplenish` checks `hasEarlyMasterySignal(progress.correct, progress.answered)`
    immediately after the existing `isOneShotProbeScope` guard and before `shouldReplenish`. A
    session showing strong early mastery never calls `tryClaimReplenish` or
    `generateReplenishBatch` — for topic, module, and tag scope alike.
15. A session below the mastery threshold (either sample size or accuracy) replenishes exactly as
    it does today — proven by the new integration test's low-accuracy twin (AC 20), which is the
    real no-regression proof for the struggling case.
    `gap-mastery-concurrency.integration.test.ts` continues to pass unmodified, but that test
    never crosses the replenish floor at all, so it exercises neither branch of the new gate and
    proves nothing about it beyond "this story didn't break something unrelated."
16. `apps/bot/src/quiz/quiz-flow.ts` and the mobile study-loop surface are unchanged — proven by
    appearing in no diff. Both only ever re-read session state after answering and never
    independently decide whether to replenish, so neither needed touching.

**Client mirroring — `apps/web/src/curriculum/probe-session-quiz.tsx`**

17. The post-answer `invalidateQueries` condition (`probe-session-quiz.tsx:200-205`) gains
    `&& !hasEarlyMasterySignal(result.correct, result.answered)`, imported directly from
    `@post-anki/core` — no re-declared literal constant.
18. When the server declines to replenish for mastery-signal reasons, the client makes no extra
    network round trip — proven by a test asserting `invalidateQueries` is **not** called for a
    mocked answer result crossing the replenish floor at `4/5` accuracy.
19. Behavior for a session below the mastery threshold is byte-identical to today — the same mocked
    answer result at, say, `2/5` still triggers `invalidateQueries` exactly as it did before this
    change.

**Integration proof — real Postgres, paired scenario**

20. A new integration test (`apps/api/src/probe-session/probe-session-replenish.integration.test.ts`,
    mirroring `gap-mastery-concurrency.integration.test.ts`'s harness: real Postgres, mocked Mastra
    agent) seeds **two** sessions against identical scenery (same topic, same gaps, same
    floor-crossing question count) differing only in prior answered/correct counts — one at/above
    the mastery threshold, one below. Answering the floor-crossing question on the low-accuracy
    session calls the mocked `probeQuizBatch` agent; the high-accuracy twin does not. Both
    assertions live in the same file, so the negative ("not called") case has a working positive
    control proving the harness *would* have caught a missing gate, rather than passing vacuously
    because the seeded scenario never actually crossed the floor at all (the exact vacuous-pass
    hazard `gap-mastery-concurrency.integration.test.ts:17-24` calls out for itself).

---

## SCENARIO 1 — A heavily-gapped topic no longer generates an unreviewable pile of questions

**Given** a topic with 40 open, non-skipped gaps
**When** the learner starts a probe session for that topic
**Then** `generateProbeBatch` requests exactly 20 questions in its one LLM call, not 60
**And** the session's `total` is 20 the moment it's created, not something the learner discovers
only after scrolling through dozens of questions.

Covers AC 1, 2, 6.
Proof: `quiz-size.test.ts` (the pure clamp — this is the real proof). `targetTotal` itself has no
dedicated test file today and this story does not add one; AC 6's "no diff on the other branches"
claim is a code-review-time check, not an automated test.

## SCENARIO 2 — A learner acing early questions on a large topic stops triggering more generation

**Given** the same 40-gap topic, initial batch of 20 questions
**When** the learner answers the first 5 questions and gets 4 or 5 of them right, then keeps
answering past the point where `total - answered <= 10` would normally trigger a top-up
**Then** no `generateReplenishBatch` call happens — `maybeReplenish` returns before
`tryClaimReplenish` is ever called
**And** the session simply completes once the learner finishes the 20 already-loaded questions,
rather than growing toward whatever the uncapped formula would once have produced.

Covers AC 7, 8, 9, 11, 14, 20.
Proof: `replenish.test.ts` (pure predicate), `probe-session-replenish.integration.test.ts`
(end-to-end against real Postgres, mocked agent never called).

## SCENARIO 3 — A genuinely struggling learner keeps getting topped up exactly as before

**Given** a topic-scope session where the learner has answered 8 questions and gotten only 3 right
**When** the remaining unanswered count crosses the replenish floor
**Then** `maybeReplenish` proceeds exactly as it does today: claims the replenish lock, calls
`generateReplenishBatch`, appends 10 more questions
**And** this keeps happening on every subsequent floor-crossing for as long as accuracy stays below
the threshold — unchanged behavior, not a new code path.

Covers AC 10, 12, 15, 20 (the paired positive control).
Proof: `probe-session-replenish.integration.test.ts`'s low-accuracy twin;
`gap-mastery-concurrency.integration.test.ts` continuing to pass unmodified as a second,
independent confirmation nothing in the untriggered path changed.

## SCENARIO 4 — The web client doesn't waste a refetch once the server has stopped growing the session

**Given** a learner using the web probe UI, currently at 4 correct of 5 answered on a session that
just crossed the replenish floor
**When** they submit their next answer
**Then** `probe-session-quiz.tsx`'s mutation `onSuccess` handler does **not** call
`queryClient.invalidateQueries` for the probe-session query key
**And** for the same session at, say, 2 of 5 correct, it does — unchanged from today.

Covers AC 17, 18, 19.
Proof: `probe-session-quiz.test.tsx`, new cases (this exact invalidate condition currently has no
dedicated test coverage in that file — this is net-new coverage of existing-plus-new logic, not a
modification of an existing test).

## SCENARIO 5 — A long, uneven session can flip the gate either way — cumulative, not windowed (disclosed, not a bug)

**Given** a module-scope practice session that started rough (30 correct of the first 60 answered)
and has since gone on a 20-question correct streak (now 50 of 80 total, 62.5%)
**When** the learner answers question 81 and crosses the replenish floor again
**Then** `hasEarlyMasterySignal(50, 80)` is `false` (62.5% is below the 80% threshold) and the
session replenishes again, even though the last 20 answers alone would have cleared the threshold
easily
**And** this is the documented, accepted behavior of a cumulative signal (spec.md Decision 4), not
a defect — a windowed variant is a named, explicitly out-of-scope follow-up.

Covers AC 11: the signal is a cumulative running average, so a later strong streak does not trip
the gate until the average itself clears the threshold — not until the streak alone would.
Proof: `replenish.test.ts`, a case using exactly these numbers, documented as illustrating the
disclosed limitation rather than as a bug regression guard.

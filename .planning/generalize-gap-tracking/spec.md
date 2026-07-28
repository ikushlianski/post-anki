---
type: spec
branch: generalize-gap-tracking
task: "Generalize the phrase-bank mastery state machine to drive gap tracking for every subject kind (issue #57)"
complexity: complex
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker, e2e/docker-compose.yml)
  playwrightPlan: .planning/generalize-gap-tracking/playwright.md
  stateFixtures: .planning/generalize-gap-tracking/state-fixtures.md
---

# Spec: Generalized recall-gap mastery tracking (issue #57)

## What to do

Widen the phrase-bank's recall-recycling mastery state machine — new → practicing → struggling →
mastered, "recycle it, master after 3 non-adjacent corrects" — to drive gap tracking for
probe-session quiz misses on any subject, not just English phrase drills. A gap discovered or
missed via a quiz question starts (or continues) a mastery cycle instead of the current binary
open/covered flag. The gap only reads as "resolved" in the UI once genuinely demonstrated 3 times,
spaced across separate quiz-generation events — never on the first lucky guess, and never because
the system gave up on the learner (the freeform Socratic flow's give-up-covers-it behavior is
explicitly untouched and out of scope). The same normalized gap concept recurring as
struggling/open across 3+ subjects surfaces as a one-time nudge, respecting the app's
no-queue/no-guilt principles.

## Files to touch

```
packages/core/src/
  mastery/
    mastery-state.ts          [new] generic derivers extracted from phrase-bank.ts
    mastery-state.test.ts     [new]
  phrase-bank/
    phrase-bank.ts            [edit] re-exports generic pieces from mastery-state.ts; keeps
                               phrase-specific matchExistingPhraseBankEntry only
  gap-mastery/
    gap-mastery.ts            [new] gap-specific selection/matching (topic-scoped due ranking,
                               label-based match-or-create), reuses mastery-state.ts derivers
    gap-mastery.test.ts       [new]
    cross-cutting-nudge.ts    [new] pure aggregator: normalized label recurring in 3+ subjects
    cross-cutting-nudge.test.ts [new]

apps/api/src/db/
  schema.ts                   [edit] + gap_mastery table (incl. last_correct_session_id, plain
                               text value referencing probe_sessions.id, no FK — Decision 4),
                               + topics.gapMasterySequenceNumber, + probe_session_questions.gapLabel
  migrations/000X_*.sql       [new] additive migration (drizzle-kit generate, never hand-written)

apps/api/src/gap/
  gap-mastery.repo.ts         [new] due-selection reads, FOR-UPDATE write path, advisory lock
  gap.controller.ts           [edit] gap responses include mastery sub-object when tracked

apps/api/src/probe-session/
  probe-session.generate.ts   [edit] selectGaps gains a "due-ranked" mode using
                               gapMasterySequenceNumber + scheduledForSequence; persists gapLabel
                               on every generated question row
  probe-session.service.ts    [edit] answerProbeSession: on a gap-tagged (or newly-labelable)
                               question, drive the mastery machine instead of single-verdict cover;
                               advisory-lock + FOR UPDATE write path mirroring
                               grade-attempts.orchestrator.ts
  probe-session.map.ts        [edit] persist gapLabel alongside gapId on generated rows
  probe-session.repo.ts       [edit] gapLabel column plumbing

apps/api/src/domain-map/ or apps/api/src/gap/
  cross-cutting-nudge.controller.ts [new] GET endpoint: labels recurring 3+ subjects

apps/web/src/curriculum/
  topic-row.tsx                [edit] GapRow renders a mastery-tracked gap's stage (e.g. "◐ label
                                (2/3)") distinctly from a bare open/covered gap
  probe-session-quiz.tsx       [edit] renders a resolution acknowledgment ("✓ Resolved: <label>")
                                distinctly from "correct, still practicing (n/3)" — today this
                                component computes coveredGapLabels but never renders it; that gap
                                itself is part of this item's scope (folded-in #44)
  model.ts / api-client.ts     [edit] Gap type gains optional mastery sub-object
  routes/today.tsx or a small nudge banner component [edit/new] surfaces the cross-cutting nudge
                                (folded-in #30/#39), respecting "system selects, no queue"

apps/api/src/practice/
  phrase-bank.repo.ts          [edit — ONE line only] computes isAdjacent the pre-existing
                                sequence+1 way and passes it into applyAttemptToMasteryEntry's new
                                attempt shape (Decision 4). No table/migration/behavior change to
                                phrase-bank or the concurrency fix already shipped there — existing
                                tests must pass with zero assertion changes.
```

## Derivers table

| Deriver | Scenario | Location |
|---|---|---|
| `applyAttemptToMasteryEntry<T>` | S1, S3, S4, S5 | `packages/core/src/mastery/mastery-state.ts` (generalized from `applyAttemptToPhraseBankEntry`; field names de-phrased: `lastCorrectAtSentenceCount`→`lastCorrectAtSequence`, `scheduledForSentenceCount`→`scheduledForSequence`; contract change per Decision 4 — attempt now carries a caller-supplied `isAdjacent: boolean` instead of the function deriving it internally from `sequenceNumber + 1`) |
| `selectDueMasteryEntries<T>` | S3 | same file (generalized from `selectDuePhrases`). Status filter (`struggling`/`practicing` only, excludes `new`/`mastered`) is reused UNCHANGED and is naturally complete for gap_mastery: unlike `phrase_bank_entries` (pre-created at `"new"` during batch generation, before any attempt), a `gap_mastery` row is only ever created reactively at answer-time, transitioning directly into `"struggling"` or `"practicing"` — never `"new"`. So there is no gap_mastery row this filter would wrongly exclude. |
| `matchExistingGapByLabel` | S1, S2 | `packages/core/src/gap-mastery/gap-mastery.ts` (mirrors `matchExistingPhraseBankEntry`'s normalize/trim/lower match, scoped to a topic's existing gaps instead of subject/level/pack) |
| `rankDueGapsForQuiz` | S3 | same file — the generative analogue of `selectDuePhrases`, feeding `probe-session.generate.ts`'s new "due-ranked" `selectGaps` mode |
| `computeGapAttemptIsAdjacent` | S4 | same file — `(currentProbeSessionId, gapMastery.lastCorrectSessionId) => boolean`; the gap-specific "was this basically an immediate repeat" signal fed into `applyAttemptToMasteryEntry`'s `isAdjacent` input (Decision 4) |
| `detectCrossCuttingGaps` | S7 | `packages/core/src/gap-mastery/cross-cutting-nudge.ts` — pure function: `(gapsAcrossSubjects: {label, subjectId, hasMasteryTracking, trackedStatus}[]) => {label, subjectIds}[]`, threshold 3 distinct subjects, requires `hasMasteryTracking && trackedStatus in ("practicing","struggling")` (Decision 7) |

## Decisions made autonomously

This item was planned unattended — no interactive review — per the task's explicit authorization.
Every judgment call below was resolved using the safest, most reversible, most evidence-grounded
default; documented here so none of it needs relitigating.

### 1. Unify vs. narrow scope — RESOLVED: narrow

Only the phrase-bank recall-recycling mechanism generalizes. `domain_priority_suggestions` (item 7)
and `decide_blind_spots` (item 8) stay their own separate, untouched accept/reject concepts.
Reasoning, grounded in direct code reading, not the task's initial framing:

- **The initial framing that item 7 was built "as a seam for #57" is factually wrong.**
  `apps/api/src/db/schema.ts`'s own comment on `domainPrioritySuggestions.source` (near line 63-64)
  reads: `"source" is the discriminator seam #49 (doc-scan) and #53 (job-market-scan) plug their
  own producers into later"` — i.e. the seam is for domain-priority-review's OWN future suggestion
  producers, not for this issue. Correcting this here so nobody re-opens the fork believing item 7
  was purpose-built for it.
- `decideBlindSpots.source`'s comment DOES explicitly name #57 as the seam. But structurally: a
  decide-blind-spot is a one-time flag on a unique, freeform piece of reasoning about a real
  decision the learner will likely never face in that exact shape again. There is no re-askable
  question and no "correct answer" a learner can demonstrate 3 times — the concept simply doesn't
  fit a recycling schedule. Its accept/reject step (already shipped) is the right and sufficient
  mechanism for it.
- Issue #57's own "Done when" says "missed **probe/quiz question** ... 3 non-adjacent correct
  **demonstrations**" — that is recall recycling, structurally identical to phrase-bank's mechanism,
  and structurally unlike both item 7 (a suggested config change, accept/reject once, never
  practiced) and item 8 (a one-shot reasoning blind spot, never re-tested).
- A separate, already-built, binary `gaps` table (`apps/api/src/db/schema.ts` ~line 127,
  `packages/core/src/curriculum/gap.ts`, `apps/api/src/gap/`) already covers per-topic AI/user gap
  discovery, ranking-for-next-probe, and full UI surfacing (`GapChecklist`, `probe-answer.tsx`,
  `today.tsx`, `concerns.tsx`) — but has zero mastery-stage/recycle-schedule concept anywhere
  (`state` is a bare 3-value enum, flipped on ONE verdict by three independent call sites,
  including one that fires when the system gives up, not just on correctness). That gap is the
  literal thing issue #57 asks to fill, and the fill is specifically "generalize the phrase-bank
  state machine" — the issue never asks to also fold in two structurally different config-change/
  reasoning-review features.

### 2. Mastery state on `gaps` columns vs. a sidecar table — RESOLVED: sidecar table (`gap_mastery`)

An advisor review flagged the "resolved lie" risk directly: three existing call sites
(`probe.service.ts`, `socratic.service.ts` — including on `give_answer`/`move_on`, i.e. the system
giving up — and `probe-session.service.ts`'s OWN pre-existing single-verdict cover) already flip
`gaps.state` to `"covered"` on one verdict. If mastery columns lived directly on `gaps`, auditing
and gating all three writers to respect `masteryStage` would be required, and any writer missed
(now or in a future change) silently lies about resolution. A sidecar table, keyed 1:1 by `gapId`,
means:
- `gaps.state`'s meaning is completely unchanged for the two flows this item leaves untouched
  (freeform Socratic probe, `socratic.service.ts`) — they never read or write `gap_mastery`, so
  nothing about their existing behavior can regress.
- Only `probe-session.service.ts`'s `answerProbeSession` is rewritten to consult `gap_mastery` for
  gaps it touches, and it becomes the SOLE writer that can flip `gaps.state` to `"covered"` for a
  mastery-tracked gap — and only once `masteryStage` reaches 3. `gaps.state` is a downstream
  bridge value, kept in sync so existing aggregate math (`gapMaturity`, `progressFromGaps`,
  `topic-row.tsx`'s `gapsCovered/gapsTotal`, `concerns.tsx`'s rollup) keeps working with zero
  changes to those functions.
- Trade-off accepted: a gap can, in principle, still be touched independently by the freeform
  Socratic flow on the same topic (gaps are shared per-topic, not per-mechanism). This is a
  pre-existing characteristic of the `gaps` table (multiple independent writers already existed
  before this item — `probe.service.ts`, `socratic.service.ts`, and `probe-session.service.ts` all
  already wrote to the same rows with no ordering guarantee). This item does not introduce that
  race; it is out of scope to add cross-writer locking between two structurally different features
  that already coexisted this way.
- `gaps.origin` (`ai`|`user`) already exists and is NOT reused as a mastery-tracking discriminator
  — a gap having a `gap_mastery` row (or not) is itself the discriminator; no new `source` column
  needed on `gaps` (avoids the naming collision the advisor flagged).
- **Display-precedence rule (added after a second adversarial pass caught a real gap in the first
  draft):** the sidecar isolates the three pre-existing single-verdict writers from being GATED by
  mastery state, but it does not stop them from independently flipping `gaps.state` to `"covered"`
  on a gap that ALSO has a `gap_mastery` row below stage 3 (e.g. the freeform Socratic flow's
  `give_answer`/`move_on` path touching the same topic's gap). Before this item, there was no
  mastery stage to contradict, so this divergence is new, not pre-existing — it must be handled
  explicitly, not waved through under the "pre-existing shared-writer race" trade-off above. Rule:
  **for any gap that has a `gap_mastery` row, the mastery status is what the UI displays
  (in-progress/struggling/resolved); `gaps.state` is read ONLY for aggregate math
  (`gapMaturity`, `progressFromGaps`, `topic-row.tsx`'s covered/total counts) and never directly
  rendered as the gap's own status once a `gap_mastery` row exists.** This is a one-line frontend
  rule (`GapRow` checks for a `masteryStatus` field first, falls back to `state` only when absent)
  and is what makes S5's "not falsely resolved" negative assertion actually robust against the
  untouched Socratic path.

### 3. Scope line — probe-session (quiz) only, not the freeform Socratic probe

Issue #57's Done-when names "probe/quiz question" specifically. `apps/api/src/probe-session/`
(MCQ/true-false batch quiz) has a clean, discrete, unambiguous binary right/wrong per question —
structurally the closest match to a phrase-bank "attempt." `apps/api/src/probe/` (the older
freeform single-question Socratic probe, evaluated qualitatively by an LLM judgment, no fixed
options) and `socratic.service.ts` have no such binary outcome to recycle against, and their
existing single-verdict gap-covering behavior is explicitly preserved as-is. Confirmed by
`grill-me` (see `discussion.md`) — no counter-evidence surfaced that either flow needs the mastery
treatment for this item's Done-when to be satisfiable.

### 4. The single-session mastery bug — REVISED after a second adversarial pass found the first fix insufficient

**The first draft of this decision was wrong and is kept here struck through in spirit, corrected
below, because the mistake is instructive.** The original reasoning assumed
`GAP_RECYCLE_OFFSET = 10` (matching `REPLENISH_BATCH_SIZE`) forces cross-sitting spacing the way
phrase-bank's `RECYCLE_OFFSET = 3` supposedly does. Worked through with real numbers, that's false
for probe-session specifically: `maybeReplenish` fires automatically after every answer once
remaining questions drops to the `REPLENISH_FLOOR` (10), appending 10 more, indefinitely, for as
long as the learner keeps answering — a single continuous sitting can auto-chain dozens of
replenish batches with no session boundary ever crossed. Tracing it through: a gap missed at
answered-count 1 (scheduled due at 11) becomes due at the replenish around answered≈12, correct at
≈15 (stage 1, next scheduled 25), due again ≈32, correct ≈35 (stage 2), due again ≈52, correct ≈55
→ mastered. That's ~55 questions, one uninterrupted sitting, contradicting issue #57's literal
"resurfaces in a **later session**." Worse, the original S4 scenario seeded `masteryStage: 2` and
submitted one correct answer — proving only the final transition, not that spacing was ever
enforced; the DoD could go fully green with the actual Done-when never verified.

**Corrected design: gate mastery-STAGE ADVANCEMENT on session identity, not on the answered-question
counter.** Two separate mechanisms now do two separate jobs:

1. **When a struggling gap becomes eligible for selection again** (preventing it from being spammed
   back into the very next batch) — unchanged in spirit: `topics.gapMasterySequenceNumber`
   increments once per answered question; `scheduledForSequence = counterAtAttempt + 10` (still
   equal to one generation event's worth of questions). This is a real, useful anti-spam guard, but
   it is NOT what proves "later session" — that was the original design's mistake, conflating the
   two.
2. **Whether a correct answer counts as a genuine non-adjacent demonstration** — gated on
   `gap_mastery.lastCorrectSessionId` (new column, references `probe_sessions.id` by value, no FK
   per this schema's existing plain-text-id convention) instead of sequence-number arithmetic. On a
   correct answer: `isAdjacent = (currentProbeSessionId === gapMastery.lastCorrectSessionId)`. If
   `isAdjacent` (a replenish within the SAME session re-served this gap and it was answered
   correctly again), the stage does NOT advance — same treatment phrase-bank gives a same-position
   repeat, just keyed by session identity instead of stream position, since for gaps the
   spam-worthy repeat is "the same sitting re-serving it," not "the immediately next question."
   If NOT adjacent (a genuinely different `probe_sessions` row — i.e., the learner started a new
   quiz session, via `regenerate: true` producing a brand-new session row, not a replenish
   continuing the old one), the stage advances and `lastCorrectSessionId` updates to the new
   session's id. This directly and literally proves "later session," regardless of how many
   sessions apart — session 2 and session 7 both count identically as "a later session" relative to
   session 1's demonstration, which is the correct reading (the issue never asked for a MINIMUM
   number of sessions between demonstrations, only that each demonstration be a genuinely separate
   one).

**Contract change to the generalized deriver, and why it's still a legitimate generalization, not
scope creep:** `applyAttemptToPhraseBankEntry`'s `isAdjacent` was computed internally from
`attempt.sequenceNumber === entry.lastCorrectAtSentenceCount + 1` — a fine domain-specific rule for
"the very next position in a dense stream," but it does not transfer to "the very next SESSION,
however far numerically apart," which is what gaps actually need (a session-ordinal +1 check would
wrongly treat the immediately-following session as adjacent and skip it, which is backwards — a
genuinely later session, first or fifth one after, should always count). Rather than force gaps'
semantics through sequence-number arithmetic that doesn't fit, the shared deriver
`applyAttemptToMasteryEntry<T>` now accepts `isAdjacent` as a **caller-supplied boolean** on the
attempt object instead of deriving it internally from `sequenceNumber`. `sequenceNumber` itself is
kept on the attempt (still used for `scheduledForSequence` bookkeeping and phrase-bank's own
unchanged behavior). Phrase-bank's repo layer computes `isAdjacent` exactly as before (sequence
+1) and passes it in — zero behavior change, confirmed by its own unmodified test suite continuing
to pass. Gap-mastery's repo layer computes `isAdjacent` via session-identity comparison and passes
it in. The pure stage-advance/reset/mastery-threshold decision logic inside the deriver is 100%
shared and unchanged; only where "was this basically an immediate repeat" gets decided moves to the
caller, which is where the domain-specific knowledge actually lives. This is documented explicitly
because it is the one place this item's generalization work touches the ALREADY-SHIPPED phrase-bank
code path — the change is additive to the attempt input shape only, phrase-bank.repo.ts gets one
new call-site line (compute and pass `isAdjacent`), no schema/behavior change there.

`S4` in scenarios.md was rewritten to actually drive three real correct answers across three
distinct `probe_sessions` rows (via `regenerate: true` between each), not seed `masteryStage: 2`
and submit one answer — this is what makes the Done-when provable rather than assumed.

### 5. PRINCIPLES.md pre-existing contradiction — noted, not newly violated

`.product/PRINCIPLES.md`'s "Only the user creates gaps... the system never auto-logs gaps" is
already violated by the existing, pre-this-item `insertDiscoveredGaps(origin: "ai")` mechanism
(`apps/api/src/probe/probe.service.ts`'s `submitProbe`, called on every answer evaluation). This
item's S2 (auto-creating a new gap from an unmatched quiz `gapLabel` on a miss) extends that
existing, already-stale principle's violation one step further — it does not introduce a NEW kind
of violation, it applies the same `origin: "ai"` auto-log path the freeform probe flow already
uses, just from a second call site. Flagging explicitly rather than silently compounding it: if
this principle is meant to bind going forward, it needs a product-level decision to actually revert
`insertDiscoveredGaps`'s existing AI-origin path first — out of scope for this item to force.

Two neighboring principles DO bind and are respected in this design: **"No session debt"** — a due/
recycled gap is pulled automatically the next time `prepareProbeSession`/`maybeReplenish` runs
(via `rankDueGapsForQuiz`), never surfaced as a backlog count anywhere in the UI. **"System selects
— user never manages a queue"** — same mechanism; the cross-cutting nudge (S7) is a single
appear-once surfaced note, not a list the user manages. **"Silent on non-response"** — an unanswered
due gap generates no guilt/retry/nudge language if the learner never returns to that topic; it
simply stays scheduled and un-resurfaced until the next generation event chooses to include it.

### 6. Topic-maturity/stats side effect — named explicitly, accepted as intentional (found in a second adversarial pass)

Gating `gaps.state → "covered"` behind `masteryStage === 3` instead of the first correct answer
means a mastery-tracked topic's `gapMaturity`/`progressFromGaps` percentage rises later, and its
`learningStatus` (`refreshTopicProgress` in `probe-session.service.ts`) stays `"probing"` for
longer than it did before this item, since `remaining = openGaps(...)` now excludes fewer gaps
sooner. This is a real, visible, intended consequence of making "resolved" mean something
stricter — not a regression, but it DOES change what an existing e2e test
(`features/stats/tests/weak-strong-spots`) and `apps/api/src/stats/stats.repo.ts`'s reads may
observe for any topic that starts using mastery-tracked gaps. Decision: accepted as the correct
new behavior (a stricter, more honest maturity number is the point of this item), with an explicit
regression check added as part of this item's own scope (S6) confirming `weak-strong-spots`
either still passes unchanged (if it doesn't exercise a mastery-tracked topic) or is updated to
reflect the new, stricter timing (if it does) — not silently left to fail post-merge.

### 7. Cross-cutting nudge scope tightened to mastery-tracked gaps only (found in a second adversarial pass)

The first draft of `detectCrossCuttingGaps` filtered on `trackedStatus in ("open", "struggling")`
across ALL gaps globally — but a plain `"open"` gap includes ones discovered exclusively through
the untouched freeform Socratic flow, which never gets a `gap_mastery` row and was never meant to
feed this item's nudge (the task's own directive scoped the nudge to "the new recall-gap-mastery
mechanism... NOT domain-priority suggestions or decide blind-spots," and by the same reasoning,
not Socratic-only gaps either — those have no shared mastery-tracked lifecycle to be "recurring"
in). Corrected: the aggregator requires a `gap_mastery` row to exist (`hasMasteryTracking: true`)
AND its status to be `"practicing"` or `"struggling"` (a gap still being actively demonstrated, not
yet mastered) before it counts toward the 3-subject threshold.

## Definition of Done — per layer

### Backend — data model + write path

- [x] `gap_mastery` table exists with a real unique index on `gap_id` (1:1 backstop) and the
      mastery columns (`status`, `mastery_stage`, `correct_count_in_cycle`,
      `incorrect_count_in_cycle`, `last_correct_at_sequence`, `scheduled_for_sequence`,
      `last_correct_session_id` (references `probe_sessions.id` by value, plain text, no FK — see
      Decision 4), `created_at`, `updated_at`, `mastered_at`). Proven by: `drizzle-kit generate`
      migration applied to the local e2e Postgres, `\d gap_mastery` in `psql` shows the unique
      index.
- [x] `topics.gap_mastery_sequence_number` exists (integer, default 0), incremented exactly once
      per answered probe-session question for that topic — proven by a unit test on the
      increment-and-read repo function against a real local DB row.
- [x] `probe_session_questions.gap_label` persists the AI-generated label on every generated
      question, matched or not — proven by inspecting a real generated row's `gap_label` column
      after a mocked-agent generation run.
- [x] Concurrency proof, mirroring `apps/api/src/practice/phrase-bank-concurrency.integration.test.ts`
      exactly:
  - Real Postgres via `DATABASE_URL`/`E2E_DATABASE_URL`, `assertLocalDbTarget` guard, only the
    Mastra agent call mocked (`vi.mock("../mastra/mastra.js", ...)`).
  - Two concurrent `answerProbeSession` calls against the same topic/gap, submitted via
    `Promise.all` (never `allSettled`) — the test asserts BOTH resolve successfully as its OWN
    assertion, before any row is inspected.
  - After both resolve: `topics.gap_mastery_sequence_number` incremented by exactly 2 (no lost
    increment), `gap_mastery` row reflects exactly one of the two attempts' outcome without a
    silently-overwritten mastery stage (no lost update), and no deadlock occurred (test completes
    within its timeout — Postgres would otherwise abort one side with a detectable deadlock error,
    which the test explicitly asserts did NOT happen).
  - Lock discipline: `pg_advisory_xact_lock(hashtext(topic_id)::bigint)` acquired BEFORE any
    `SELECT ... FOR UPDATE` on `gap_mastery`, same order on both concurrent call sites — verified
    by code review comment + the deadlock-freedom assertion above (a wrong lock order would
    surface as an actual deadlock in this same test, not just a code-review nit).
  - Test file: `apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts`
    (integration-test-only, per the `phrase-bank-concurrency-fix` precedent — see
    `scenarios.md`'s SCENARIO 8 note on why this is not a `@GENGAP.SN` Playwright tag).
- [x] `selectDueMasteryEntries<T>`/`applyAttemptToMasteryEntry<T>` moved to
      `packages/core/src/mastery/mastery-state.ts`, phrase-bank's own existing 100%-passing test
      suite re-pointed at the new location with zero behavior change (proven by: existing
      phrase-bank tests still pass unmodified in assertion content, only import paths changed).
- [x] `applyAttemptToMasteryEntry<T>`'s attempt input gains a caller-supplied `isAdjacent: boolean`
      field (Decision 4) instead of deriving it internally from `sequenceNumber`.
      `phrase-bank.repo.ts`'s one new call-site line (computing `isAdjacent` the old
      sequence+1 way and passing it in) is the ENTIRE diff to the already-shipped phrase-bank code
      path — proven by: phrase-bank's existing test suite passes with zero assertion changes.

### Backend — gap lifecycle behavior

- [x] A missed quiz question tagged to an existing gap creates a `gap_mastery` row in `struggling`
      status with `scheduled_for_sequence` set — e2e scenario `@GENGAP.S1`.
- [x] A missed quiz question with an unmatched `gapLabel` (no existing gap for that concept) creates
      a NEW gap (`origin: "ai"`, via the existing unmodified `insertDiscoveredGaps`) AND its
      `gap_mastery` row, both in one transaction — e2e scenario `@GENGAP.S2`.
- [x] A struggling gap is provably NOT re-served within the same generation/replenish batch (the
      answered-question-counter anti-spam guard) — e2e scenario `@GENGAP.S3` asserts the gap is
      absent from the current batch's remaining questions and present only after a subsequent
      `prepareProbeSession`/`maybeReplenish` call once the counter has advanced past
      `scheduled_for_sequence`.
- [x] A gap reaches `mastered` status (and `gaps.state` flips to `"covered"`) only after 3 correct
      answers landing in 3 DISTINCT `probe_sessions` rows (session-identity gating, Decision 4) —
      e2e scenario `@GENGAP.S4` drives three real correct answers across three real
      `regenerate: true` session restarts, not a seeded mid-stage shortcut.
- [x] A correct answer served via a replenish WITHIN the same `probe_sessions` row as the gap's
      last counted correct does NOT advance `masteryStage` — e2e scenario `@GENGAP.S4` (same-session
      case, asserted as part of proving the cross-session case).
- [x] A single correct answer on a fresh/struggling gap does NOT flip `gaps.state` to `"covered"`,
      AND the UI does not display resolution language for a gap whose `gap_mastery` status is below
      `mastered` even if `gaps.state` happens to read `"covered"` via an unrelated writer (the
      display-precedence rule) — e2e scenario `@GENGAP.S5` (the "resolved lie" regression guard).
- [x] The freeform Socratic probe (`apps/api/src/probe/`) and `socratic.service.ts` are provably
      unmodified in behavior — existing regression suite for those flows passes unchanged; a gap
      covered via `give_answer`/`move_on` there still covers on one verdict exactly as today — e2e
      scenario `@GENGAP.S6`. The same scenario's BE layer confirms
      `features/stats/tests/weak-strong-spots` still passes (or is knowingly updated) despite
      mastery-tracked topics now reaching full `gapMaturity` later than before (Decision 6, an
      accepted behavior change, not a regression).

### Frontend — UI surfacing

- [x] `GapChecklist`/`GapRow` renders a mastery-tracked gap's in-progress stage distinctly from a
      bare open gap (e.g., a stage indicator, not just ✓/○) — visible in a real rendered page, not
      just a snapshot — e2e scenario `@GENGAP.S1`/`@GENGAP.S4`.
- [x] `probe-session-quiz.tsx` shows a resolution acknowledgment distinct from "correct, still
      practicing" language when a gap reaches `mastered` — e2e scenario `@GENGAP.S4`; and does NOT
      show resolution language at stage 1-of-3 — e2e scenario `@GENGAP.S5`.
- [x] A cross-cutting nudge banner appears when the same normalized gap label has a `gap_mastery`
      row at `practicing`/`struggling` in 3+ distinct subjects (mastery-tracked gaps only — a plain
      Socratic-discovered `open` gap with no `gap_mastery` row does NOT count toward the threshold,
      Decision 7), and never as a persistent queue/count the user must clear — e2e scenario
      `@GENGAP.S7`.
- [x] No session-debt / no-nagging regression: a due-but-unanswered gap produces no visible
      backlog count anywhere in the UI — asserted as a negative check within `@GENGAP.S3`.

### Documentation

- `docs/architecture/generalize-gap-tracking.md` published (new — no prior doc covers this system)
  with the as-planned Mermaid diagram from `architecture.md` below, per the consistency gate's
  Documentation-changes requirement.

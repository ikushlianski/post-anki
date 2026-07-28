---
type: scenarios
branch: generalize-gap-tracking
task: "Generalize the phrase-bank mastery state machine to drive gap tracking for every subject kind (issue #57)"
state: confirmed
updated: 2026-07-28
---

# Scenarios: Generalized recall-gap mastery tracking

Ticket tag for e2e: `@GENGAP`. Target project: `post-anki`. Target feature: `probe` (batch quiz
flow already lives there — `features/probe/`).

Proof-mechanism summary (mirrors `.planning/phrase-bank-concurrency-fix/scenarios.md`'s own
convention): SCENARIO 1-7 and 9 are Playwright e2e scenarios, each tagged `@GENGAP.SN`. SCENARIO 8
is the one real-DB **vitest integration test** in this plan — a Playwright browser context cannot
reliably force the exact concurrent-write race it proves; a directly-invoked orchestrator call
under `Promise.all` can. It is tagged with its own file-path checkbox, not `@GENGAP.S8`.

---

## SCENARIO 1 — A missed quiz question tagged to an existing gap starts a mastery cycle

A learner is doing a probe-session (batch quiz) on an architecture-mentor topic that already has an
open gap (e.g. discovered earlier via the freeform Socratic probe, or self-declared). A generated
quiz question's `gapLabel` matches that gap. The learner answers it wrong.

**Setup role:** subject = the quiz answer submission (driven through the real UI — this is what's
under test); scenery = the topic, its pre-existing open gap, the generated question batch (seeded/
mocked agent output).

**UI clicking notes:** Learner clicks a wrong MCQ option in `probe-session-quiz.tsx`, submit is
implicit on click (existing behavior, unchanged) — feedback renders inline below the question, no
modal. No new confirmation step introduced.

**Acceptance:**
```
Code:
  - answerProbeSession, on a gap-tagged wrong answer, looks up-or-creates the gap's gap_mastery
    row (matchExistingGapByLabel not needed here — gapId already resolved at generation time).
    Attempt input shape (FINAL, matches Decision 4 exactly, used identically across every
    scenario): `{ sequenceNumber: <post-increment counter>, correct: boolean, isAdjacent: boolean }`.
    On a wrong answer, `isAdjacent` is irrelevant/unused — the incorrect branch of
    applyAttemptToMasteryEntry always resets masteryStage to 0 and reschedules regardless of its
    value (ported unchanged from phrase-bank's own incorrect branch, which never consults
    isAdjacent either); pass `isAdjacent: false` by convention for clarity, not because it's read.
    Since no gap_mastery row exists yet for a never-before-attempted gap, this call creates one
    fresh: input = a synthetic zero-state entry (status "new", masteryStage 0, all counts 0) +
    the attempt above. Output: status "struggling", masteryStage stays 0, incorrectCountInCycle
    1, scheduledForSequence = sequenceNumber + 10.
  - Edge cases: gap already struggling (re-increment incorrectCountInCycle, masteryStage already
    0, stays 0); gap already mastered (no-op per applyAttemptToMasteryEntry's existing "mastered
    entries don't regress" rule, ported unchanged from phrase-bank.ts:84-86) — confirmed explicitly:
    in this branch NEITHER gap_mastery NOR gaps.state is written at all (gaps.state never regresses
    `"covered"` back to `"open"` on a later miss of an already-mastered gap).
Behavior:
  - gaps.state is untouched (stays "open") — only gap_mastery changes on a miss.
  - topics.gap_mastery_sequence_number increments by exactly 1.
BE: gap_mastery row created/updated; topics counter incremented; both in one transaction.
FE: GapRow for this gap now shows a distinguishable "in progress" indicator (not bare ○) once the
    page next reflects topic state (router.invalidate on any answer, existing behavior).
Infra: None.
Tests:
  [x] @GENGAP.S1 — e2e test written
```

---

## SCENARIO 2 — A missed quiz question with no matching gap creates a brand-new gap

Same as S1, but the generated question's `gapLabel` ("Idempotency in retry logic") has no existing
gap for that topic. The learner answers it wrong.

**Setup role:** subject = the quiz answer submission; scenery = the topic (zero pre-existing gaps),
the generated question (mocked agent output carrying a `gapLabel` string with no match).

**UI clicking notes:** Same as S1 — no new UI interaction, this is a backend-only behavioral
difference triggered by the same wrong-answer click.

**Acceptance:**
```
Code:
  - answerProbeSession: when question.gapId is null but question.gapLabel is non-empty, call
    matchExistingGapByLabel(topicGaps, gapLabel) first (defends against a race where a gap with
    this label was created by a DIFFERENT concurrent question/session between generation and
    answer time — see S8). If still unmatched: insertDiscoveredGaps(topicId, [{ label: gapLabel,
    depth: topic.depth, concern: null }]) (existing, unmodified function), then create its
    gap_mastery row directly at status "struggling" (skip "new" — it was already missed once).
  - Edge case: gapLabel is null/empty (agent didn't tag this question) — no gap created, existing
    behavior (question graded, no gap side-effect) preserved exactly.
Behavior: a wrong answer to a genuinely novel concept produces a new, trackable gap — the literal
  "a missed probe/quiz question ... is tracked as a gap" from issue #57's Done-when.
BE: new gaps row (origin: "ai", state: "open") + new gap_mastery row (struggling), one transaction.
FE: the topic's gap checklist now lists this newly-created gap after the next data refresh.
Infra: None.
Tests:
  [x] @GENGAP.S2 — e2e test written
```

---

## SCENARIO 3 — A struggling gap is not re-served within the same generation batch (anti-spam guard, question-cadence only)

A struggling gap (from S1/S2) has `scheduledForSequence = N+10`. The learner keeps answering
questions in the SAME session, triggering one or more `maybeReplenish` top-ups, without the topic's
answered-question counter yet reaching `N+10`.

**Note on what this scenario proves vs. what S4 proves** (corrected after a second adversarial
pass): this scenario proves the anti-spam guard only — a struggling gap can't be immediately
re-served into the very next batch. It does NOT by itself prove "resurfaces in a later session" —
that stronger claim (mastery-STAGE advancement requires a genuinely different `probe_sessions` row)
is what S4 proves, via session-identity gating (spec.md Decision 4), not via this offset.

**Setup role:** subject = the sequence of quiz answers within one continuous session; scenery = the
struggling gap seeded at a known sequence value.

**UI clicking notes:** Learner answers through an entire quiz session (10-16 questions) without
navigating away — this is the existing "keep going" flow already covered by
`batch-finish-auto-advances-to-prefetched-batch`-style behavior; no new UI control.

**Acceptance:**
```
Code:
  - rankDueGapsForQuiz(gaps, currentSequenceNumber, maxDue) filters scheduledForSequence <=
    currentSequenceNumber — identical shape to selectDuePhrases. Called ONCE per
    prepareProbeSession/maybeReplenish invocation (generation-time), never re-evaluated against an
    already-built in-memory batch.
  - Edge case: currentSequenceNumber exactly equals scheduledForSequence (due, inclusive
    boundary) vs. one less (not yet due) — both asserted.
Behavior: within one session that only crosses the REPLENISH_FLOOR (10 remaining) once or twice,
  the struggling gap from S1 must NOT appear in ANY question generated before the topic's
  answered-question counter has advanced by 10 — since a single generation event serves at most 10
  questions and due-ness is fixed at generation time, this requires at least the FIRST replenish
  (a second, separate generation event) before the gap can resurface as a QUESTION (note: even once
  it resurfaces and is answered correctly, S4 shows this does NOT by itself advance masteryStage
  unless it also lands in a different `probe_sessions` row).
Negative assertion: no question in the initial batch or the first replenish batch (if triggered
  before the counter crosses N+10) carries this gap's id.
BE: due-selection query scoped by topicId + gap_mastery_sequence_number.
FE: no visible backlog/count is shown for the not-yet-due gap anywhere (GapChecklist just shows it
  as open, same as today — no "X due" language) — this doubles as the no-session-debt negative
  check from spec.md's DoD.
Infra: None.
Tests:
  [x] @GENGAP.S3 — e2e test written
```

---

## SCENARIO 4 — A gap reaches mastered after 3 corrects landing in 3 distinct probe_sessions (session-identity gating)

**Rewritten after a second adversarial pass found the original version unprovable.** The first
draft seeded `masteryStage: 2` and submitted one correct answer — that only proves the final
transition, not that spacing across sessions was ever enforced, so it could go green without the
issue's actual "resurfaces in a later session" claim ever being tested. This version drives all
three corrects for real: starting from a fresh, untracked gap, across THREE separate
`probe_sessions` rows (via `regenerate: true` between each — a genuinely new session, not a
`maybeReplenish` top-up continuing the same one), the learner answers the recycled gap-tagged
question correctly each time.

**Setup role:** subject = the three correct-answer submissions, EACH in its own `probe_sessions`
row; scenery = the topic, the gap (starts untracked, no `gap_mastery` row).

**UI clicking notes:** Learner starts a quiz session, answers the gap-tagged question correctly
(1st correct → "practicing 1/3"), the session ends and a NEW session is explicitly started
(`regenerate: true` — confirm during implementation whether an existing UI control does this, per
`playwright.md`'s open question; if none exists, `regenerateQuizBatch` calls the prepare endpoint
directly with `regenerate: true` — either way the SUBJECT here is the mastery-transition math, not
the regenerate button's UI mechanics), answers correctly again (2nd correct, still "practicing
2/3" — a different session than the 1st, so it counts), then a THIRD new session, third correct
answer. On this third, properly-session-spaced correct, the feedback area must show a distinct
resolution acknowledgment — confirmed default: a small "✓ Resolved: <gap label>" chip, styled
differently (e.g. a filled/emerald badge) from the existing plain per-question "correct" feedback
text, appearing in the same feedback area `coveredGapLabels` already renders into (today unused —
this scenario is also what fills that rendering gap, folded-in #44).

**Same-session case, asserted within this same scenario:** additionally, within ONE of the three
sessions, trigger a `maybeReplenish` top-up that re-serves the SAME gap and answer it correctly
again — this second correct within the same session must NOT advance `masteryStage` (proves the
`isAdjacent` = same-session-id gate, spec.md Decision 4).

**Acceptance:**
```
Code:
  - gap-mastery.repo.ts computes isAdjacent = (currentProbeSessionId === gapMastery.lastCorrectSessionId)
    and passes it into applyAttemptToMasteryEntry's attempt object (contract change, Decision 4).
  - applyAttemptToMasteryEntry, 3rd NON-adjacent (i.e. 3rd-distinct-session) correct: masteryStage
    reaches MASTERY_THRESHOLD (3), status → "mastered". answerProbeSession, on detecting this
    transition, ALSO sets gaps.state = "covered" for this gap (the one and only bridge write from
    gap_mastery back to gaps for a mastery-tracked gap).
  - Edge case: a correct answer where currentProbeSessionId === lastCorrectSessionId (same-session
    replenish repeat) does NOT advance masteryStage or correctCountInCycle — asserted directly via
    the same-session case above.
Behavior: gaps.state flips to "covered" ONLY on the 3rd correct landing in a genuinely distinct
  `probe_sessions` row — not before, and not on a same-session repeat no matter how many times it
  happens within one sitting (closing the exact gap the first draft's design missed).
BE: gap_mastery.status = "mastered", masteredAt set, lastCorrectSessionId = the 3rd session's id;
    gaps.state = "covered".
FE: probe-session-quiz.tsx renders the "✓ Resolved: <label>" acknowledgment distinctly from
    "correct, still practicing (n/3)" language shown on the 1st/2nd corrects AND on the
    same-session repeat (which stays at whatever n/3 it already was). GapChecklist now shows this
    gap as fully covered (✓), same styling as any other covered gap.
Infra: None.
Tests:
  [x] @GENGAP.S4 — e2e test written
```

---

## SCENARIO 5 — A single correct answer does not falsely resolve a fresh gap ("resolved lie" regression guard)

A brand-new gap (masteryStage 0) is answered correctly ONCE (first attempt ever, no prior misses).

**Setup role:** subject = the single correct-answer submission; scenery = the fresh gap, freshly
generated question.

**UI clicking notes:** Learner clicks the correct option on the very first encounter.

**Also covers the display-precedence rule** (spec.md Decision 2 addendum, added after a second
adversarial pass): to make this negative assertion robust against the untouched Socratic path
independently flipping `gaps.state`, the test additionally seeds a SECOND case where `gaps.state`
IS `"covered"` (written by an unrelated freeform-Socratic `give_answer` call, simulating the
pre-existing cross-writer scenario) while `gap_mastery.status` is still `"practicing"` at stage 1 —
the UI must still show the in-progress state, not a checkmark, proving mastery status wins display
precedence over `gaps.state` whenever a `gap_mastery` row exists.

**Acceptance:**
```
Code:
  - applyAttemptToMasteryEntry, attempt = `{ sequenceNumber, correct: true, isAdjacent: false }`
    (no prior correct exists yet, so isAdjacent is trivially false — there is no
    lastCorrectSessionId to compare against): masteryStage → 1, status → "practicing" (not
    "mastered", not gaps.state = "covered").
  - GapRow (frontend): when a gap carries a mastery sub-object, render ITS status
    (new/practicing/struggling/mastered) — never fall back to gaps.state for display once a
    gap_mastery row exists (Decision 2 addendum).
Behavior: gaps.state remains "open" after exactly one correct answer, regardless of how confident
  or clean the answer was — the literal fix for the pre-existing bug the advisor flagged
  (probe-session.service.ts previously covered on ANY first correct answer).
Negative assertion (case 1): gaps.state is NOT "covered" after this single correct answer. The UI
  does NOT render "Resolved"/"mastered" language — it shows "correct, still practicing (1/3)" or
  equivalent.
Negative assertion (case 2 — display precedence): even when gaps.state IS independently "covered"
  by an unrelated writer, a gap_mastery row at masteryStage 1 still renders as in-progress, NOT as
  a resolved checkmark.
BE: gap_mastery.status = "practicing", masteryStage = 1, gaps.state unchanged ("open") in case 1;
    gaps.state = "covered" but gap_mastery.status = "practicing" in case 2 (seeded directly, not
    produced by this item's own code — simulating the pre-existing cross-writer scenario).
FE: no resolution acknowledgment chip rendered in either case; GapRow shows the in-progress
    indicator from S1, not a checkmark, in BOTH cases.
Infra: None.
Tests:
  [x] @GENGAP.S5 — e2e test written
```

---

## SCENARIO 6 — The freeform Socratic probe and Socratic sessions are unmodified (regression guard)

The pre-existing single-question freeform probe (`apps/api/src/probe/`, `probe-answer.tsx`) and a
Socratic session (`socratic.service.ts`) both still cover a gap on one verdict exactly as before —
including the give-up path (`give_answer`/`move_on`).

**Setup role:** subject = a freeform probe answer submission and a Socratic `move_on` action;
scenery = an open gap on a topic.

**UI clicking notes:** No change — existing flows, existing clicks, unchanged.

**Also covers the topic-maturity/stats side effect** (spec.md Decision 6, added after a second
adversarial pass): confirms `features/stats/tests/weak-strong-spots` still passes for a topic that
does NOT use mastery-tracked gaps (this scenario's own setup), establishing the baseline that only
mastery-tracked topics see the later-maturity behavior change — not a global regression.

**Acceptance:**
```
Code: submitProbe (probe.service.ts) and socratic.service.ts's deriveSocraticAction path are
  untouched — zero diff expected on these files (confirm via git diff at implementation time,
  mirroring decide-mode's own "confirmed: empty diff" precedent for decide.agent.ts).
Behavior: a gap covered via a single mentorEval verdict, or via give_answer/move_on, still flips
  gaps.state to "covered" immediately — no gap_mastery row is ever created for gaps discovered/
  covered exclusively through these two flows.
BE: no new columns/tables touched by these code paths; existing `features/stats/tests/weak-strong-spots`
    passes unchanged for a topic with no mastery-tracked gaps (Decision 6 baseline).
FE: probe-answer.tsx's existing coveredGapLabels rendering is unchanged.
Infra: None.
Tests:
  [x] @GENGAP.S6 — e2e test written
```

---

## SCENARIO 7 — Cross-cutting nudge surfaces when the same gap concept recurs in 3+ subjects

A learner has a MASTERY-TRACKED (has a `gap_mastery` row, status `practicing` or `struggling`) gap
labeled "Race condition" (normalized) in a Databases subject, a Concurrency subject, and a
Distributed Systems subject — 3 distinct subjects.

**Scope corrected after a second adversarial pass:** the first draft counted any `gaps.state ===
"open"` gap toward the threshold, including gaps discovered exclusively through the untouched
freeform Socratic flow (no `gap_mastery` row at all) — but the task's own directive scoped this
nudge to the new recall-gap-mastery mechanism specifically. This scenario now ALSO seeds a 4th gap
with the same normalized label, `state: "open"`, but NO `gap_mastery` row (Socratic-discovered
only) in a 4th subject, and asserts it does NOT count toward the 3-subject threshold on its own —
i.e., only 3 genuinely mastery-tracked subjects trigger the nudge, a 4th untracked one is inert.

**Setup role:** subject = the nudge banner's appearance itself (rendered from real, seeded gap
data — this is a read-only aggregation, not a UI-driven creation, so there is no "front door"
creation step for the subject here; called out per the skill's "no subject" allowance for a pure
read/precondition scenario); scenery = 3 gaps with the same normalized label across 3 subjects
(seeded).

**UI clicking notes:** No click sequence — this is a passive banner appearing on next page load
(e.g. `today.tsx` or a small panel near the subjects list). Confirmed default: appears once per
distinct recurring label per day (matching "silent on non-response"/no-nagging principle — it does
not re-appear every page load once acknowledged, mirrors the daily-push single-item pattern already
used in `daily-push.ts`).

**Acceptance:**
```
Code:
  - detectCrossCuttingGaps(gapsAcrossSubjects): input shape [{ label, subjectId, hasMasteryTracking:
    boolean, trackedStatus: "new"|"practicing"|"struggling"|"mastered"|null }], groups by
    normalize(label), filters hasMasteryTracking === true AND trackedStatus in
    ("practicing","struggling") only, counts DISTINCT subjectId, returns entries with count >= 3.
  - Edge cases: same label but only 2 distinct MASTERY-TRACKED subjects (plus any number of
    untracked ones) → no nudge; 3+ subjects but one gap is already "mastered" → excluded from the
    count (only unresolved recurrence counts); a 4th subject's gap with the same label but
    hasMasteryTracking: false → does not count toward the 3, and does not appear in the returned
    subjectIds list; empty input → empty output.
Behavior: the nudge is a read-only, on-demand computed view (like concerns.tsx's summarizeConcerns
  rollup) — no new persistence table for "nudges shown."
BE: new read endpoint aggregating gaps JOIN topics JOIN curricula for subjectId, applying
    detectCrossCuttingGaps.
FE: a banner names the recurring concept and the subjects it recurred in ("Race condition" keeps
    coming up — Databases, Concurrency, Distributed Systems"); no dismiss-tracking queue, no badge
    count anywhere else.
Infra: None.
Tests:
  [x] @GENGAP.S7 — e2e test written
```

---

## SCENARIO 8 — Concurrency: two simultaneous quiz answers against the same topic/gap don't corrupt state

**Tagging note (confirmed against precedent):** `.planning/phrase-bank-concurrency-fix/scenarios.md`
tags its analogous integration-only concurrency scenarios (SCENARIO 2-4) with a file-path
checkbox — `[ ] apps/api/src/practice/phrase-bank-concurrency.integration.test.ts — SCENARIO N
case: ...` — reserving the `@TICKET.SN` Playwright tag exclusively for its one true e2e scenario
(SCENARIO 5). This scenario follows that exact precedent below, not a `@GENGAP.S8` Playwright tag —
the scenario-coverage gate reads Playwright tags specifically, and an integration-only test
mistagged that way would falsely appear covered (or falsely appear missing) in that gate.

Mirrors `phrase-bank-concurrency.integration.test.ts` exactly. Two concurrent `answerProbeSession`
calls target different questions that both resolve to the SAME `gapId` on the SAME topic (e.g. two
browser tabs, or a fast double-submit racing a replenish-triggered re-fetch).

**Setup role:** subject = the two concurrent `answerProbeSession` orchestrator calls (exercised
directly, real DB, real transaction — not through the browser UI for this one, matching the
concurrency-fix precedent's own integration-test-not-e2e shape); scenery = the topic, the gap, two
pre-generated questions both tagged to it.

**UI clicking notes:** N/A — this is a backend integration test, not a browser-driven e2e (same
precedent as `phrase-bank-concurrency.integration.test.ts`, which is a `.integration.test.ts` file
run via vitest against the real local e2e Postgres, not a Playwright test).

**Acceptance:**
```
Code:
  - answerProbeSession's gap-mastery write path: pg_advisory_xact_lock(hashtext(topicId)::bigint)
    acquired BEFORE SELECT gap_mastery ... FOR UPDATE (ordered by id if multiple rows — mirrors
    getPhraseBankEntriesByIdsForUpdate). topics.gap_mastery_sequence_number incremented via
    SELECT ... FOR UPDATE in the same transaction, same lock scope.
  - Edge case: both calls target the SAME gap_mastery row — second serializes behind the first,
    never loses the first's write.
Behavior: BOTH calls resolve successfully (Promise.all, not allSettled — asserted as its own
  expectation before any row is inspected). topics.gap_mastery_sequence_number ends at exactly
  +2 from its start value (no lost increment). gap_mastery reflects a coherent single serialized
  outcome (whichever attempt's verdict landed last, per normal serialization — not a torn/partial
  write mixing both). No deadlock (test completes within its timeout).
BE: real Postgres via DATABASE_URL/E2E_DATABASE_URL, assertLocalDbTarget guard, only the Mastra
    agent call mocked — identical harness shape to phrase-bank-concurrency.integration.test.ts.
FE: N/A (backend-only test).
Infra: local e2e docker Postgres already migrated to the tip of apps/api/src/db/migrations/.
Tests:
  [x] apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts — SCENARIO 8 case:
      fires two concurrent answerProbeSession calls against the same gap_mastery row, real DB,
      mocked agent (precedent: phrase-bank-concurrency-fix's SCENARIO 2-4 tagging convention)
```

---

## SCENARIO 9 — No session debt: an unanswered due gap never appears as a backlog

A gap becomes due (`scheduledForSequence` reached) but the learner never starts another probe
session on that topic for several days.

**Setup role:** subject = the passage of "time" (simulated via a later generation event with no
new session actually opened in between — this is a negative/absence check, no UI creation
subject); scenery = the due gap, untouched.

**UI clicking notes:** No interaction — this scenario is a negative assertion across the app's
surfaces the learner might check (topic page, `today.tsx`, any stats/dashboard view) while never
opening the topic's probe session again.

**Acceptance:**
```
Behavior: nowhere in the UI does a due-but-unanswered gap render as a count, badge, "N items due,"
  or any queue-like affordance. The topic page shows the gap as a plain open item (same as any
  other open gap) — no distinguishing "overdue"/"due now" language, matching "no session debt" and
  "silent on non-response."
Negative assertion: grep-level + rendered-page check that no new UI surface added by this item
  introduces a due-count/backlog badge.
BE: None (this is a negative UI check on top of the same query paths already covered elsewhere).
FE: topic page + today.tsx render nothing backlog-like for this gap.
Infra: None.
Tests:
  [x] @GENGAP.S9 — e2e test written
```

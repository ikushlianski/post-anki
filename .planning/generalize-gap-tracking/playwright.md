---
type: playwright
branch: generalize-gap-tracking
task: GENGAP
state: confirmed
target-project: post-anki
target-feature: features/probe
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Generalized recall-gap mastery tracking

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — A wrong quiz answer on a real concept the learner hasn't seen before is remembered as
  something to work on, without the learner having to flag it themselves. → S1, S2
- B2 — A concept the learner is still shaky on comes back later, but not immediately — the app
  doesn't nag them with the same question right away. → S3
- B3 — Once a learner has genuinely demonstrated a concept three separate times, the app tells them
  clearly it's resolved — not after one lucky guess, and not because the app gave up on them. → S4, S5
- B4 — If a learner keeps missing the same underlying concept across different subjects (e.g. "race
  conditions" in both a databases course and a concurrency course), the app notices and says so
  once, without turning it into a checklist they have to manage. → S7
- B5 — Two study sessions happening at the same time (two tabs, or a quick double-answer) never
  corrupt a learner's progress on a concept. → S8

**UX scenarios**
- U1 — Learner answers a quiz question wrong; later, the topic page shows this concept as something
  still being worked on (a distinct in-progress marker, not just a plain open dot). → S1, S2
- U2 — Learner answers the same recycled question correctly for the third time, spaced across
  separate practice sessions, and sees a clear "resolved" acknowledgment distinct from ordinary
  "correct" feedback. → S4
- U3 — Learner answers correctly on the very first try and does NOT see "resolved" language —
  just ordinary correct feedback. → S5
- U4 — A banner appears (once, not repeatedly) naming a concept that keeps coming up across 3+ of
  the learner's subjects. → S7
- U5 — Nothing in the app ever shows a "3 gaps due" counter or backlog badge for this mechanism. →
  S3, S9

**Not e2e (verified at unit/integration only)**
- S8 (concurrency) — two-tab/double-submit race requires directly invoking the orchestrator
  functions with real concurrent DB transactions; a browser can't reliably force this exact race
  window. Verified as a `.integration.test.ts`, mirroring `phrase-bank-concurrency.integration.test.ts`.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/probe/`
- Target DB: local e2e docker Postgres (`e2e/docker-compose.yml`)
- Dev server URL: `http://localhost:3100` (web), API `http://localhost:8031`

## Action surface — snapshot

Actions available in `features/probe/actions/`:
- `openTopicQuiz({ page, topicId, curriculumId })` — navigates to `/probe/:topicId?mode=quick_test`,
  clicks "Generate Probing Questions" if needed, waits for a question or complete state.
- `answerSingleSelect` / `answerMultiSelect` — clicks an MCQ/true-false/multi-select option.
- `findOptionIndex` — helper to locate the correct/incorrect option index from mock data.
- `openSocraticChat`, `sendSocraticAnswer` — freeform Socratic probe flow (S6 regression only).
- `submitItemFeedback`, `sendStudyChatMessage` — unrelated to this item, not used here.

**Action gap:** `regenerateQuizBatch({ page, topicId, curriculumId })` — S3/S4 need a way to force a
second/third generation event (simulating a later sitting) without literally waiting real time.
Proposed: drives the existing `regenerate` input flag on `prepareProbeSession` via a UI control if
one exists (check `probe-session-quiz.tsx` for a "start new session" affordance), or calls the
session-preparation endpoint directly via `page.request` if no UI control exists — confirm which
during implementation; either is acceptable since the SUBJECT under test in S3/S4 is the mastery
transition math, not the regenerate button's UI mechanics.

## Scenario → action + state + testid map

### S1 — Missed quiz question on an existing gap starts a mastery cycle

**Composes actions:** `openTopicQuiz`, `answerSingleSelect` (or `answerMultiSelect`)
**Action gaps:** none
**Pre-test state:** additive-seed — topic with one pre-existing open gap; mock `probe-quiz-batch`
response tags a generated question's `gapLabel` to match that gap's label exactly.
**Required `data-testid` attributes** (guidance):
- `gap-row-<gapId>` or similar — GapRow needs a stable per-gap testid to assert its "in progress"
  indicator (currently GapRow has no testid at all per source read — implementer adds one).
**Fixture variants:** `probe-quiz-batch` mock variant carrying a `gapLabel` matching a seeded gap
(new mock-data entry).

---

### S2 — Missed quiz question with no matching gap creates a new gap

**Composes actions:** `openTopicQuiz`, `answerSingleSelect`
**Action gaps:** none
**Pre-test state:** additive-seed — topic with ZERO pre-existing gaps; mock `probe-quiz-batch`
response tags a question with a novel `gapLabel` (no match possible).
**Required `data-testid` attributes:** same `gap-row-*` guidance as S1, plus confirming the new gap
appears in the checklist after refresh.
**Fixture variants:** `probe-quiz-batch` mock variant with an unmatched `gapLabel`.

---

### S3 — Struggling gap not re-served within the same generation batch (anti-spam guard only)

**Composes actions:** `openTopicQuiz`, `answerSingleSelect` (repeated)
**Action gaps:** none (the confirmed-required `regenerateQuizBatch` is used by S4, not S3 — S3 stays
within one continuous session/replenish chain by design, since it's proving the anti-spam offset,
not session-identity gating)
**Pre-test state:** additive-seed — a gap pre-seeded directly at `struggling` status with a known
`scheduledForSequence` value, topic's `gapMasterySequenceNumber` pre-seeded below that threshold.
**Required `data-testid` attributes:** none new — this scenario's key assertion is a NEGATIVE check
(this gap's question never appears) via existing `quiz-question` testid content inspection, plus a
DB-level assertion (BE layer) that no backlog count renders (`gap-row-*` absence of any "due"
styling).
**Fixture variants:** none new beyond S1/S2's.

---

### S4 — Gap reaches mastered after 3 corrects landing in 3 distinct probe_sessions (rewritten)

**Composes actions:** `openTopicQuiz`, `answerSingleSelect`, `regenerateQuizBatch` (×2 — CONFIRMED
required, must create a genuinely new `probe_sessions` row via `regenerate: true`, not append to
the existing one; this is now load-bearing for the scenario's proof, not a convenience)
**Action gaps:** `regenerateQuizBatch` — resolves the prior open question: it MUST drive an actual
new-session creation (either via a UI "start new session" control if one exists, or `page.request`
against the prepare endpoint with `regenerate: true` if none does); either satisfies the
Acceptance, since the subject under test is the mastery-transition math, not the button's mechanics.
**Pre-test state:** additive-seed — a FRESH, untracked gap (no `gap_mastery` row) — no more
mid-stage seeding shortcut, since the whole point is proving three real, session-separated corrects.
**Required `data-testid` attributes:**
- `gap-resolution-ack` — the new "✓ Resolved: <label>" chip in `probe-session-quiz.tsx`'s feedback
  area (currently unrendered — this scenario is what proves it gets built).
**Fixture variants:** `probe-quiz-batch` mock variant recycling the same gap's label across three
separate generation events (one per new session), plus a same-session replenish variant re-serving
the gap within one of the three sessions (proves the same-session-repeat does NOT advance stage).

---

### S5 — Single correct answer does not falsely resolve a fresh gap (+ display-precedence case)

**Composes actions:** `openTopicQuiz`, `answerSingleSelect`
**Action gaps:** none
**Pre-test state:** additive-seed — TWO cases: (1) a brand-new gap-tagged question, gap at
`masteryStage: 0`; (2) a second gap seeded with `gaps.state: 'covered'` (simulating an unrelated
writer) but `gap_mastery.status: 'practicing'`, `masteryStage: 1` — proves display precedence.
**Required `data-testid` attributes:** `gap-resolution-ack` MUST be absent (negative assertion) in
BOTH cases — reuses S4's testid. `gap-row-*` (from S1) must show the in-progress indicator, not a
checkmark, in case 2 despite `gaps.state` reading `'covered'`.
**Fixture variants:** case 1 shares S1's mock variant; case 2 needs no mock (state seeded directly,
no quiz answer submission required for that half — a pure render/read check).

---

### S6 — Freeform Socratic probe/Socratic session regression guard

**Composes actions:** `openSocraticChat`, `sendSocraticAnswer` (existing, unmodified flow)
**Action gaps:** none
**Pre-test state:** baseline existing state used by the current `socratic-chat` test already in
`features/probe/tests/socratic-chat/` — this scenario extends that existing test's assertions
rather than building new state, confirming `gaps.state` still flips on one verdict / on give-up.
Also confirms `features/stats/tests/weak-strong-spots` passes unchanged for this topic (no
mastery-tracked gaps involved — the Decision 6 baseline).
**Required `data-testid` attributes:** none new.
**Fixture variants:** none new — reuses existing socratic-chat fixtures.

---

### S7 — Cross-cutting nudge across 3+ subjects

**Composes actions:** none from `features/probe/` — this is a passive banner, likely rendered on
a dashboard/today view. Action gap: `viewCrossCuttingNudge({ page })` — navigate to wherever the
banner renders (today.tsx or a new small panel — confirm placement during implementation) and read
its text.
**Action gaps:** `viewCrossCuttingNudge` (new)
**Pre-test state:** additive-seed — 3 MASTERY-TRACKED gaps (each with a `gap_mastery` row at
`practicing`/`struggling`) with the same normalized label ("Race condition") across 3 distinct
subjects, PLUS a 4th gap with the same label but NO `gap_mastery` row (Socratic-discovered only,
`gaps.state: 'open'`) in a 4th subject — scoped after a second adversarial pass tightened
`detectCrossCuttingGaps` to mastery-tracked gaps only (Decision 7).
**Required `data-testid` attributes:** `cross-cutting-nudge-banner` (new).
**Fixture variants:** none (pure seed, no LLM mock involved — this is a read-only aggregation).
**Negative assertion:** the banner names exactly the 3 mastery-tracked subjects, never the 4th
untracked one.

---

### S9 — No session-debt negative check

**Composes actions:** `openTopicQuiz` (to load the topic page containing the due-but-unanswered gap)
**Action gaps:** none
**Pre-test state:** additive-seed — same as S3's due gap, but the test never answers past the
threshold; only asserts absence of backlog UI.
**Required `data-testid` attributes:** none new — negative assertion against the full rendered
page (no element matching backlog/count patterns).
**Fixture variants:** none new.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `regenerateQuizBatch` | S4 only (CONFIRMED: must create a new `probe_sessions` row via `regenerate: true` — load-bearing for the session-identity proof, not a convenience helper) | No — internal test-orchestration helper, not a user-facing AI-callable flow |
| `viewCrossCuttingNudge` | S7 | No — single-purpose read/navigate helper |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | additive-seed | topic + 1 open gap + mock quiz batch tagging it |
| S2 | additive-seed | topic + 0 gaps + mock quiz batch with novel gapLabel |
| S3 | additive-seed | gap pre-seeded `struggling`, sequence counter below threshold (anti-spam guard only, no session-identity involved) |
| S4 | additive-seed | FRESH untracked gap; drives 3 real corrects across 3 distinct `probe_sessions` rows + 1 same-session repeat case (rewritten — no more mid-stage seeding shortcut) |
| S5 | additive-seed | case 1 shares S1's seed; case 2 seeds `gaps.state: 'covered'` + `gap_mastery.status: 'practicing'` directly (display-precedence proof) |
| S6 | local-accumulated / existing fixture | reuses `socratic-chat` test's existing setup; also confirms `weak-strong-spots` baseline |
| S7 | additive-seed | 3 mastery-tracked subjects/gaps (same label) + 1 untracked 4th subject/gap (same label) proving it's excluded |
| S8 | n/a (integration test, not e2e — direct DB) | real local e2e Postgres, no Playwright state class |
| S9 | additive-seed | shares S3's seed |

## Open questions

- Exact placement of the cross-cutting nudge banner (today.tsx vs. a new dedicated panel) —
  implementer's call, doesn't change the scenario's Acceptance.
- Whether `regenerateQuizBatch` drives a real UI "new session" control or calls the prepare
  endpoint directly via `page.request` — either satisfies S4's Acceptance AS LONG AS it produces a
  genuinely new `probe_sessions` row (confirmed required, not optional — see Decision 4); implementer
  decides based on whether such a UI control already exists.
- `apps/web/src/curriculum/model.ts`'s `gapStatusSchema`/`status` field vs. `packages/shared/src/gap.ts`'s
  `state` field naming mismatch — noted in discussion.md, doesn't block any scenario, worth a quick
  look during implementation.

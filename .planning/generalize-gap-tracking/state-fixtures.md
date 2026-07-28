---
type: state-fixtures
branch: generalize-gap-tracking
task: GENGAP
state: confirmed
target-project: post-anki
target-feature: features/probe
local-db-inspected-at: 2026-07-28 (via source-repo code reading; live local e2e Postgres not
  running during this planning session — see note below)
existing-state-mocks-snapshot: ["setupConfirmedTopic", "setupConfirmedTopicForSubject" (shared
  helpers in mock-openrouter/responses.ts, not a dedicated state-mocks/ folder — features/probe/
  has no fixtures/state-mocks/ directory today; state is built via direct API calls in test
  setup, matching this project's existing convention)]
proposed-new-state-mocks: ["seedGapAtStage(topicId, { status, masteryStage, scheduledForSequence,
  gapsState?, masteryStatus? })", "seedCrossCuttingGaps(subjectIds, label, { masteryTracked })"]
updated: 2026-07-28
---

# State fixtures — Generalized recall-gap mastery tracking

## Source inventory

**Existing setup helpers reused** (this project's convention: direct API-call setup functions in
`mock-openrouter/responses.ts`, not a `fixtures/state-mocks/*.ts` file convention like the
mathaul projects use):
- `setupConfirmedTopicForSubject(subjectId, stamp)` — creates a curriculum with one confirmed
  topic under a given subject, via real API calls against the local e2e stack.
- `setupConfirmedTopic(stamp)` — same, plus creates a fresh architecture-mentor subject.

**Proposed new setup helpers** (to be written by `/implement-playwright`, following the same
direct-API-call convention as the existing two above, not a new state-mocks file format):
- `seedGapAtStage(topicId, { label, status, masteryStage, scheduledForSequence })` — inserts a
  `gaps` row (if not already existing) plus its `gap_mastery` row at a controlled stage, via a
  direct DB write (this project's e2e harness already permits direct Postgres writes for setup —
  confirm the existing convention in `features/practice/` fixtures, which seed `phrase_bank_entries`
  directly for phrase-bank tests).
- `seedCrossCuttingGaps(subjectIds: string[], normalizedLabel: string)` — creates one gap with the
  same label under a topic in each of 3+ given subjects, all `open`/`struggling`.

**Local-DB inspection note:** this planning session inspected the schema and existing test/fixture
code directly (not a live local Postgres instance, which wasn't running during planning). The
concrete state below is derived from `apps/api/src/db/schema.ts` and the existing
`phrase-bank-concurrency.integration.test.ts` harness pattern, not a live sample. `/implement-playwright`
should re-verify against the actual local e2e DB before finalizing seed values.

## Per-scenario state contract

### S1 — Missed quiz question on an existing gap starts a mastery cycle

- **State source:** `additive-seed`
- **Setup helpers applied:** `setupConfirmedTopicForSubject` (existing), `seedGapAtStage` (proposed-new, seeds ONE open gap with no gap_mastery row yet — status "new"/none)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | `subjects` | `kind: 'architecture-mentor'` | `setupConfirmedTopicForSubject` | scenery |
  | `curricula` | `status: 'confirmed'` | `setupConfirmedTopicForSubject` | scenery |
  | `topics` | 1 topic, `gapMasterySequenceNumber: 0` | `setupConfirmedTopicForSubject` | scenery |
  | `gaps` | 1 row, `label: 'Service boundary ownership'`, `state: 'open'`, `origin: 'user'` | `seedGapAtStage` | scenery |
  | mocked `probe-quiz-batch` response | 1 question with `gapLabel: 'Service boundary ownership'` (exact match) | mock-openrouter fixture | n/a (LLM mock) |

- **Mutations the scenario makes:** the wrong-answer submission (subject) creates a `gap_mastery`
  row and increments `topics.gap_mastery_sequence_number` by 1.

---

### S2 — Missed quiz question with no matching gap creates a new gap

- **State source:** `additive-seed`
- **Setup helpers applied:** `setupConfirmedTopicForSubject` only (zero gaps seeded)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | `subjects`/`curricula`/`topics` | same as S1, `gaps` table EMPTY for this topic | `setupConfirmedTopicForSubject` | scenery |
  | mocked `probe-quiz-batch` response | 1 question with `gapLabel: 'Idempotency in retry logic'` (novel, no existing gap) | mock-openrouter fixture | n/a |

- **Mutations:** creates a NEW `gaps` row (`origin: 'ai'`) + its `gap_mastery` row (subject of this test).

---

### S3 — Struggling gap not re-served within the same generation batch (anti-spam guard only, no session-identity)

- **State source:** `additive-seed`
- **Setup helpers applied:** `setupConfirmedTopicForSubject`, `seedGapAtStage({ status: 'struggling', masteryStage: 0, scheduledForSequence: 8 })` with `topics.gapMasterySequenceNumber` pre-seeded to `2` (below threshold)
- **Suite:** `none` (S3 no longer shares a topic with S4, since S4 now requires a fresh untracked gap — see S4 below)
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | `gaps` | 1 row, `state: 'open'` | `seedGapAtStage` | scenery |
  | `gap_mastery` | `status: 'struggling'`, `scheduled_for_sequence: 8` | `seedGapAtStage` | scenery |
  | `topics.gap_mastery_sequence_number` | `2` | `seedGapAtStage` | scenery |
  | mocked `probe-quiz-batch` (initial + 1 replenish) | none tagged to this gap (still not due) | mock-openrouter fixture | n/a |

- **Mutations:** answering ~8 more questions advances the counter to 8+; test asserts the gap is
  absent from every batch generated before that point.

---

### S4 — Gap reaches mastered after 3 corrects landing in 3 distinct probe_sessions (rewritten)

**Rewritten after a second adversarial pass** — no more mid-stage seeding shortcut; the whole point
is proving the three demonstrations are genuinely session-separated, not just counting to 3.

- **State source:** `additive-seed`
- **Setup helpers applied:** `setupConfirmedTopicForSubject` only (gap starts FRESH, untracked — no
  `gap_mastery` row until the first wrong-or-right answer creates one)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | `gaps` | 1 row, `label: 'Idempotent retries'`, `state: 'open'` | `seedGapAtStage` (minimal — origin only, no gap_mastery row yet) | scenery |
  | mocked `probe-quiz-batch`, generation event 1 (initial `prepareProbeSession`) | 1 question tagged to this gap | mock-openrouter fixture | n/a |
  | mocked `probe-quiz-batch`, generation event 2 (via `regenerateQuizBatch`, `regenerate: true` → NEW `probe_sessions` row) | 1 question re-tagged to this gap | mock-openrouter fixture | n/a |
  | mocked `probe-quiz-batch`, generation event 2's OWN replenish (same session as event 2) | 1 more question re-tagged to this gap — this is the same-session repeat case | mock-openrouter fixture | n/a |
  | mocked `probe-quiz-batch`, generation event 3 (via `regenerateQuizBatch` again, another NEW `probe_sessions` row) | 1 question re-tagged to this gap | mock-openrouter fixture | n/a |

- **Mutations (all subject — this is what's under test):**
  1. Session 1, correct → `gap_mastery` created, `status: 'practicing'`, `masteryStage: 1`,
     `lastCorrectSessionId: <session-1-id>`.
  2. Session 2, correct → different session id than stored → `masteryStage: 2`,
     `lastCorrectSessionId: <session-2-id>`.
  3. Session 2's OWN replenish, correct AGAIN (same session id as the previous correct) →
     `isAdjacent: true` → `masteryStage` stays `2` (asserted directly — the same-session case).
  4. Session 3, correct → different session id → `masteryStage: 3` → `status: 'mastered'`,
     `gaps.state: 'covered'`.

---

### S5 — Single correct answer does not falsely resolve a fresh gap (+ display-precedence case)

**Case 1 (unchanged from original draft):**
- **State source:** `additive-seed`
- **Setup helpers applied:** shares S1's seed (fresh gap, no gap_mastery row / masteryStage 0)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:** identical to S1's table, except the mocked answer submission is
  CORRECT rather than wrong.
- **Mutations:** creates `gap_mastery` at `status: 'practicing'`, `masteryStage: 1`. `gaps.state`
  remains `'open'` (negative assertion).

**Case 2 (added after a second adversarial pass — display-precedence proof):**
- **State source:** `additive-seed`
- **Setup helpers applied:** `seedGapAtStage({ gapsState: 'covered', masteryStatus: 'practicing', masteryStage: 1 })` (proposed-new variant of the helper — seeds the CONTRADICTORY combination directly, simulating an unrelated writer having already flipped `gaps.state`)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | `gaps` | `state: 'covered'` (seeded, simulating the untouched Socratic path) | `seedGapAtStage` | scenery |
  | `gap_mastery` | `status: 'practicing'`, `masteryStage: 1` | `seedGapAtStage` | scenery |

- **Mutations:** none — this is a pure render/read check (subject = the page render itself, no
  quiz answer submitted for this half).

---

### S6 — Freeform Socratic probe/Socratic session regression guard

- **State source:** `local-accumulated` (reuses the existing `socratic-chat` e2e test's own setup,
  already exercised in `features/probe/tests/socratic-chat/`)
- **Setup helpers applied:** existing, unmodified
- **Suite:** none
- **Reseed strategy:** `preserve-local-state` (this scenario extends an existing test file's
  assertions rather than introducing new state)
- **Concrete state required:** whatever the existing `socratic-chat` test already seeds — no new
  requirement beyond adding the assertion that `gap_mastery` has zero rows touched by this flow.

---

### S7 — Cross-cutting nudge across 3+ subjects (scope tightened to mastery-tracked gaps only)

**Scope corrected after a second adversarial pass** — the aggregator now requires a `gap_mastery`
row (Decision 7), so this fixture adds a 4th, deliberately UNTRACKED gap to prove it's excluded.

- **State source:** `additive-seed`
- **Setup helpers applied:** `seedCrossCuttingGaps(['subj-a','subj-b','subj-c'], 'Race condition', { masteryTracked: true })` PLUS `seedGapAtStage` for a 4th subject's gap with the same label and NO `gap_mastery` row (proposed-new)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | 3× `subjects` (a, b, c) | distinct ids | `seedCrossCuttingGaps` | scenery |
  | 3× `topics` (one per subject) | | `seedCrossCuttingGaps` | scenery |
  | 3× `gaps` (a, b, c) | same normalized `label: 'Race condition'`, EACH with a `gap_mastery` row at `practicing`/`struggling` | `seedCrossCuttingGaps` | scenery |
  | 1× `subjects`/`topics`/`gaps` (subject d) | same normalized `label: 'Race condition'`, `state: 'open'`, NO `gap_mastery` row | `seedGapAtStage` | scenery |

- **Mutations:** none — this is a pure read/precondition scenario, no subject-as-created-entity;
  the nudge banner's rendering IS the subject under test (per the skill's own allowance for a
  scenario whose subject is a passive read, not a UI-created entity).
- **Negative assertion:** the rendered banner names exactly subjects a/b/c, never subject d.

---

### S8 — Concurrency proof (integration test, not e2e)

- **State source:** `additive-seed` (via direct Postgres setup in the integration test's own
  `beforeEach`, mirroring `phrase-bank-concurrency.integration.test.ts` exactly — not a Playwright
  state class)
- **Setup helpers applied:** none from the Playwright action/state-mock system — this test lives in
  the SOURCE repo (`apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts`), not
  verification-repo.
- **Suite:** n/a
- **Reseed strategy:** n/a (vitest-level `beforeEach`/`afterAll` against `DATABASE_URL`/`E2E_DATABASE_URL`)
- **Concrete state required:** one topic, one gap, one `gap_mastery` row, two pre-built
  `probe_session_questions` rows both tagged to that gap's id, both `answeredAt: null`.
- **Mutations:** two concurrent `answerProbeSession` calls (both subject — this is the thing under
  test) via `Promise.all`.

---

### S9 — No session-debt negative check

- **State source:** `additive-seed`
- **Setup helpers applied:** shares S3's seed (a due-but-not-yet-served gap)
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:** identical to S3's table.
- **Mutations:** none — pure negative UI check (no backlog/count element anywhere).

## State suites

No scenarios share a single seeded state requiring sequential shared mutation without reset; each
runs independently under `wipe-and-replay-baseline-plus-mocks`. (S3/S4 MAY share a topic as a
suite if the implementer finds it more efficient — noted as optional above, not required.)

## Forbidden mutations

None of these scenarios target `mathaul-dev` or any forbidden target — all run against the local
e2e docker Postgres exclusively, per this project's existing `assertLocalDbTarget`/
`assertTargetAllowed` guard.

## Open questions

- Whether this project's e2e harness already has a direct-DB-seed convention for
  `phrase_bank_entries`-style setup (referenced above as the precedent for `seedGapAtStage`) —
  confirm the exact file/pattern in `features/practice/fixtures/` during implementation; if no such
  precedent exists, `seedGapAtStage` will need to be the first direct-DB-seed helper for this
  project's `probe` feature, following the same shape.

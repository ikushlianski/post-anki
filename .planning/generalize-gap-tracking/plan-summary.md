---
type: plan-summary
branch: generalize-gap-tracking
task: "Generalize the phrase-bank mastery state machine to drive gap tracking for every subject kind (issue #57)"
state: confirmed
updated: 2026-07-28
---

# Plan summary — generalized recall-gap mastery tracking

## What this is

Extends the phrase-bank's proven recycle-until-mastered state machine — missed it, recycle it,
archive as resolved after 3 non-adjacent correct demonstrations — to drive gap tracking for
**probe-session quiz misses on any subject**, architecture-mentor included. Today, a missed quiz
question either does nothing to the pre-existing `gaps` open/covered flag, or (worse) flips it
"covered" on the very first correct guess. After this ships, a missed quiz question with a
recognizable concept starts a mastery cycle that genuinely requires repeated, spaced correctness
before the UI calls it resolved — and the same concept recurring across 3+ subjects surfaces as a
nudge.

## Scope decision (read `spec.md`'s "Decisions made autonomously" for full reasoning)

Narrow. This item does **not** unify with `domain_priority_suggestions` (item 7) or
`decide_blind_spots` (item 8) — both remain their own separate accept/reject concepts. It widens
ONLY the recall-recycling mechanism, and only for `apps/api/src/probe-session/` (the batch MCQ/
true-false quiz flow). The older freeform Socratic `apps/api/src/probe/` and `socratic.service.ts`
flows are untouched — their existing single-verdict gap-covering behavior stays exactly as-is.

## Where it lands

- New `gap_mastery` table (sidecar, 1:1 with `gaps` via `gap_id`) — carries the phrase-bank-style
  mastery columns. `gaps.state` itself is untouched in shape; it's still just flipped to `covered`
  once, but now ONLY by the new mastery machine once `masteryStage` reaches 3, for gaps reachable
  through probe-session's quiz.
- New `topics.gapMasterySequenceNumber` column — the monotonic per-topic counter mastery scheduling
  needs, since no such counter exists on the quiz path today.
- New `probe_session_questions.gapLabel` column — persists the AI-generated concept label even when
  it doesn't match an existing gap, so a miss on a never-before-seen concept can spawn a new gap.
- Generalized derivers in `packages/core/src/mastery/` (extracted from `phrase-bank.ts`, which
  already declared its state shape and transition function fully generically — no phrase-specific
  fields existed in the type being generalized).

## Documents in this plan

- `spec.md` — full spec, Decisions made autonomously, Definition of Done per layer
- `scenarios.md` — 9 numbered scenarios with Acceptance blocks
- `architecture.md` — new write path + concurrency design, as-planned diagram
- `discussion.md` — grill-me record
- `preflight.md` — pre-implementation checklist
- `playwright.md` / `state-fixtures.md` — verification-repo mapping (project: `post-anki`, feature: `probe`)

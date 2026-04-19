# [Initiative] Judgment Training

**Priority:** low
**Phase:** 3 (only after gap map has data)

## What this unlocks for the user

The /decide mode: before asking AI for an architectural recommendation, the user
reasons through their own opinion first. The system evaluates the reasoning, not
the answer. Gaps in reasoning are added to the gap tracker.

This directly addresses the "AI relay" failure mode: user delegates thinking to AI
and stops forming judgment. /decide structurally prevents this by requiring opinion-first.

Example: "Should we use EventBridge or SQS for this workflow?" → user reasons through
constraints and tradeoffs → then system shows what they missed → gaps logged.

## Phase gate

Requires:
- Gap tracking (Phase 1) working and actively used
- Concept maturity model (Phase 1b) built, so the system knows what the user already knows
- At minimum 50+ gaps logged so the evaluation model has context

## Depends on

[Initiative] Knowledge Gap Map (gap context improves /decide evaluation quality)

## Enables

Nothing — this is the final capability tier.

## Epics within this initiative

1. [Epic] Opinion-first decision reasoning via Telegram
2. [Epic] Cross-ecosystem comparison in decisions (lowest priority)

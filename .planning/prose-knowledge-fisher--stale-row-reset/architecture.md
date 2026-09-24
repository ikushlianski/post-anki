# Architecture

## Non-goals
- Not a general audit/lease system for other tables — scoped to `knowledge_sources` only
- Not a cron job — runs inline at the top of the existing manual-trigger scan endpoint
- Not distinguishing "crashed" from "still genuinely running" beyond the fixed time threshold —
  no distributed lease/heartbeat mechanism, just a timestamp comparison

## Why reset to `pending`, not `failed`
A stale `processing` row was never actually attempted to completion — it's an infra accident
(crash, timeout, kill), not a real failure of the source's own content. Marking it `failed` would
permanently exclude it from re-scanning (per the existing repo functions' design: `failed` rows are
never claimed again). Resetting to `pending` lets the very next scan retry it, same as if it had
never been claimed.

## Why a code constant, not a config value
`STALE_PROCESSING_THRESHOLD_MS` is a deterministic safety net, not a tunable operational knob yet —
matches this item's sibling guardrails (`DETECT_BITS_BATCH_CAP`, `MAX_SOURCE_CHARS`) already being
hardcoded constants in `detect-knowledge-bits.orchestrator.ts`, not env vars.

## Guardrails (agentic-feature checklist, `ai-dev/docs/principles/001-building-agents.md`)
- **Never leaves a row stuck forever**: this is precisely the fix for that lesson, already learned
  once during `detect-knowledge-bits`'s own review.
- **Idempotent**: safe to call on every scan, including back-to-back manual triggers with nothing
  stale.
- **No silent data loss**: a reset row keeps its `rawText`/`kind`/etc. untouched — only `status` and
  `failureReason` change.

## Rollback
Schema change is additive (new `updatedAt` column with `defaultNow()`, backfills automatically for
existing rows on migration). No existing read path depends on this column not existing.

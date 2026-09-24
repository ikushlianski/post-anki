# Plan — stale-processing-row reset

## Problem
`knowledge_sources.status: "processing"` has no lease/timestamp. If a scan crashes or is killed
mid-source (after `claimPendingKnowledgeSources` flips a row to `processing`, before the source
reaches `bits_detected`/`failed`), that row stays `processing` forever — `claimPendingKnowledgeSources`
only selects `pending` rows, so nothing ever picks it up again. Known non-blocking finding from
`detect-knowledge-bits`'s review.

## Design
1. Add `updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()` to
   `knowledgeSources` (apps/api/src/db/schema.ts). Generate + apply migration.
2. Every write that changes a row's status (`claimPendingKnowledgeSources`'s claim UPDATE,
   `markKnowledgeSourceFailed`, `markKnowledgeSourceBitsDetected` / the new
   `insertKnowledgeBitsAndMarkDetected`) sets `updatedAt: new Date()` in its `.set()` call, so the
   column tracks "last time this row's status changed," not general row mutation.
3. New repo function `resetStaleProcessingKnowledgeSources(staleAfterMs, db?)`: one UPDATE —
   `status: "processing"` AND `updatedAt < now() - staleAfterMs` → `status: "pending"`,
   `failureReason: null`. Returns the count reset. Flipping back to `pending` (not `failed`) is
   deliberate — a stale claim is an infra/timeout accident, not a content problem; the next scan
   should just retry it, same as `.planning`'s existing "never invent a failure that isn't real"
   convention.
4. `detectKnowledgeBits` calls `resetStaleProcessingKnowledgeSources` once, before its claim loop —
   self-healing on every scan run, no separate cron/schedule needed (matches the item's own
   "manual trigger only, for now" non-goal already established for this pipeline).
5. `STALE_PROCESSING_THRESHOLD_MS = 15 * 60 * 1000` (15 minutes) — long enough that a real in-flight
   scan is never reclaimed out from under itself (single-source LLM calls run in low seconds to a
   few minutes with retries), short enough that a genuine crash self-heals within one scan-interval
   in practice.

## Guardrails
- Hard threshold in code, not a prompt/config value that could drift silently.
- Idempotent: re-running the reset when nothing is stale is a no-op (WHERE clause matches 0 rows).
- Never touches a genuinely in-flight row — the threshold is a deliberate multiple of expected
  single-source processing time, and per-source processing (Phase 2) is now sequential/one-at-a-time
  already, so no row is claimed-but-idle by design except on crash.

## Rollback
Additive: one nullable-turned-notNull column with a default, one new repo function, one new call
site at the top of an existing orchestrator. No behavior change for any row that isn't already
stuck.

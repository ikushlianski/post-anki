# Architecture — place-knowledge-bits

## Non-goals (Guarded tier, explicit)

- No automatic topic/module creation — `suggestedPlacement` is free text for later human review
  only, same shape as `domainTopicSuggestions`' pending-then-accept pattern
  (`apps/api/src/db/schema.ts:280-296`). A future item builds accept/reject.
- No promotion to `facts` via `insertFactWithTopic` — belongs to a separate later item ("Feed
  prose-sourced bits into the existing per-topic knowledge tracking").
- No edits to anything under `apps/api/src/biz-education-distiller/` — different direction's code,
  reused only by copying its output-contract shape, never modified or imported from.
- No topic-list shortlisting/embedding pre-filter — dev DB has 0 topics today; revisit only if a
  real topic count later makes "send the full list every call" too expensive.

## Rollback

Purely additive: 4 new nullable `knowledgeBits` columns (no FK), 2 new files (repo + orchestrator),
1 new agent file, 1 new route wired through router-table/router/server. Revert by dropping the
migration and removing the 3 route registrations — no data migration, no existing behavior changed.

## Accepted trade-off

Concurrent scan calls may double-classify the same bit (race between select and mark) — same
accepted, already-shipped trade-off as the tagging scan; marks are idempotent, no corruption risk.

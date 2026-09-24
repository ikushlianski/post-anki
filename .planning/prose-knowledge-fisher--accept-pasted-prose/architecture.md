# Architecture

## Non-goals
- Not building bit-detection, tagging, embedding, or hierarchy placement here — separate later items
- Not building any frontend input — backend endpoint only
- Not handling Notion as a source in this item — `kind: "notion"` is reserved but unimplemented here

## Why a new table, not reusing `facts` or `content_inbox`
`facts` and `content_inbox` are shaped around a single classified/placed unit of knowledge (one
topic-ready fact, or one inbox row awaiting a hierarchy decision). A pasted prose block is neither
— it's an unprocessed submission that a later step (bit-detection) will fan out into zero or more
`facts`-shaped rows. Overloading `facts.body` with raw multi-paragraph prose would break every
existing consumer of that table (embedding scans assume one topic-sized unit of text per row).

## Rollback
Additive only — one new table (`knowledge_sources`), one new route, two new files under
`apps/api/src/knowledge-source/`. No existing schema, route, or repo function is modified. Revert
by dropping the migration (if unapplied) and removing the route/file additions; nothing downstream
depends on this table yet since it's the first item in the direction.

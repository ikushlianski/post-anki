# Accept a pasted block of prose as a knowledge source

## Goal
Let the learner submit a raw block of prose (from a book, notes, etc.) and have it stored as a
knowledge source, ready for the next items in this direction (bit-detection, tagging, embedding)
to process. This item only covers accept + store — not detection, tagging, or placement.

## Design

New table `knowledge_sources` (schema.ts), same shape family as `facts`/`sources`:
- `id` (text, pk)
- `kind` (text, not null) — `"prose"` for this item; `"notion"` reserved for the next item
- `rawText` (text, nullable) — the pasted prose body, for `kind: "prose"`
- `status` (text, not null, default `"pending"`) — `"pending" | "processed"`; later items flip this
  to `"processed"` once bit-detection has run
- `createdAt` (timestamp with timezone, not null, default now)

No `embedding`/`tags`/`topicId` columns here — those belong to the knowledge-bit rows a later item
creates once prose is split into bits. This table is the submission record, not the bit itself.

API: `POST /knowledge-sources` with `{ "text": string }` body → validates non-empty trimmed text,
inserts a row with `kind: "prose"`, `status: "pending"`, returns the created row as JSON (201).

Follows the existing route-registration pattern exactly:
- `router-table.ts`: `{ method: "POST", pattern: "/knowledge-sources", name: "createKnowledgeSource" }`
- `router.ts`: add `"createKnowledgeSource"` to `RouteName`
- `server.ts`: add `case "createKnowledgeSource": return handleCreateKnowledgeSource(req, res);`
- New `apps/api/src/knowledge-source/knowledge-source.controller.ts` (parses/validates body, calls repo, sends JSON)
- New `apps/api/src/knowledge-source/knowledge-source.repo.ts` (`insertKnowledgeSource`)

## Files to touch
- `apps/api/src/db/schema.ts` — add `knowledgeSources` table
- `apps/api/src/db/migrations/` — new migration via `npm run db:generate` (apps/api), applied via `npm run db:migrate`
- `apps/api/src/knowledge-source/knowledge-source.repo.ts` — new
- `apps/api/src/knowledge-source/knowledge-source.controller.ts` — new
- `apps/api/src/knowledge-source/knowledge-source.repo.test.ts` — new (unit, mocked db per project convention)
- `apps/api/src/router-table.ts`, `apps/api/src/router.ts`, `apps/api/src/server.ts` — route wiring

## Non-goals (this item)
- No bit-detection, tagging, embedding, or hierarchy placement — later items in this direction
- No frontend UI — this is the backend accept endpoint only; a later item can add the paste-box UI
- No Notion-source handling — next item, separate `kind: "notion"` path

## Rollback
Purely additive: one new table, one new route, two new files. Reverting is deleting the migration
file (if not yet applied to a shared DB) or a follow-up down-migration, plus removing the route
wiring — no existing table/route is touched.

---
type: plan
branch: learn-from-doc-site
task: notion-deck-connectors--reading-notes-router
complexity: complex
state: draft
updated: 2026-09-19
---

# Notion reading-notes router

## What and why

The learner reads books and jots notes in Notion ("biz education", "INBOX"). Each note carries a
tag that decides where it goes: `SPA` → a fact in post-anki's production database (so it joins the
vectorize/label/chat pipeline); `CRM` → an item in the CRM repo's own backlog
(`/Users/ikushlianski/webdata/ilya-projects/crm/.planning/todo.md`). Untagged notes stay in Notion.
Runs every 15 minutes as a macOS LaunchAgent while the Mac is on — off means skipped, never
replayed; nothing is deployed. Notion access is the official SDK (`@notionhq/client`) with a token
from env, never the Claude-side MCP.

Judgment calls made autonomously (user AFK), each reversible:
- A `SPA` note becomes a new `facts` row, not a `notes` row — `notes` must hang off a topic/gap/source
  node, and a reading note has none. `facts` mirrors `topic_card_variants`' embedding columns so the
  existing vectorize pattern applies unchanged. Feeding facts into chat retrieval is a follow-on item.
- Tag detection: database rows → a `Tags` (multi-select) or `Tag` (select) property; paragraph pages →
  a leading `#TAG`, `[TAG]`, or `TAG:` token on the paragraph. Revisit once the real pages are visible.
- CRM items land under a `reading-notes` direction in crm's todo.md, created via todo-factory's
  `add-direction` if absent, always through the todo-factory CLI (never a direct file write).
- Idempotency via a `notion_sync_items` table keyed by Notion block/page id in post-anki's DB (the job
  already needs that DB for the SPA route).
- `removeAfterImport` is supported (archive the row / delete the block) but defaults to `false`, so the
  first token can stay read-only.

## Phases

### Phase 1: connector config and Notion reader
Goal: a Zod-validated `notion-connectors.json` at the repo root describes each connector
(`name`, `source: {kind: "page"|"database", id}`, `tag`, `destination`, `removeAfterImport`); a
read-only Notion reader turns a paragraph page or a database into a flat list of
`{ id, text, tags }` items using `@notionhq/client` (token from `NOTION_TOKEN`). Pure parsing
(block → text, tag extraction, tag filter) lives in `packages/core/src/notion-connector/` with unit
tests; the SDK call itself is a thin adapter in `apps/api/src/notion-connector/notion.client.ts`.
Key files: `notion-connectors.json` (repo root, sample with the two real sources commented as
placeholders), `packages/shared/src/notion-connector.ts` (config schema), `packages/core/src/
notion-connector/*.ts`, `apps/api/src/notion-connector/notion.client.ts`.

### Phase 2: destinations and idempotent sync
Goal: `facts` table + migration (`id, body, source, sourceRef unique, tags jsonb, embedding,
embeddingHash, embeddedAt, createdAt`), `notion_sync_items` table + migration; a
`runNotionSync()` orchestrator that, per connector, reads items, skips already-synced ids, routes
`fact` items into `facts` and `project-todo` items into the target repo's todo.md via
`node ~/.claude/skills/todo-factory/cli.ts add-item` (path overridable by `TODO_FACTORY_CLI`),
records each in `notion_sync_items`, and honours `removeAfterImport`. Exposed as
`npm run notion:sync -w @post-anki/api`. Real-Postgres integration tests for the fact route and
idempotency; the Notion client and the CLI call are mocked at the adapter boundary.
Key files: `apps/api/src/db/schema.ts` + migration, `apps/api/src/notion-connector/
notion-sync.orchestrator.ts`, `.repo.ts`, `apps/api/scripts/notion-sync.ts`.

### Phase 3: LaunchAgent
Goal: `scripts/notion-sync-agent/com.postanki.notion-sync.plist` (`StartInterval` 900,
`RunAtLoad` true, logs under `~/Library/Logs/post-anki/`) plus `scripts/notion-sync-agent/install.sh`
/ `uninstall.sh` that copy it into `~/Library/LaunchAgents` and `launchctl bootstrap` it. The runner
loads `NOTION_TOKEN`/`DATABASE_URL` from `apps/api/.env.local`. Not installed by this run — installing
needs the real token and the prod DB URL, which only the user has.
Key files: `scripts/notion-sync-agent/*`, a short section in the README.

## Constraints and risks

- Prod DB writes: the job targets whatever `DATABASE_URL` says; keep the write surface to `facts` and
  `notion_sync_items` only. Never touch cards/topics.
- `@notionhq/client` is not yet in ai-dev's TECH-STACK-BY-PROJECT.md — added here as a proposal to
  register; flagged for the user.
- Treat Notion text as untrusted input: it becomes DB rows and todo lines, never code or shell args
  (pass to the CLI via `execFile` argv, no shell).
- Rate limits: Notion allows ~3 req/s; a 15-minute cadence over two sources is far below that, but
  page reads paginate — follow `next_cursor`.

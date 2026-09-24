# Architecture

## Non-goals
- Not replicating biz-education's PA-tag filter or sync-marking — this is a generic bulk importer
  for any Notion database, a separate concern from that specific pipeline (it has its own dedupe
  key and its own, much larger, row cap suited to a one-shot import rather than a recurring sync)
- Not detecting bits, tagging, or placing rows into the hierarchy here — later items
- Not building a UI for entering a Notion database ID

## Dedupe, cap, and error-mapping (added after review round 1)
- `notionPageId` (unique-indexed) is the dedupe key: `.onConflictDoNothing({target: notionPageId})`
  means a repeat import of the same database only inserts pages not already pulled in — without
  this, re-running the import silently duplicated every row
- `MAX_ROWS_PER_IMPORT = 500` caps a single call so one request can't trigger an unbounded Notion
  crawl or an unbounded batch of pending rows feeding future LLM bit-detection cost
- The Notion-fetch step is wrapped in try/catch: a bad/inaccessible `dataSourceId` is a client input
  problem from this endpoint's perspective, so it returns 400, not an opaque 500

## Why reuse the Notion connector, not a new client
`apps/api/src/notion-connector/notion.client.ts` already wraps auth (`NOTION_TOKEN`) and exposes
`getNotionClient()`; `@post-anki/core`'s `itemsFromDatabaseRows` already turns raw Notion page rows
into `{id, text, tags}`. A second Notion client/parser would duplicate both for no reason — same
principle as the direction's Notes: "Reuse... biz-education's classifier... don't rebuild."

## Rollback
Additive: two nullable columns (`notionDatabaseId`, `notionPageId` unique-indexed), one new route,
one new controller file. No existing table, route, or biz-education-distiller file is touched.

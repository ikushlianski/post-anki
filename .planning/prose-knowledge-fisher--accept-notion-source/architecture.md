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
  this, re-running the import silently duplicated every row. Safe under concurrent/racing imports
  too (proved against real Postgres, not just simulated in a mock)
- `MAX_ROWS_PER_IMPORT = 500` caps a single call so one request can't trigger an unbounded Notion
  crawl or an unbounded batch of pending rows feeding future LLM bit-detection cost
- The Notion-fetch step is wrapped in try/catch, but only a narrow allowlist of error codes means
  "the dataSourceId is actually bad" — everything else re-throws to a real, logged 500

## Round-2 fixes (structured-verdict FAIL)
Round 1's fix still had two gaps a second review round found:
1. **The cap was applied after the Notion read, not before it** — `collectAllDataSourceRows`
   crawled the entire database into memory before the 500-row slice ran, so the resource-exhaustion
   risk (request time, memory, Notion API quota) was still unbounded. Fixed by switching to
   `iterateAllDataSourceRows` and breaking out of the loop once `MAX_ROWS_PER_IMPORT + 1` rows are
   collected — the read itself now stops at the cap, not just the insert.
2. **Every Notion-fetch failure mapped to 400**, including a missing `NOTION_TOKEN`, rate limiting,
   and genuine Notion outages — real bugs were silently reported to the caller as "bad id" and never
   reached the app's `request_failed` logger. Fixed with an explicit allowlist of Notion API error
   codes (`object_not_found`, `unauthorized`, `restricted_resource`, `validation_error`,
   `invalid_request_url`) that map to 400; every other error re-throws.
3. Rows past the cap were silently dropped with no signal to the caller. The response now includes
   `truncated: boolean` so a caller importing a database larger than the cap can tell.

## Why reuse the Notion connector, not a new client
`apps/api/src/notion-connector/notion.client.ts` already wraps auth (`NOTION_TOKEN`) and exposes
`getNotionClient()`; `@post-anki/core`'s `itemsFromDatabaseRows` already turns raw Notion page rows
into `{id, text, tags}`. A second Notion client/parser would duplicate both for no reason — same
principle as the direction's Notes: "Reuse... biz-education's classifier... don't rebuild."

## Rollback
Additive: two nullable columns (`notionDatabaseId`, `notionPageId` unique-indexed), one new route,
one new controller file. No existing table, route, or biz-education-distiller file is touched.

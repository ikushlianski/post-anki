---
type: plan
branch: learn-from-doc-site
task: biz-education-distiller--pipeline
complexity: complex
state: draft
updated: 2026-09-22
---

# Biz Education knowledge distiller

## What and why

A dedicated pipeline, separate from the generic `notion-deck-connectors` router: every 15 minutes,
pull up to 20 rows from the real "Biz Education" Notion database tagged `PA`, that haven't been
marked synced yet (the real `PostAnki Synced` date property, added directly to that database this
session — do not recreate it). Skip a row if its text contains a `?`. Classify each remaining row
with a cheap LLM call: does it fit an existing deck (topic), or does nothing fit? A fit becomes a
`fact` row linked to that topic. A non-fit becomes an inbox suggestion naming where in the current
hierarchy it might belong, for a human to place. Either way, mark the Notion row synced by writing
today's date into `PostAnki Synced` — never delete, never archive.

Real values already confirmed this session: data source `collection://3cddec4d-fc6e-805c-93ea-000bc235a121`;
its `Tags` multi-select really has a `PA` option; the `cheap` model tier already resolves to
`openrouter/deepseek/deepseek-v4-flash-latest` (`apps/api/src/mastra/model-tier.ts`) — reuse it via
`tierToModelId("cheap")`, do not add a new model or provider.

## Phases

### Phase 1: pull, filter, and pick the classification model
Goal: `apps/api/src/biz-education-distiller/biz-education.client.ts` — `listUnsyncedTaggedRows()`
using the existing `@notionhq/client` (mirror `notion.client.ts`'s pattern), filtering to `Tags`
contains `PA` and `PostAnki Synced` is empty, capped at 20, oldest `Created time` first. Skip a row
whose title/body text contains `?` (a plain `.includes("?")` check, pure function, unit-tested) —
put this filter in `packages/core/src/biz-education-distiller/` alongside the tag/question checks
so it's tested without a live Notion call. Model choice for classification: a one-line constant
`CLASSIFICATION_MODEL = tierToModelId("cheap")` — no new provider config, no comparison shopping;
the "cheapest working" requirement is already satisfied by the tier system's own existing choice.
Key files: `apps/api/src/biz-education-distiller/biz-education.client.ts`,
`packages/core/src/biz-education-distiller/{contains-question,is-pa-tagged}.ts`.

### Phase 2: classify, save facts, and file inbox suggestions
Goal: `facts` table gains a nullable `topicId` column (mirrors the no-FK convention already used
elsewhere in `schema.ts`) so a distilled fact can point at the deck it was classified into. A new
`content_inbox` table (`id, body, sourceRef unique, suggestedPlacement text, createdAt`) holds
unplaced rows. A classification call (one small Mastra agent or a direct `generateWithRetry` call —
match whichever existing pattern in `apps/api/src/mastra/` is simplest for a single structured
yes/no-plus-topic-id decision, reusing `CLASSIFICATION_MODEL`) is given the row's text plus a
compact list of existing subjects/curricula/topics (reuse existing repo read helpers, do not write
new hierarchy-listing SQL if one already exists) and returns either a matched `topicId` or a plain
`suggestedPlacement` string. `apps/api/src/biz-education-distiller/distiller.orchestrator.ts` wires
pull → filter → classify → (insertFact-with-topicId | insert content_inbox row) → mark synced, one
function per row, failures isolated per row like `notion-sync.orchestrator.ts`'s own pattern.
Key files: `apps/api/src/db/schema.ts` + migration, `apps/api/src/biz-education-distiller/
distiller.orchestrator.ts`, `.repo.ts`, `apps/api/src/facts/facts.repo.ts` (extend), a small route
in `apps/api` to list the inbox for display (reuse `sendJson`/router-table pattern, no new UI
required by this pass — a plain `GET /content-inbox` is enough).

### Phase 3: mark synced and schedule
Goal: `markRowSynced(pageId)` writes today's ISO date into `PostAnki Synced` via
`client.pages.update` (the existing `removeNotionItem`'s pages.update call already proves the
current token can write a page property — confirm this specific property write works against a
real row before wiring the schedule, since removeAfterImport's write path was only ever unit-tested
with a mocked client). Wire the whole pipeline into `scripts/notion-sync-agent/run.sh`'s existing
15-minute LaunchAgent as a second command after `notion:sync` (add
`npm run biz-education:distill -w @post-anki/api`), rather than inventing a second scheduler.
Key files: `apps/api/src/biz-education-distiller/distiller.orchestrator.ts` (mark-synced step),
`apps/api/scripts/biz-education-distill.ts` + package.json script, `scripts/notion-sync-agent/run.sh`.

## Constraints and risks

- Reuse, never fork: the Notion client pattern, the tag/pagination helpers, the cheap-tier
  resolver, and the fact-embedding pipeline already exist — this pipeline calls into them.
- Never remove or archive a Notion row — the only write is the `PostAnki Synced` date property.
- A row that fails classification (LLM error, malformed response) must not block the other 19 in
  the same run — isolate failures per row, same as the existing sync orchestrator.
- No UI is required by this pass; the inbox is a queryable list, not a page.

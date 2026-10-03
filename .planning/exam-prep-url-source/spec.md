---
type: spec
direction: exam-prep-from-sources
task: "Let a knowledge source be a web link, fetched safely and turned into text"
complexity: simple
tier: Briefed
state: planned
updated: 2026-10-03
---

# Plan: URL knowledge source

## What this is

`handleCreateKnowledgeSource` (`apps/api/src/knowledge-source/knowledge-source.controller.ts`)
accepts `{ text }` or `{ texts: [] }` only. Add a third accepted shape, `{ url }`, that fetches the
page safely, extracts readable text, and feeds it into the exact same
`insertKnowledgeSource(text)` path (`knowledge-source.repo.ts:13`, `kind: "prose"`) — no schema
change, no new `kind` value. The rest of the pipeline (bit detection, tagging, placement, Q&A
generation) is already kind-agnostic and needs no change.

## Facts (verified this session)

- Safe outbound fetch already exists and must be reused: `fetchWithTimeout` /
  `guardedFetchText` (`apps/api/src/shared/outbound-fetch.ts`, `shared/guarded-fetch.ts`) —
  SSRF-guarded. Do not call `fetch` directly.
- No HTML-to-text extraction library is installed anywhere in the repo (`apps/api/package.json`
  has no `cheerio`/`html-to-text`/`jsdom`/`turndown`). `doc-link-grounding.ts`'s crawler never
  extracts readable text from a real HTML page either (`fetchedText: null` for any non-`llms.txt`
  candidate) — there is nothing to reuse here.
- **Decision**: add the `html-to-text` npm package (actively maintained, no native deps,
  widely used) to `apps/api/package.json` rather than hand-rolling tag-stripping. Logged as a
  default judgment call for this run's report, not silently decided — add it to
  `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md`'s post-anki entry too.
- `knowledge_sources.rawText` already stores arbitrary prose text with no length enforcement
  beyond the controller's existing `max(50_000)` Zod cap — reuse the same cap on extracted text.

## Decision — minimal shape

```ts
const urlInput = z.object({ url: z.string().url() });
```

Branch in `handleCreateKnowledgeSource` alongside the existing batch/single branches: body has
`url` (and no `text`/`texts`) → fetch via `fetchWithTimeout(url, <timeout>)`, convert with
`html-to-text`'s `convert()`, trim, cap at 50_000 chars (reuse `truncateText`), 400 on empty
extracted text or fetch failure (`{error: "fetch_failed"}` / `{error: "empty_content"}`), otherwise
`insertKnowledgeSource(extractedText)` exactly as the plain-text path does today.

## Out of scope

- Multi-page crawling (doc-site-ingestion's frozen job).
- Any new `kind` value or schema column — traceability back to the source URL is not required by
  this item's own text.
- The add-knowledge UI's link field — separate todo item, separate unit.

## Quality gates

1. `npx tsc --noEmit` clean for `apps/api`.
2. New test coverage in `knowledge-source.controller.test.ts`: a `{url}` body inserts a source with
   the extracted text; a fetch failure returns 400 and inserts nothing; HTML tags are stripped from
   the stored text (not just passed through raw).

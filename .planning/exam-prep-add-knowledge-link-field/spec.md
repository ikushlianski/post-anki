---
type: spec
direction: exam-prep-from-sources
task: "Add a link field to the add-knowledge screen alongside paste"
complexity: simple
tier: Briefed
state: planned
updated: 2026-10-03
---

# Plan: add-knowledge link field

## What this is

`AddKnowledgeForm` (`apps/web/src/knowledge-source/add-knowledge-form.tsx`) lets the learner paste
one or more blocks of prose, each a plain `<textarea>`. The backend now also accepts a URL as a
knowledge source (`POST /knowledge-sources` with `{url}`, landed this run —
`apps/api/src/knowledge-source/knowledge-source.controller.ts:14,27-53`). Give each block a
per-block type toggle — "Paste text" / "Add link" — so a block is either pasted prose or a URL,
submitted through the matching endpoint.

## Facts (verified this session)

- `createKnowledgeSource(text)` / `createKnowledgeSources(texts)` in
  `apps/web/src/curriculum/api-client.ts:541-547` POST `{text}` / `{texts}` respectively — no
  existing client function posts `{url}`.
- The server already rejects a mixed `{url, text}` body (400, `.strict()` schema) — so a url block
  must always be submitted as its own `{url}`-only request, never merged with text blocks into the
  batch endpoint.
- There is no batch-url backend endpoint — url blocks are submitted one at a time via the existing
  single-source endpoint's new `{url}` shape.
- `knowledge-source.api.ts`'s two `createServerFn` wrappers validate `string`/`string[]` inputs —
  a third wrapper is needed for the url shape.

## Decision — minimal per-block toggle

Each block becomes `{ type: 'text' | 'url'; value: string }` instead of a bare string. A small
toggle (two buttons or a `<select>`, matching this file's existing plain-button style) next to each
block switches its `type`; the `<textarea>` becomes a single-line `<input type="url">` when
`type === 'url'`. On submit: partition non-empty blocks by type — text blocks go through the
existing single/batch logic unchanged; each url block is submitted individually via a new
`createKnowledgeSourceFromUrl(url)` call (new server fn + new `api-client.ts` function mirroring
the existing pair). Collect successes/failures across all submitted blocks (text batch + url
singles) into one combined success/error message — reuse the existing `successMessage`/`error`
state, don't add a second pair.

## New functions (mirroring existing patterns exactly)

- `apps/web/src/curriculum/api-client.ts`: `createKnowledgeSourceFromUrl(url: string)` — POSTs
  `{url}` to `/knowledge-sources`, same shape as the two existing functions.
- `apps/web/src/knowledge-source/knowledge-source.api.ts`: a third `createServerFn`, validating
  with `z.string().url()`.

## Out of scope

- A batch endpoint for multiple URLs at once — out of scope for this item, each url block submits
  individually.
- The mock-exam feature itself — separate, later todo item.

## Quality gates

1. `npx tsc --noEmit` clean for `apps/web`.
2. `apps/web/src/routes/-add-knowledge.test.tsx` (or the component's own test file) gets new
   coverage: a url block submits via the new endpoint, not the text one; a mixed text+url
   submission succeeds and reports a combined count; a failed url submission shows the existing
   error message, not a silent drop.
3. Verify in a real browser via `/check-ui` once implemented (toggle between paste/link, submit
   each) before marking done — this skill's own Step 5 rule for anything user-facing.

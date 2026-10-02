---
type: spec
branch: learn-from-doc-site
task: add-knowledge-screen
complexity: complex
state: confirmed
updated: 2026-10-03
---

# Spec: Paste-knowledge web screen

### Summary
A new web route where a learner pastes one or more blocks of plain-text prose and submits
them as knowledge sources. The API already supports both shapes (`POST /knowledge-sources`
with `{ text }` or `{ texts: string[] }`, apps/api/src/knowledge-source/knowledge-source.controller.ts) —
no web surface calls it yet. This closes that gap.

### Implementation order
1. `apps/web/src/curriculum/api-client.ts` — add `createKnowledgeSource(text)` and
   `createKnowledgeSources(texts)`, mirroring `createSubject` (api-client.ts:529-531).
2. `apps/web/src/knowledge-source/knowledge-source.api.ts` — new file, `createServerFn` wrappers
   mirroring `subject.api.ts`'s `createSubject` export.
3. `apps/web/src/knowledge-source/add-knowledge-form.tsx` — new form component, one textarea per
   block, "+ Add another block" button, "Remove" per extra block, single submit button.
4. `apps/web/src/routes/add-knowledge.tsx` — new thin route shell, mirrors `subjects.new.tsx`.
5. `apps/web/src/nav/sidebar.tsx` — add one `Link` to `/add-knowledge`, same flat style as the
   existing two links (sidebar.tsx:13-21).
6. `apps/web/src/routes/-add-knowledge.test.tsx` — RTL test, `-` prefix per this repo's router-
   ignore convention (matches `-probe.tag.$tagId.test.tsx`).

### Decisions made autonomously
- One textarea per block, not one textarea with blank-line splitting — matches the API's
  `string[]` shape directly, avoids guessing a delimiter convention. Reversible.
- Blank/whitespace-only blocks are silently dropped before submit (mirrors the controller's own
  trim+filter), not blocked with an inline error — one empty extra block shouldn't block the
  whole submission. Submitting with every block empty is blocked (disabled submit button).
- Single block always submits via `{ text }` (not `{ texts: [one] }`) — preserves the existing
  single-source code path and its exact validation-error messages, no behavior change for the
  common case.
- On success, shows an inline confirmation and clears the form (stays on the same screen) rather
  than navigating away — the detector pipeline runs async, there's no "detail page" to land on yet.
- Route path `/add-knowledge`, nav label "Add knowledge" — plain, consistent with the existing
  "Answer knowledge bits" link's naming style.

### Scope boundary
- No "add from Chrome extension" or "add from bot" work — those are separate, out of scope here.
- No per-source status/progress UI on this screen (that's `ingestion-progress-visibility`'s scope).

---
type: spec
branch: To-Learn-List
task: content library — cross-curriculum source listing, duplicate detection, re-fetch
complexity: complex
state: draft
updated: 2026-08-08
---

# Spec: content library

### Summary

Every `sources` row already carries provenance (`curriculumId`) and a fetched body
(`fetchedText`), but nothing lists them across curricula, and "fetch state" can't actually be read
back today — a null `fetchedText` is indistinguishable from "never attempted" vs. "attempted and
failed." This module adds `lastFetchedAt`/`lastFetchOutcome` to `sources` so state is real, then a
cross-curriculum listing, then duplicate detection in two cheap-to-expensive tiers: exact
normalized-URL matches first (free), then embedding similarity for same-content-different-URL
(mirrors `subject-duplicate`'s embed/hash/compare pipeline almost verbatim — `findDuplicatePairs`,
`cosineSimilarity`, and `selectSubjectsForScan` are reused directly from `@post-anki/core`, not
reimplemented). Duplicate suggestions are reporting-only: resolving one only changes the
suggestion's own status, never merges or deletes a source, because `topics.sourceId` provenance
depends on that source row surviving — a silent merge would orphan the exact link a declined
liveness nudge needs to make the right content dormant. Re-fetch goes through the existing
SSRF-guarded `resolveSourceText`/`guarded-fetch.ts` path, and a failed re-fetch never overwrites a
previously-good body.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Fetch state | S8, S9 | `sources.lastFetchedAt`/`lastFetchOutcome` columns; `resolveFetchState` | None yet | None | Single column read, no join |
| 2 — Listing | S1, S2 | `content-library.repo.ts` cross-curriculum listing with provenance + fetch state | None yet | Phase 1 | One query joined to curricula/subjects, no N+1 |
| 3 — Duplicate detection | S3, S4, S5, S10 | `normalizeSourceUrl`, `findExactUrlDuplicates`, `hashSourceContent`, `source-duplicate.orchestrator.ts` (reuses `findDuplicatePairs`/`selectSubjectsForScan`/`cosineSimilarity` from `@post-anki/core`) | None yet | Phase 2 | Embedding call capped, exact-match tier is a plain scan |
| 4 — Re-fetch | S6, S7 | `content-library.service.ts` re-fetch (delegates to `resolveSourceText`, writes fetch state, never clobbers `fetchedText` on failure) | None yet | Phase 1 | Reuses existing guarded fetch, no new network path |
| 5 — Web | S11 | None | library browser, duplicate suggestion review, re-fetch action | Phases 1–4 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `normalizeSourceUrl` | raw URL string | normalized string (lowercased host, stripped query/fragment/trailing slash), or `null` if unparsable | S3, S10 |
| `findExactUrlDuplicates` | `sources: {id, normalizedUrl}[]` | pairs sharing a non-null normalized URL, canonical-ordered like `findDuplicatePairs` | S3 |
| `hashSourceContent` / `buildSourceContentText` | `title, fetchedText` | content hash / the exact text sent to embeddings — mirrors `content-hash.ts`'s subject-scoped functions, re-typed for sources | S4, S10 |
| `resolveFetchState` | `{fetchedText, lastFetchedAt, lastFetchOutcome}` | `"fetched" \| "stale_failed" \| "never_fetched"` for the library UI | S8, S9, S11 |
| *(reused, unmodified)* `findDuplicatePairs`, `cosineSimilarity`, `selectSubjectsForScan` | from `@post-anki/core`'s `subject-duplicate` module — already generic over `{id, embedding}`/`{id, contentHash, cachedHash}` | duplicate pairs / scan batching | S4, S10 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `apps/api/src/content-library/content-library.repo.ts` (cross-curriculum join to `curricula`/`subjects`), `content-library.controller.ts` (`GET /sources`) | None yet | None |
| S2 | `content-library.repo.ts` (provenance fields: curriculum name, subject name) | None yet | None |
| S3 | `packages/core/src/source-duplicate/normalize-url.ts` (`normalizeSourceUrl`, `findExactUrlDuplicates`) | None yet | None |
| S4 | `packages/core/src/source-duplicate/content-hash.ts` (`hashSourceContent`, `buildSourceContentText`); `apps/api/src/source-duplicate/source-duplicate.orchestrator.ts` (imports `findDuplicatePairs`/`selectSubjectsForScan`/`cosineSimilarity` from `@post-anki/core` unmodified), `embeddings-client.ts` (new, thin copy of the subject-duplicate client's request shape, source-scoped) | None yet | None |
| S5 | `apps/api/src/source-duplicate/source-duplicate.repo.ts` (`resolveSourceDuplicateSuggestion` — status only, no merge/delete) | None yet | None |
| S6 | `apps/api/src/content-library/content-library.service.ts` (`refetchSource`, delegates to `apps/api/src/curriculum/source-fetch.ts::resolveSourceText`, unmodified) | None yet | None |
| S7 | `content-library.service.ts` (writes `lastFetchedAt`/`lastFetchOutcome`; `fetchedText` write is conditional on outcome `"ok"`) | None yet | None |
| S8 | `apps/api/src/db/schema.ts` (new columns), `content-library.repo.ts` (`resolveFetchState`) | None yet | None |
| S9 | `packages/core/src/content-library/fetch-state.ts` (`resolveFetchState`) | None yet | None |
| S10 | `packages/core/src/source-duplicate/*.test.ts` | None | None |
| S11 | None (uses S1–S7 endpoints) | `apps/web/src/content-library/library-browser.tsx`, `duplicate-suggestion-list.tsx`, `content-library.api-client.ts`, `content-library.model.ts`; `apps/web/src/routes/content-library.tsx` | None |

### Files to create

```
packages/core/src/source-duplicate/     — normalizeSourceUrl, findExactUrlDuplicates, hashSourceContent, buildSourceContentText + tests
packages/core/src/content-library/      — resolveFetchState + tests
packages/shared/src/content-library.ts  — zod: library source row, fetch-state enum, re-fetch result
packages/shared/src/source-duplicate.ts — zod: source duplicate suggestion, resolve input
apps/api/src/content-library/           — content-library.controller.ts, content-library.repo.ts, content-library.service.ts
apps/api/src/source-duplicate/          — source-duplicate.controller.ts, source-duplicate.repo.ts, source-duplicate.orchestrator.ts, embeddings-client.ts
apps/web/src/content-library/           — library-browser.tsx, duplicate-suggestion-list.tsx, content-library.api-client.ts, content-library.api.ts, content-library.model.ts
apps/web/src/routes/content-library.tsx — library browser route
```

### Files to modify

```
apps/api/src/db/schema.ts               — sources gains lastFetchedAt/lastFetchOutcome/embedding/embeddingHash/embeddedAt; new source_duplicate_suggestions table (see Data model changes)
apps/api/src/router.ts                  — /sources, /source-duplicate-suggestions routes (resource-named, plural)
packages/core/src/index.ts              — export ./source-duplicate/index, ./content-library/index
packages/shared/src/index.ts            — export ./content-library, ./source-duplicate
apps/web/src/router.tsx                 — /content-library route + nav link
```

### Data model changes

- New columns on `sources`: `lastFetchedAt` (timestamp, nullable — never attempted), `lastFetchOutcome`
  (text, nullable, app-level validated: `"ok"|"blocked"|"http_error"|"network_error"`), `embedding`
  (jsonb `number[]`, nullable), `embeddingHash` (text, nullable), `embeddedAt` (timestamp, nullable)
  — the last three mirror `subjects.embedding`/`embeddingHash`/`embeddedAt` exactly, for the same
  don't-re-embed-unchanged-content cache `selectSubjectsForScan` already assumes.
- New: `source_duplicate_suggestions` (`id`, `sourceAId`, `sourceBId`, `similarity` nullable (null
  for an exact-URL match, a real float for an embedding match), `matchKind`
  [`"url_match"|"embedding_similarity"`], `reason`, `status` default `"pending"`
  [`"pending"|"acknowledged"|"dismissed"`], `createdAt`, `resolvedAt`) — mirrors
  `subject_duplicate_suggestions` shape and its partial unique index on the pending pair
  (`source_duplicate_suggestions_pending_pair_unique`), same race-guard rationale.
- No changes to `topics.sourceId` or any other existing FK-by-value column — see Decisions on why
  resolving a suggestion never touches it.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.

### Documentation changes

- Learning domain: new component doc for the content library (cross-curriculum listing, fetch
  state, duplicate detection, re-fetch).
- Update `docs/architecture/`'s SSRF/guarded-fetch note (if one exists from the intake module) to
  list re-fetch as a third caller of `guarded-fetch.ts`, alongside capture and lecture-candidate
  compile.

### BAML test coverage

Not applicable — no BAML functions touched. Duplicate detection calls the OpenRouter embeddings
REST endpoint directly (same as `subject-duplicate`), not a Mastra Agent or BAML function.

### Decisions made autonomously

- **Duplicate suggestions are reporting-only — resolving one never merges or deletes a source.**
  `subject-duplicate`'s precedent (`mergeSubjects`) is NOT followed here: `topics.sourceId` is a
  provenance link the learning-list-intake module depends on (a declined nudge makes the right
  content dormant by tracing back through it). Auto-merging two source rows would silently orphan
  that link for any topic pointing at the "losing" source. `status` only ever moves
  `pending → acknowledged|dismissed`.
- **Two duplicate tiers, cheapest first.** Exact normalized-URL matches (`findExactUrlDuplicates`)
  cost nothing and run on every listing read; embedding-similarity (same pipeline as
  `subject-duplicate`) only runs on an explicit "scan for duplicates" action, capped like that
  module's own `EMBEDDING_CAP`. A same-normalized-URL match across two different curricula is
  still surfaced (not silently treated as "expected provenance and therefore invisible") — it is
  useful information ("you already have this exact article, fetched separately, in two places"),
  even though it is not itself evidence of a mistake.
- **`findDuplicatePairs`, `cosineSimilarity`, and `selectSubjectsForScan` are imported directly
  from `@post-anki/core`'s existing `subject-duplicate` module, unmodified** — all three already
  operate on generic `{id, ...}` shapes with no subject-specific field names, so writing
  source-scoped copies would be a second implementation of the exact same math. Only
  `hashSourceContent`/`buildSourceContentText` get source-scoped versions (in a new
  `source-duplicate/` folder, not by editing `subject-duplicate/content-hash.ts`), since content-hash
  is meaningfully different content (title+fetchedText vs. name+description).
- **A failed re-fetch never overwrites `fetchedText`.** `guardedFetchText` can return `blocked`,
  `http_error`, `network_error`, or a `truncated` success — `content-library.service.ts` always
  writes `lastFetchedAt`/`lastFetchOutcome`, but only writes a new `fetchedText` when the outcome is
  `"ok"`. A transient failure on re-fetch must never destroy a previously-good body.
- **Fetch state needs its own columns — `fetchedText IS NULL` is not enough.** A source that was
  fetched and failed (leaving `fetchedText` null, per `source-fetch.ts`'s current placeholder-text
  behavior) is indistinguishable from "never attempted" without `lastFetchedAt`/`lastFetchOutcome`.
  This makes Module 5's migration the heaviest of the four in this batch — five new columns plus one
  new table — flagged explicitly for sequencing (see the overall collision note).
- **Re-fetch reuses `resolveSourceText`/`guarded-fetch.ts` unmodified** — no second fetch path, per
  the task's explicit constraint. `content-library.service.ts` calls it exactly the way
  `lecture.orchestrator.ts::compileLecture` already does for candidate re-fetch.

### Implementation order

1. Schema: `sources` new columns, `source_duplicate_suggestions`; generated migration
2. `normalizeSourceUrl`, `findExactUrlDuplicates`, `hashSourceContent`, `buildSourceContentText`,
   `resolveFetchState` — derivers, unit-tested against fixtures
3. `content-library.repo.ts` (cross-curriculum listing + fetch state), `content-library.controller.ts`
4. `content-library.service.ts` (re-fetch, delegates to `resolveSourceText`, conditional write)
5. `source-duplicate/embeddings-client.ts`, `source-duplicate.orchestrator.ts` (imports
   `findDuplicatePairs`/`selectSubjectsForScan`/`cosineSimilarity` unmodified)
6. `source-duplicate.repo.ts` (insert-if-new, resolve status-only), `source-duplicate.controller.ts`
7. Router wiring (`GET /sources`, `POST /sources/:id/refetch`, `GET/PATCH /source-duplicate-suggestions`)
8. Web: library browser, duplicate suggestion list, re-fetch action

### Scope boundary

- No automatic merge or deletion of a source from a duplicate suggestion — reporting only, see
  Decisions.
- No scheduled/background duplicate scan — triggered explicitly from the library browser, same
  "on-demand, capped" posture as `subject-duplicate`'s own scan button.
- No file/PDF sources in this module — re-fetch and dedupe apply to `link`/`text` kinds only,
  matching the intake module's own scope boundary (#92 tracks file upload separately).
- No transcript re-fetch for video-kind items — the pasted description remains the source, per the
  intake module's decision; this module's re-fetch only applies to `link` sources with a real URL.
- No cross-user/shared library — single-user product, this is one person's own captured sources.

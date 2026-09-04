# Global search by name

## What and why
No way today to jump to a subject, curriculum, or topic by name from anywhere in the app — you
have to navigate the tree. Adds one always-visible search entry point that queries all three
entity types at once and links to the result.

## Phases

### Phase 1: Backend — combined /search endpoint
Goal: one endpoint returning name matches across subjects, curricula, and topics, grouped by type.
Key files:
- New module `apps/api/src/search/` (mirrors `apps/api/src/push/`'s precedent for a module that
  legitimately spans multiple entities) — `search.repo.ts` with `searchSubjects(query)`,
  `searchCurricula(query)`, `searchTopics(query)`, each a plain `ILIKE '%query%'` on the name/title
  column. No migration, no new index, no pg_trgm/tsvector — dataset is small (single-user app,
  low-thousands of rows at most), a plain ILIKE scan is fine. Reuse
  `normalizeSearchQuery` from `packages/core/src/note/search-query.ts:1` as-is (trim + null-on-empty)
  rather than relocating it.
- `searchCurricula` MUST exclude container curricula the same way `listCurricula`
  (`apps/api/src/curriculum/curriculum.repo.ts:114-133`) already does via `containerAreaNodeId` —
  otherwise taxonomy/container rows leak into results (the same bug class
  `dashboard-excludes-taxonomy-seeded-curricula.test.ts` already locks down elsewhere).
- `search.controller.ts` — `handleSearch(res, query)`, calls all three in parallel, returns
  `{ subjects: [], curricula: [], topics: [] }` (grouped by type, not one flat ranked list — avoids
  inventing a cross-entity relevance score).
- Wire `GET /search?q=` through `router-table.ts`/`router.ts`/`server.ts`, same 3-file pattern as
  `/due-queue`.
- Wire type in `packages/shared/src/` — normalize the field name: topics use `title`,
  subjects/curricula use `name`; the wire type should expose one common field (e.g. `label`) so the
  frontend never branches on entity type to pick which property to render.
- Topic results include `curriculumId` (already on the row, no join needed) so the frontend can link
  to the topic's parent curriculum.

### Phase 2: Frontend — search box in the root header
Goal: an always-visible search entry point, results grouped by type, each linking to the right page.
Key files:
- `apps/web/src/routes/__root.tsx:50-79` — add a search input/icon in the header row (between the
  logo and the mobile-nav toggle), following the existing notes-search pattern
  (`apps/web/src/note/notes-search-form.tsx`) for the input/debounce shape, but this is app-wide,
  not scoped to one route.
- New API client call `search(query)` calling `GET /search`.
- Results grouped by type (Subjects / Curricula / Topics), each row linking: subjects →
  `/subject/$subjectId`, curricula → `/curriculum/$curriculumId`, topics → their PARENT
  `/curriculum/$curriculumId` (topics have no standalone detail route — do not add a
  scroll-to-row/anchor mechanism, out of scope for "search by name").
- `data-testid="global-search-input"`, `data-testid="global-search-results"`,
  `data-testid="global-search-result-<entityType>-<id>"` per row.
- User-facing — write a RED Playwright test first, in `verification-repo`'s
  `projects/post-anki/post-anki/features/` (post-anki's own repo has no locked e2e tests — see
  `docs/memories/e2e-local-convention.md`), following the same real templates used for the
  due-today-queue test (`features/probe/tests/due-queue-cross-subject/test.ts` as the template for
  cross-entity seeding + assertions). Scenario: seed one subject, one curriculum (non-container),
  one topic, each with a distinct stamped name; search for each name; assert the matching result
  appears, links to the right route, and a container curriculum seeded with a matching name does
  NOT appear.

## Constraints and risks — explicit judgment calls, recorded here not silently decided
- **Dormant curricula ARE included in search results** (unlike `gatherPushCandidates`, which
  excludes them via `listDormantEntityIds` for the study/push flow) — search is a navigation aid,
  not a study queue, so a dormant curriculum should still be findable by name.
- **Topics are NOT filtered to `included: true`** — same reasoning; search should find any topic
  that exists, not just ones currently included in active study.
- Container curricula are excluded (not a judgment call — matches existing `listCurricula`
  behavior and the existing locked test for the same bug class).
- No migration, no new DB index — plain `ILIKE` is sufficient at this app's scale. Revisit only if
  a real perf problem shows up later.

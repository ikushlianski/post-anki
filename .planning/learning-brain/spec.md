---
type: spec
branch: To-Learn-List
task: notes and highlights (the "learning brain") — capture, search, pull-only review
complexity: medium
state: draft
updated: 2026-08-08
---

# Spec: learning brain (notes and highlights)

### Summary

A note or highlight can be captured against a topic, a gap, or a source — one polymorphic table,
following the existing `tag_assignments`/`node_feedback`/`study_item_feedback` convention rather
than inventing a new shape. Search is native Postgres full-text (`tsvector` + GIN), filterable by
taxonomy subtree and cross-cutting concern, with no new dependency. The sharp design question is
2.3: surfacing the user's own notes as review material sits close to the rejected AI-auto-gap
pattern (`.product/REJECTED.md`). The resolution is that review stays strictly PULL-only — reachable
only by the user opening the notes browser himself, shown one note at a time verbatim (nothing
generated from it), with no counter, badge, or backlog state anywhere. Nothing accumulates because
nothing is queued; nothing is owed because nothing is pushed. This differs from the rejected pattern
in kind, not degree: the rejected pattern was AI silently inventing debt; this is the user rereading
his own words, entirely on his own initiative.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Capture | S1–S4 | `notes` table, capture endpoint, repo | None yet | None | Single insert, no LLM call |
| 2 — Search | S5–S8 | `search_vector` + GIN, `normalizeSearchQuery`, taxonomy + concern filters | None yet | Phase 1 | GIN-indexed query, no seq scan |
| 3 — Review | S9–S12 | `selectNoteForReview`, pull-only review endpoint, `lastSurfacedAt` write | None yet | Phase 1 | Read-time selection, zero stored queue |
| 4 — Web | S13–S14 | None | Capture box in study views; notes browser (search + filters + review tab) | Phases 1–3 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `normalizeSearchQuery` | raw query string | trimmed non-empty string, or `null` when empty/whitespace-only | S8 |
| `resolveNoteTaxonomySubtree` | filter node id, `nodes: DomainNodeRef[]`, candidate note→domain-node ids | filtered note ids inside the subtree — same `MAX_DEPTH`-capped, cycle-safe BFS pattern as `domainNodeProgress` | S6, S12 |
| `selectNoteForReview` | candidate notes `{id, lastSurfacedAt, createdAt}[]`, `now`, `excludeIds` | one note id (never-surfaced first, then oldest `lastSurfacedAt`, tie on `createdAt`), or `null` | S9, S11 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `apps/api/src/note/note.controller.ts` (`POST /notes`), `note.repo.ts`; `packages/shared/src/note.ts` | `apps/web/src/note/note-capture-box.tsx` (embedded from `apps/web/src/curriculum/topic-row.tsx`) | None |
| S2 | Same controller/repo, `nodeType: "gap"` validated against `apps/api/src/gap/gap.repo.ts` reads | `note-capture-box.tsx` embedded in `apps/web/src/curriculum/weak-strong-list.tsx` | None |
| S3 | Same controller/repo, `nodeType: "source"` validated against curriculum source reads | `note-capture-box.tsx` embedded in `apps/web/src/curriculum/source-rows-editor.tsx` | None |
| S4 | `note.controller.ts` / `note.repo.ts` carry no import from `gap.repo.ts`'s write functions (architectural negative, verified by code review, not a runtime check) | None | None |
| S5 | `apps/api/src/note/note-search.repo.ts` (`to_tsvector`/`ts_rank`, GIN), `note.controller.ts` (`GET /notes/search`) | None yet | None |
| S6 | `note-search.repo.ts` (`resolveNoteTaxonomySubtree`), reads `apps/api/src/curriculum-domain-mapping/` | None yet | None |
| S7 | `note-search.repo.ts` (concern filter), `packages/shared/src/note.ts` (`concern` optional field) | None yet | None |
| S8 | `packages/core/src/note/search-query.ts` (`normalizeSearchQuery`), `note.controller.ts` short-circuit | None yet | None |
| S9 | `packages/core/src/note/note-review.ts` (`selectNoteForReview`), `apps/api/src/note/note-review.service.ts` (`GET /notes/review`), `note.repo.ts` (`lastSurfacedAt` write) | None yet | None |
| S10 | `apps/api/src/push/push.repo.ts` / `push.controller.ts` — explicitly UNCHANGED, no `notes` reference added | None yet | None |
| S11 | `packages/core/src/note/note-review.test.ts` | None | None |
| S12 | `apps/api/src/note/note-search.repo.ts` (subtree pattern, referencing `packages/core/src/domain-map/domain-map-progress.ts`) | None | None |
| S13 | None (uses S1–S3 endpoints) | `apps/web/src/note/note-capture-box.tsx` wired into `probe-room-drawer.tsx`, `topic-row.tsx`, `weak-strong-list.tsx`, `source-rows-editor.tsx` | None |
| S14 | None (uses S5–S9 endpoints) | `apps/web/src/note/notes-browser.tsx`, `notes-review-card.tsx`, `note.api-client.ts`, `note.model.ts`; `apps/web/src/routes/notes.tsx` | None |

### Files to create

```
packages/core/src/note/                — normalizeSearchQuery, resolveNoteTaxonomySubtree, selectNoteForReview + tests
packages/shared/src/note.ts            — zod schemas: note, capture input, search query/filters, review candidate
apps/api/src/note/                     — note.controller.ts, note.repo.ts, note-search.repo.ts, note-review.service.ts
apps/web/src/note/                     — note-capture-box.tsx, notes-browser.tsx, notes-review-card.tsx, note.api-client.ts, note.api.ts, note.model.ts
apps/web/src/routes/notes.tsx          — notes browser route
```

### Files to modify

```
apps/api/src/db/schema.ts              — notes table (see Data model changes); nothing existing dropped
apps/api/src/router.ts                 — /notes routes (resource-named, plural)
packages/core/src/index.ts             — export ./note/index
packages/shared/src/index.ts           — export ./note
apps/web/src/router.tsx                — /notes route + nav link
apps/web/src/curriculum/topic-row.tsx, weak-strong-list.tsx, source-rows-editor.tsx, probe-room-drawer.tsx — embed note-capture-box.tsx
```

### Data model changes

- New: `notes` (`id`, `nodeType` text ["topic"|"gap"|"source"], `nodeId` text, `body` text,
  `isHighlight` boolean default false, `concern` text nullable, `searchVector` tsvector,
  `lastSurfacedAt` timestamp nullable, `createdAt`, `updatedAt`). No `.references()` FK, matching
  `tag_assignments`/`node_feedback` convention. Indexes: GIN on `searchVector`; btree on
  `(nodeType, nodeId)` for "notes attached to this thing" lookups.
- No changes to any existing table.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.
  `searchVector` is populated at APPLICATION write time (a `sql` expression on insert/update inside
  `note.repo.ts`), not a DB-generated column or trigger — this schema has no precedent for either,
  and a plain-write keeps every write path visible in TypeScript.

### Documentation changes

- Learning domain: new component doc for notes/highlights capture, search, and pull-only review.
- Study-loop domain: update to note that notes-review is a pull-only, non-nagging surface,
  cross-referencing `.product/REJECTED.md`'s AI-auto-gap rejection to explain why review never
  generates content and is never pushed.

### Decisions made autonomously

- **One polymorphic `notes` table**, not three (`notes_on_topics`/`notes_on_gaps`/`notes_on_sources`)
  — reuses the `tag_assignments`/`node_feedback`/`study_item_feedback` `nodeType`/`nodeId` convention
  already established three times in this schema. One search index, one capture endpoint, one review
  pool.
- **Highlight is a boolean flag (`isHighlight`) on the same row**, not a separate entity — a
  highlight and a note are mechanically identical (captured text at a point); splitting them would
  double the capture/search/review code path for zero behavioral difference.
- **Full-text search is native Postgres (`tsvector`/`ts_rank`/GIN)**, no new dependency, per the
  task's explicit design note. `searchVector` is maintained at write time in application code rather
  than a DB-generated column — see Data model changes for why.
- **Review is PULL-ONLY** — the load-bearing decision resolving the tension in the task brief. It
  never rides `/daily-push`, a liveness nudge, or the Telegram bot; it is reachable only by the user
  opening the notes browser. This is what makes surfacing "your own notes as study material" safe
  from `.product/REJECTED.md`'s failure mode: that rejection was about AI silently inventing and
  accumulating debt on the user's behalf. Here nothing is AI-authored (it's the user's own prior
  writing, shown verbatim), nothing accumulates (no counter/backlog state exists to accumulate in),
  and nothing is owed (declining to open the screen has zero visible consequence, per "Silent on
  non-response").
- **`lastSurfacedAt` is an anti-repeat heuristic only**, never a review-debt signal. It exists solely
  so `selectNoteForReview` doesn't show the same note twice in a row — a note left unreviewed for a
  year carries no flag, no penalty, nothing. Deliberately narrower than `domain_nodes`' 90-day
  "Unverified" tag: that tag marks knowledge maturity; this is just personal writing, and personal
  writing doesn't decay.
- **A note never triggers gap creation, mastery changes, or generation of any kind, in either
  direction.** Capturing OR reviewing a note is a pure read/write of the note's own text — the
  module's explicit compliance boundary with `.product/PRINCIPLES.md`'s "User-only gap creation."
- **Taxonomy filtering resolves via note → topic/gap/source → curriculum →
  `curriculum_domain_node_mappings` (confirmed) → subtree**, reusing the same `MAX_DEPTH`-capped,
  cycle-safe BFS pattern `domainNodeProgress` already established — a new small implementation
  (different output shape: a membership filter, not a progress rollup) rather than a shared function
  call, but not a second traversal design.
- **Concern filter reuses `concernSchema` unmodified** from `@post-anki/shared` — no new vocabulary,
  matching curricula/topics/gaps' existing `concern` columns.

### Implementation order

1. Schema: `notes` table; generated migration
2. `normalizeSearchQuery`, `resolveNoteTaxonomySubtree`, `selectNoteForReview` — derivers,
   red-green-refactor
3. `note.repo.ts` (CRUD + `searchVector` write on insert/update)
4. `note-search.repo.ts` (FTS query + taxonomy/concern filters)
5. `note-review.service.ts` (pull-only selection + `lastSurfacedAt` write)
6. `note.controller.ts` + router wiring (`POST/GET /notes`, `GET /notes/search`, `GET /notes/review`)
7. Web: `note-capture-box.tsx` embedded into study views; `notes-browser.tsx`

### Scope boundary

- No AI-generated content from notes — no summarization, no auto-extracted flashcards. v1 is pure
  user-authored capture and retrieval.
- No push/nudge delivery of notes-for-review — pull-only, per the review decision above.
- No edit history/versioning — a note is edited in place (`updatedAt` bump), no revision log.
- No attachment to domain nodes or curricula directly — capture is scoped to topic/gap/source only,
  per the task's own scenario list.
- No collaborative/sharing features — single-user product, matches every other module.
- No file/image attachments on a note — text only.

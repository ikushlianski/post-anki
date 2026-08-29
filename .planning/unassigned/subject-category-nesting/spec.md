---
type: spec
branch: learn-from-doc-site
task: "Add a nested category level between Subject and Curriculum, plus new base subjects"
complexity: complex
state: confirmed
updated: 2026-08-21
---
# Spec: Subject > category > curriculum nesting, plus new base subjects

### Summary

Introduces an optional grouping level ("category") between a subject and its curricula, so a
subject can be organized like `AI -> RAG -> Turbopuffer` or `Programming / Web Development ->
Frontend -> React`, while a curriculum with no category keeps working exactly as it does today.
Seeds four new top-level subjects (Databases, Architecture, Cloud Computing, AI) and one starter
category (AI -> RAG), so the user can immediately place the Turbopuffer course where it belongs.
Replaces the subject page's single "+ Add curriculum" button with one "+ New material" entry
point, present on every level's own page, that lets the user pick where in the tree the new
category or curriculum goes via a searchable position picker defaulting to wherever they are.

### Implementation Phases

Single phase — one vertical slice (schema → derivers → repo/controller → shared schemas → unified
UI entry point → category browsing page → migration → seed script).

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `resolveCategoryPath` (`packages/core/src/subject-category/resolve-category-path.ts`) | `categoryId: string \| null`, `categories: {id, subjectId, parentId, name}[]` (every category for a subject) | ordered `{id, name}[]` from the subject root down to the target category — the breadcrumb, and the same path string used to label a picker option (e.g. `"AI > RAG"`) | SCENARIO 2, 5 |
| `buildCategoryPickerOptions` (`packages/core/src/subject-category/build-category-picker-options.ts`) | `categories: {id, subjectId, parentId, name}[]` (one subject's categories), `subjectId`, `subjectName` | ordered list of `{nodeId, label, depth}` — one root entry for the subject itself plus one entry per category, `label` built via `resolveCategoryPath`, ready for a searchable dropdown | SCENARIO 4, 5, 8, 9 |
| `validateCategoryBelongsToSubject` (`packages/core/src/subject-category/validate-category-belongs-to-subject.ts`) | `categoryId: string \| null`, `subjectId`, `categories: {id, subjectId}[]` | `true` if `categoryId` is `null` or names a category whose `subjectId` matches; `false` otherwise — the single check both the category-create and curriculum-move paths run before writing | SCENARIO 8, 9, 12 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 (subject page: categories + uncategorized curricula) | `subject-category.repo.ts` (`listCategoriesForSubject`) | `subject-section.tsx`, `subject.$subjectId.tsx` | None |
| SCENARIO 2 (category page + breadcrumb) | `subject-category.repo.ts` (`getCategory`, `listCategoriesForSubject`) | `subject.$subjectId.category.$categoryId.tsx` (new), `resolve-category-path.ts` (via `@post-anki/core`) | None |
| SCENARIO 3 (add curriculum, no category, default position) | `curriculum.controller.ts`, `curriculum.repo.ts` (`createCurriculum` already accepts an optional placement field, extended to `categoryId`) | `create-material-form.tsx` (new) | None |
| SCENARIO 4 (add category under subject) | `subject-category.controller.ts` (new), `subject-category.repo.ts` (new, `insertCategory`) | `create-material-form.tsx`, `category-tree-picker.tsx` (new) | None |
| SCENARIO 5 (add curriculum from a category page, default + override) | `curriculum.controller.ts`, `curriculum.repo.ts` | `create-material-form.tsx`, `category-tree-picker.tsx` | None |
| SCENARIO 6 (sources still mandatory where required) | `curriculum.controller.ts` (unchanged validation path) | `create-material-form.tsx` (composes the existing sources fields) | None |
| SCENARIO 7 (simplified study-a-technology flow preserved) | `curriculum.controller.ts` (unchanged) | `create-material-form.tsx` (composes the existing simplified fields) | None |
| SCENARIO 8 (atomic subject+category move) | `curriculum.repo.ts` (`moveCurriculumToSubject` extended with an optional target category, validated + written in the same transaction) | `subject-section.tsx` (existing "Move to…" control gains a category sub-select once a target subject is picked) | None |
| SCENARIO 9 (category-only reassignment, same subject) | `curriculum.repo.ts` (same extended move path, subject unchanged) | `subject-section.tsx` / category page (same "Move to…" control) | None |
| SCENARIO 10 (four new base subjects seeded) | `apps/api/scripts/seed-subjects.ts` (extended list) | None | None |
| SCENARIO 11 (AI > RAG category seeded) | `apps/api/scripts/seed-subject-categories.ts` (new) | None | None |
| SCENARIO 12 (cross-subject rejection) | `subject-category.repo.ts`, `curriculum.repo.ts` (both call `validateCategoryBelongsToSubject`) | `create-material-form.tsx` (surfaces the rejection) | None |
| SCENARIO 13 (language-practice subjects unaffected) | None (no server-side branching needed — the flow is never invoked) | `subject-section.tsx` (existing `kind === 'language-practice'` branch untouched, "+ New material" simply not rendered there) | None |

### Files to create

```
apps/api/src/subject-category/
  subject-category.repo.ts              — insertCategory (validates subject exists), listCategoriesForSubject, getCategory
  subject-category.controller.ts        — POST /subjects/:subjectId/categories, GET /subjects/:subjectId/categories
  subject-category.repo.integration.test.ts

packages/core/src/subject-category/
  resolve-category-path.ts
  resolve-category-path.test.ts
  build-category-picker-options.ts
  build-category-picker-options.test.ts
  validate-category-belongs-to-subject.ts
  validate-category-belongs-to-subject.test.ts

packages/shared/src/subject-category.ts  — subjectCategorySchema, createSubjectCategoryInput

apps/web/src/subject/
  subject-category.api.ts               — client for the two new endpoints
  create-material-form.tsx              — the single "+ New material" inline-expanding entry point (see Decisions below for the modal-vs-inline call); composes CreateCurriculumForm's/StudyTechnologyForm's existing field sets rather than duplicating them
  category-tree-picker.tsx              — searchable dropdown over one subject's categories + its root, built from buildCategoryPickerOptions, accepts a defaultSelectedNodeId

apps/web/src/routes/
  subject.$subjectId.category.$categoryId.tsx — category detail page: breadcrumb, child categories, child curricula, "+ New material" defaulted to this category

apps/api/scripts/
  seed-subject-categories.ts            — idempotent (skip-if-exists by name+subjectId, matching seed-subjects.ts's own pattern): AI -> RAG, Programming / Web Development -> Web Theory

docs/architecture/subject-category-nesting/
  architecture.md                       — copy of this ticket's architecture.md, matching this repo's existing per-ticket docs/architecture/<slug>/ convention (see Documentation changes below)
```

### Files to modify

```
apps/api/src/db/schema.ts               — add subjectCategories table (id, subjectId, parentId nullable, name, order, createdAt — no .references() FK, matching this schema's dominant plain-text-column convention); add curricula.categoryId (nullable text, no default)
apps/api/src/curriculum/curriculum.repo.ts — createCurriculum: accept optional categoryId alongside the existing domainNodeId placement field, validated via validateCategoryBelongsToSubject before insert; moveCurriculumToSubject: gains an optional targetCategoryId parameter, validated against targetSubjectId inside the same transaction/lock as the subject move; relax the existing "same_subject" early-return so a category-only change (subject unchanged, category different) is no longer rejected as a no-op
apps/api/src/curriculum/curriculum.controller.ts — handleCreateCurriculum: read/validate body.data.categoryId the same way domainNodeId is already validated; handleMoveCurriculum (or its route body): accept an optional categoryId
apps/api/src/router-table.ts            — register the two new subject-category routes
packages/shared/src/curriculum.ts       — createCurriculumInput and moveCurriculumInput both gain categoryId: z.string().nullable().optional()
apps/web/src/curriculum/curriculum.api.ts — getBoard(): also fetches and returns categories: SubjectCategory[] (all subjects' categories, same flat-list-then-client-filters shape as subjects/curricula today)
apps/web/src/curriculum/api-client.ts   — add listSubjectCategories/createSubjectCategory client calls
apps/web/src/subject/subject-section.tsx — render child categories (clickable, linking to the new category route) alongside uncategorized curricula; replace the CreateCurriculumForm/StudyTechnologyForm toggle-button pair with one CreateMaterialForm instance wired to this subject's root position; the language-practice branch is untouched
apps/web/src/routes/subject.$subjectId.tsx — loader extended to also pass this subject's categories down to SubjectSection
apps/api/scripts/seed-subjects.ts       — SEED_SUBJECTS list gains Databases, Architecture, Cloud Computing, AI
```

### Data model changes

New table `subject_categories`: `id`, `subject_id` (not null), `parent_id` (nullable — null means a
direct child of the subject), `name` (not null), `order` (default 0), `created_at`. Self-
referential, no depth limit enforced by the schema; real usage seeds and expects one level. New
column `curricula.category_id` (nullable text, no default — null means "directly under the
subject", the existing, unchanged state for every curriculum today). Neither new column carries a
`.references()` foreign key, matching this schema's existing convention (plain text + app-level
validation, same as `domain_nodes.parent_id`, `curricula.subject_id`, etc.) — cross-subject
integrity is enforced by `validateCategoryBelongsToSubject`, not the database.

This is a second, independent tree from `domain_nodes`/`curriculum_domain_node_mappings` — see
architecture.md for why the two are kept separate rather than reusing the existing tree.

### Seed data

| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 10 | Four subjects: Databases, Architecture, Cloud Computing, AI — name + a one-line description each, same shape as the existing `SEED_SUBJECTS` entries | extend `apps/api/scripts/seed-subjects.ts`'s existing list |
| SCENARIO 11 | One category, `RAG`, under the `AI` subject | new `seed-subject-categories.ts`, seeded explicitly for this ticket's stated goal (unblocking the Turbopuffer course) |
| SCENARIO 1, 2 (realistic browsing) | One additional category, `Web Theory`, under the existing `Programming / Web Development` subject — grounded in the user's real existing Anki-deck folder structure (`web-dev/web-theory/storage`) rather than an invented example | same new `seed-subject-categories.ts` |

Explicitly NOT seeded, and why: the same real folder tree also shows `web-dev/databases/postgres`
(Postgres nested under a "Databases" category inside Programming / Web Development). Seeding a
`Databases` category there, alongside the new top-level `Databases` subject this ticket also adds,
would recreate exactly the kind of duplicate-taxonomy problem this codebase already has automated
detection against (subject-duplicate embeddings). Postgres-flavored database content belongs under
the new top-level `Databases` subject going forward, not a same-named category nested inside Web
Development — noted here for the user, not auto-migrated (no existing "Postgres" curriculum is
touched by this ticket). English/Polish/other language-subject folders from the same evidence are
untouched — out of scope, no category concept applies to language-practice subjects (SCENARIO 13).

### Documentation changes

This repo's actual convention (confirmed against 15+ prior tickets, e.g.
`docs/architecture/decouple-curricula-from-domain-nodes/`, `docs/architecture/curriculum-merge/`)
is one folder per ticket under `docs/architecture/<ticket-slug>/`, not yet the constitution's
`<domain>/<component-slug>.md` taxonomy (`docs/architecture/README.md` doesn't exist in this repo).
Following that precedent: `docs/architecture/subject-category-nesting/architecture.md` is created
as a copy of this ticket's own `architecture.md`, current-state framing, at implementation time.

### BAML test coverage

Not applicable — no BAML functions touched.

### Decisions made autonomously

- **New dedicated `subject_categories` table, not a reuse/extension of `domain_nodes`.** The
  `decouple-curricula-from-domain-nodes` ticket (already implemented in this codebase) deliberately
  removed curricula's dependency on `domain_nodes` specifically so a curriculum's placement no
  longer requires that tree's AI-suggestion/review/target-depth machinery. Reusing it here for a
  simple organizational folder would reintroduce exactly the complexity that ticket removed, and
  would pull the already-shelved priority-review/knowledge-map UI back into scope. `domain_nodes`
  stays what it is today: an optional, separate knowledge/progress overlay a curriculum can be
  mapped into later, unrelated to where it's browsed from.
- **Category nesting depth: schema self-referential (unlimited), UI and seed data: one level.** The
  user's own real Anki-deck folder evidence (`web-dev/databases/postgres`,
  `web-dev/web-theory/storage`) shows exactly one category level in practice. The picker, breadcrumb,
  and category route are all written depth-generic (walk `parentId` until null) so a second level
  works without another migration if it's ever needed, but nothing is seeded or exercised beyond one
  level today.
- **The unified "+ New material" entry point is an inline-expanding form, not a modal/dialog.** No
  modal or dialog primitive exists anywhere in this codebase; `CreateCurriculumForm` and
  `StudyTechnologyForm` both already use the click-to-expand-inline pattern. `CreateMaterialForm`
  follows that same precedent rather than introducing a new UI primitive for one feature.
- **One entry point per level's page, one shared component.** `CreateMaterialForm` is a single
  implementation, mounted once on the subject page and once on the category page, each passing its
  own node as `defaultSelectedNodeId` to `CategoryTreePicker`. The picker itself always offers the
  full subject tree, not just descendants of the current node, so the user can redirect a new item
  elsewhere without leaving the page they're on.
- **Moving a curriculum's subject and category is one action, not two.** `moveCurriculumToSubject`
  already runs inside `withMergeLock`, re-reading the curriculum's authoritative row inside the
  lock before writing. Extending it with an optional `targetCategoryId`, validated in the same
  transaction, is the only way to guarantee a curriculum's subject and category never briefly (or
  permanently) disagree — two sequential calls (move, then re-categorize) cannot give that
  guarantee.
- **Category creation and listing are the only new endpoints; rename/delete/reorder are out of
  scope** (see Scope boundary) — matches the ticket's explicit instruction to keep this tightly
  scoped.
- **Categories are not added to the Electric shape registry / live-sync collections.** Only the
  dashboard (`index.tsx`) uses the live Electric path today, and it renders subjects as a flat list
  with no category grouping. The subject and category detail pages already use the plain
  loader-based `getBoard()` fetch (`subject.$subjectId.tsx`'s existing loader, not
  `useLiveQuery`), so categories only need to flow through that same REST/loader path — no Electric
  shape, no `board.collection.ts` changes required. If category grouping is ever added to the live
  dashboard later, that's a separate follow-on.
- **Duplicate category names under the same parent are allowed**, matching this schema's existing
  no-uniqueness convention for subject and curriculum names — nothing here enforces uniqueness
  either.
- **Seed source for the two starter categories (RAG, Web Theory) is the user's real Anki-deck
  folder tree**, not invented examples — see Seed data above for why `Databases` is deliberately
  excluded as a category name to avoid colliding with the new top-level `Databases` subject.

### Implementation order

1. `validateCategoryBelongsToSubject` — red-green-refactor, covers SCENARIO 8, 9, 12
2. `resolveCategoryPath` — red-green-refactor, covers SCENARIO 2, 5
3. `buildCategoryPickerOptions` — red-green-refactor, covers SCENARIO 4, 5, 8, 9
4. Schema: `subject_categories` table, `curricula.category_id` column (migration generated, not
   pushed, run via the existing migrate script)
5. `subject-category.repo.ts` + `subject-category.controller.ts` + route registration — covers
   SCENARIO 4, 12
6. `curriculum.repo.ts` / `curriculum.controller.ts` changes (create with categoryId, extended
   move) — covers SCENARIO 3, 5, 6, 7, 8, 9, 12
7. `apps/api/scripts/seed-subjects.ts` extension — covers SCENARIO 10
8. `apps/api/scripts/seed-subject-categories.ts` — covers SCENARIO 11
9. Frontend: `category-tree-picker.tsx`, `create-material-form.tsx`
10. `subject-section.tsx` rewire (categories list, single entry point, extended "Move to…") —
    covers SCENARIO 1, 6, 7, 8, 9, 13
11. `subject.$subjectId.category.$categoryId.tsx` (new route) — covers SCENARIO 2
12. `subject.$subjectId.tsx` loader extension — covers SCENARIO 1
13. `docs/architecture/subject-category-nesting/architecture.md`

### Scope boundary

Out of scope for this ticket:
- Category rename, delete, or drag-and-drop reordering.
- Any bulk re-organization tooling.
- Reviving the domain-map/priority-review UI, or any change to `domain_nodes`/
  `curriculum_domain_node_mappings` — that system is untouched.
- Auto-migrating any existing curriculum (including a pre-existing "Postgres" curriculum, if one
  exists) into the new categories — the seed only creates the categories themselves; moving real
  content into them is a manual follow-up action using the existing "Move to…" control.
- Seeding categories for English/Polish/other language-practice subjects — category nesting does
  not apply to `language-practice` subjects at all (SCENARIO 13).
- The unrelated, already-confirmed-but-unimplemented `seed-static-taxonomy` plan
  (`.planning/unassigned/seed-static-taxonomy/`) — that seeds the `domain_nodes` knowledge-map
  tree, a different table from this ticket's `subject_categories`.

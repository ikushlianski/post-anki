# Plan: nested subjects for dashboard, paste and review

## Goal
Subjects nest under a parent to any depth, and a paste or an Anki review can be scoped to a subject plus all its descendants.

## Approach
- Replaces the subject_categories design (untouched). Hierarchy is `subjects.parent_id`; curricula, topics, cards and schedules keep their links.
- Pure deriver in new `packages/core/src/subject-hierarchy/`: subtree ids, cycle check, valid move targets, path label. Used by API and web.
- Reuse `PATCH /subjects/:id` (already exists, takes name/modelTier) and `POST /subjects`, both gaining `parentId`. No new routes.
- Review scope follows the existing tagId/topicId pattern. Binding architecture: the request brief (no brief.md in this folder).

## Steps
1. GUARDED migration. `apps/api/src/db/schema.ts`: `subjects.parentId` = `text("parent_id")` and `knowledgeSources.subjectId` = `text("subject_id")`, both nullable, no FK, no default. Run `npm run db:generate` in `apps/api`. Expect one file, `apps/api/src/db/migrations/0088_*.sql` plus meta, with two `ADD COLUMN` statements.
2. `packages/core/src/subject-hierarchy/subject-hierarchy.ts` (new, pure): `collectSubjectSubtreeIds(rootId, rows)`, `wouldCreateSubjectCycle(subjectId, parentId, rows)` (true if parentId is subjectId or has subjectId as an ancestor; visited set), `listValidMoveTargets(subjectId, rows)` (all minus the subject and its subtree), `buildSubjectPathLabel(id, rows)` ("A › B"). Export from `packages/core/src/index.ts`.
3. `packages/shared/src/subject.ts`: `subjectSchema` gets `parentId: z.string().nullable()`; `createSubjectInput` and `updateSubjectInput` get `parentId: z.string().nullable().optional()`.
4. `apps/api/src/subject/subject.repo.ts`: `toSubject` maps parentId; `createSubject` writes it; `updateSubject` loads id/parentId rows and rejects cycles via the deriver, returning a result the controller can map.
5. `apps/api/src/subject/subject.controller.ts`: parent missing gives 400 `parent_not_found`; self or cycle gives 400 `invalid_parent`.
6. `packages/shared/src/knowledge-bit-review.ts`: `reviewCardsQuerySchema` gets `subjectId: optionalScopeId`.
7. `apps/api/src/knowledge-source/knowledge-source.repo.ts`: insert functions take `subjectId: string | null` and write it. `knowledge-source.controller.ts`: optional nullable `subjectId` on text, batch and URL inputs (the URL schema is `.strict()`, so list it); unknown id gives 400 `subject_not_found`.
8. `apps/api/src/knowledge-bit/knowledge-bit-review-queue-picked.repo.ts`: `scopeCondition` takes resolved `subjectIds`. Its branch is `or(inArray(curricula.subjectId, ids), and(isNull(knowledgeBits.topicId), inArray(knowledgeSources.subjectId, ids)))`. `pickedVariants` left-joins `curricula` (via topics.curriculumId) and `knowledgeSources`. `knowledge-bit-review-queue-cards.repo.ts` `listScopedCards` gets the same joins.
9. `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts`: filter gains `subjectId`; load subject rows, expand with `collectSubjectSubtreeIds`, pass ids down. `knowledge-bit-review.controller.ts` forwards it.
10. Review on web: `apps/web/src/knowledge-bit/anki-review-screen.tsx` (`AnkiReviewScope`, `reviewQueueQueryKey`), `anki-review.api.ts` (key loop), `apps/web/src/routes/knowledge.review.tsx` (`validateSearch`).
11. Data on web: `apps/web/src/curriculum/board.collection.ts` (`SubjectRow` and `mapSubjectRow` carry parentId); `apps/web/src/curriculum/api-client.ts` (new `updateSubjectParent`, `createSubject` sends parentId); `apps/web/src/subject/subject.api.ts` (matching server fn).
12. Dashboard, only after the other agent's extraction into `apps/web/src/dashboard/*` lands; do not edit `apps/web/src/routes/index.tsx` in parallel. Children render nested and indented under their parent. Each row's ⋯ menu gets: "Move under…" (picker of `listValidMoveTargets` plus "Top level", calls updateSubjectParent); "Add sub-subject" (navigates to `/subjects/new?parentId=<id>`); "Review" link to `/knowledge/review?subjectId=<id>`.
13. `apps/web/src/routes/subjects.new.tsx`: validateSearch reads parentId; `apps/web/src/subject/create-subject-form.tsx` accepts an optional parentId prop.
14. Paste picker: `apps/web/src/routes/add-knowledge.tsx` loader calls `getBoard()` and passes subjects to `apps/web/src/knowledge-source/add-knowledge-form.tsx`, which shows one optional select (labels from `buildSubjectPathLabel`, blank default) and sends the same subjectId with every block. `apps/web/src/knowledge-source/knowledge-source.api.ts` and the create calls in `curriculum/api-client.ts` send it.

## Tests
- Unit `packages/core/src/subject-hierarchy/subject-hierarchy.test.ts`: depth-3 descendants in subtree; siblings and ancestors excluded; self-parent and ancestor-as-parent are cycles; malformed existing cycle terminates; move targets exclude self and subtree; path label.
- Integration, co-located with `subject.repo`: PATCH parentId persists; null clears; cycle rejected.
- Integration `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts`: subjectId scope on the parent returns bits from child curricula and unplaced bits from child-sourced pastes; excludes unrelated subjects; unscoped unchanged.
- Controller `apps/api/src/knowledge-source/knowledge-source.controller.test.ts`: subjectId persists for text, batch, URL; unknown gives 400; omitted gives null.
- Web `apps/web/src/routes/-add-knowledge.test.tsx`: chosen subject sent with every block; blank sends none.
- Web, co-located with the extracted dashboard file: child nested under parent; Move under… excludes self and descendants; Top level sends null.
- Web `apps/web/src/routes/-knowledge.review.test.tsx`: subjectId search param reaches the queue request.

## Migration (GUARDED)
- Before applying: `pg_dump` the local dev DB (localhost:5562/postanki_dev) to a timestamped file outside the repo; verify the dump is non-empty.
- Apply only with `npm run db:migrate` in `apps/api`, after the backup. No ORM push, no direct SQL.
- Production: same steps, only after the user's go. Columns: nullable, no FK, no backfill, no index.

## Ops note
After deploy, the user moves AI, Architecture, Cloud Computing and Databases under "Programming / Web Development" through the dashboard ⋯ menu ("Move under…"). No SQL or orchestrator step, locally or in prod. Business children (Time management, Sales, SMM, Negotiations, HR, Marketing) are created with "Add sub-subject".

## Done when
- After the user's moves, the dashboard shows the four subjects nested under "Programming / Web Development".
- "Move under…" rejects self and descendants; "Top level" clears the parent.
- "Add sub-subject" creates a child with its parent set.
- `/knowledge/review?subjectId=X` returns only bits whose subject is X or a descendant.
- A paste with a subject tags its source; blank paste behaves as before.
- Migration is one generated file with two nullable ADD COLUMNs, applied after pg_dump via the migrate script.
- `npx tsc --noEmit` and project lint are clean; `npx vitest run` passes for touched files.

## Defaults chosen
- parent_id on subjects, no new table: hierarchy is a subject property; no new entity needed.
- Placed bit's subject = its curriculum's subject; unplaced bit = its source's subject: placed bits already belong to a curriculum, so they are not reassigned.
- Scope precedence knowledgeBitId > topicId > tagId > subjectId: existing first-match rule.
- Scoped subject review skips the new-card cap, as tag and topic scopes do.
- Invalid parent gives 400 `invalid_parent`; unknown parent gives 400 `parent_not_found`: fails loudly, no silent loop.
- Paste subject optional, blank means none: pasted bits are not forced into a subject.
- Reuse PATCH and POST /subjects: routes exist; fewer endpoints.
- Add sub-subject reuses /subjects/new with a search param: existing create flow.
- Tree in app code, no recursive SQL, no index on the new columns: tables are small.
- Required nullable parentId: tsc lists fixtures. Migration GUARDED: shared schema, so backup first.

## Footprint
Repo root: /Users/ikushlianski/webdata/ilya-projects/post-anki
- apps/api/src/db/schema.ts; apps/api/src/db/migrations/0088_* (generated, GUARDED)
- packages/core/src/subject-hierarchy/subject-hierarchy.ts (+ .test.ts); packages/core/src/index.ts
- packages/shared/src/subject.ts; packages/shared/src/knowledge-bit-review.ts
- apps/api/src/subject/subject.repo.ts; apps/api/src/subject/subject.controller.ts
- apps/api/src/knowledge-source/knowledge-source.repo.ts; apps/api/src/knowledge-source/knowledge-source.controller.ts (+ test)
- apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts; knowledge-bit-review-queue-picked.repo.ts; knowledge-bit-review-queue-cards.repo.ts; knowledge-bit-review.controller.ts (+ integration test)
- apps/web/src/curriculum/board.collection.ts; apps/web/src/curriculum/api-client.ts; apps/web/src/subject/subject.api.ts
- apps/web/src/knowledge-source/knowledge-source.api.ts; add-knowledge-form.tsx
- apps/web/src/routes/add-knowledge.tsx (+ -add-knowledge.test.tsx); apps/web/src/routes/subjects.new.tsx; apps/web/src/subject/create-subject-form.tsx
- apps/web/src/routes/knowledge.review.tsx (+ -knowledge.review.test.tsx); apps/web/src/knowledge-bit/anki-review-screen.tsx; apps/web/src/knowledge-bit/anki-review.api.ts
- apps/web/src/dashboard/* (after extraction); apps/web/src/routes/index.tsx (after extraction only)
END-OF-REPORT

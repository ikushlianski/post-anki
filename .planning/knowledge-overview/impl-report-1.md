# Impl report 1 (units A, D, F)

## Endpoints
- GET /knowledge-bits/overview?subjectId&q&limit(1..100, default 50)&offset
  -> 200 { items: [{ knowledgeBitId, question, answer, subjectId|null, state(new|learning|review|relearning|suspended|buried), dueAt|null, lapses }], hasMore }; 400 invalid_input.
  Approved bits with a live variant; subject filter includes descendants; q is escaped ILIKE on live variant prompt/answer; order created desc, id asc.
- POST /knowledge-bits/deletions  body { knowledgeBitIds: string[1..200] }
  -> 200 { deleted: id[], skipped: [{ id, reason: not_found|not_approved }] }; 400 invalid_input.
  One transaction, rows locked for update, approved only; deletes attempts (by variant id), reviews, schedule, tag_assignments(knowledgeBit), variants, bit; feedback rows kept.
- Move: only types exist (bulkMoveKnowledgeBitsInput { knowledgeBitIds, subjectId }, bulkMoveKnowledgeBitsResponseSchema { moved, skipped }); no endpoint.

## Files
- packages/shared/src/knowledge-bit-overview.ts (+ .test.ts), one export line appended to index.ts
- apps/api/src/knowledge-bit/: knowledge-bit-preferred-variant.ts (extracted, suspended.repo now imports it), knowledge-bit-subject.ts (effectiveSubjectIdSql, the single place for the later subject_id migration), knowledge-bit-overview-state.ts(+test), knowledge-bit-overview.repo/controller(+controller test), knowledge-bit-delete.repo/controller(+controller test), knowledge-bit-overview-delete.integration.test.ts
- Route hunks in router.ts, router-table.ts (literal paths placed before the /:id regexes), api-server.ts.

## Checks
- tsc --noEmit: apps/api, packages/shared, apps/web clean.
- vitest: new api unit tests, router.test.ts, packages/shared (55) pass.
- Lint: the repo has no eslint config and no lint script, so not run.

## Not run
- knowledge-bit-overview-delete.integration.test.ts and the suspended integration test: they create a temp database from DATABASE_URL/E2E_DATABASE_URL (default localhost:5578 e2e stack) and migrate it with in-flight migrations 0093-0096; not run to avoid touching shared DB state.

## Notes
- Nothing staged or committed (per instruction). Unit C should extend knowledge-bit-subject.ts, which already exists.
- Success status for deletions is 200 (mirrors bulk approvals), not 201.

END-OF-REPORT

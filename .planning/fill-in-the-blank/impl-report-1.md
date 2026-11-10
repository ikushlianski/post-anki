## Implementation report — fill-in-the-blank phases 1, 3, 4

### Phase 1 — schema + migration

`sentence text` (nullable, no default) added to `knowledgeBitQuestionVariants` in
`apps/api/src/db/schema.ts` after the `answer` column.

`npm run db:generate` was run; drizzle produced `0093_dusty_talon.sql` (diffing
against the committed 0092 snapshot, unaware of the untracked 0093-0096 files).
That file was discarded; the generated snapshot was renamed to `0097_snapshot.json`;
`_journal.json` was updated to entry idx 97 tag `0097_add-sentence-to-variants`;
and a hand-written migration file `0097_add-sentence-to-variants.sql` was created
containing only:

```sql
ALTER TABLE "knowledge_bit_question_variants" ADD COLUMN "sentence" text;
```

`db:migrate` was NOT run.

### Phase 3 — meta-orchestrator + route

New files:
- `apps/api/src/knowledge-bit/knowledge-bit-generate-variants.orchestrator.ts` —
  exports `generateKnowledgeBitVariants(_bitId?, _subjectId?, _modelId?)` which
  awaits `generateKnowledgeBitBasicCards()` then `generateKnowledgeBitFillBlanks()`
  sequentially and returns `{ basicCards, fillBlanks }`.
- `apps/api/src/knowledge-bit/knowledge-bit-generate-variants.controller.ts` —
  `POST /knowledge-bits/:bitId/variants`; calls `getKnowledgeBitById`; 404 if
  missing; sends 202 and kicks the orchestrator asynchronously.

Route wired: `router-table.ts` (regex entry `knowledge-bit-generate-variants`),
`router.ts` (union literal added), `api-server.ts` (import + switch case).

### Phase 4 — tests

- `knowledge-bit-generate-variants.orchestrator.test.ts` — 3 cases: basic before
  fill-blank order; combined counts returned; fill-blank skipped when basic throws.
- `knowledge-bit-generate-variants.controller.test.ts` — 2 cases: 202 on existing
  bit; 404 + no orchestrator call on missing bit.

### Check results

`npx tsc --noEmit` — zero errors in my new files (pre-existing errors in
untracked-change files are not mine).
`npx vitest run` on the two new test files — 5/5 passed.
Full `npx vitest run` — 161 test files fail from pre-existing untracked changes
(0093-0096 wave); my files contribute 0 failures.

### Diff command

```
git diff --staged
```

### Defaults chosen

- Function params `(_bitId?, _subjectId?, _modelId?)` declared but unused — the
  orchestrator runs full-scan functions that have their own claim guards; per-bit
  scoping is a future extension.
- Migration renamed to 0097 by hand rather than regenerating with drizzle — the
  cleanest way to respect the untracked 0093-0096 wave without touching those files.

END-OF-REPORT

## Goal
Persist the source sentence for fill-in-the-blank variants, wire the fill-blank
orchestrator to run after basic card generation, and add unit tests for all three.

## Approach
Three modules in `apps/api/src/knowledge-bit/` plus one schema change and one
migration. No new boundaries: everything stays inside the prose-knowledge-fisher
detection pipeline. Data contract: `knowledgeBitQuestionVariants` gains one
nullable `sentence` column; the meta-orchestrator is a plain function, no new
route contract. Phase 3's route reuses the existing Hono router pattern in
`router-table.ts` / `router.ts`.

## Steps

### Phase 1 — schema and migration
1. `apps/api/src/db/schema.ts`: add `sentence: text("sentence")` (nullable, no
   default) to the `topicCardVariants`-mirrored `knowledgeBitQuestionVariants`
   table, after the `answer` column.
2. `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts`: add
   optional `sentence?: string` param to `insertQuestionVariant`; pass it into
   the Drizzle insert values map.
3. `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-claim.repo.ts`:
   pass `result.sentence` (already validated by the orchestrator) into
   `recordGeneratedFillBlankVariant` → `insertQuestionVariant`.
4. `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts`:
   forward `result.sentence` in the `recordGeneratedFillBlankVariant` call.
5. Generate migration: `npx drizzle-kit generate` — this produces `0097_*.sql`.
   Do NOT run `npm run db:migrate`. Confirm SQL adds a nullable column, no
   backfill needed.

### Phase 3 — meta-orchestrator and route
6. NEW `apps/api/src/knowledge-bit/knowledge-bit-variant-generation.orchestrator.ts`:
   export `generateKnowledgeBitVariants()` that `await`s
   `generateKnowledgeBitBasicCards()` then `generateKnowledgeBitFillBlanks()` in
   sequence and returns a combined counts object.
7. `apps/api/src/router-table.ts` + `apps/api/src/router.ts`: add
   `POST /knowledge-bits/generate-variants` handler that calls
   `generateKnowledgeBitVariants()` and returns `{ ok: true, counts }`.
   Use the existing Hono + Zod response pattern from neighboring routes.

### Phase 4 — tests
8. NEW `apps/api/src/knowledge-bit/knowledge-bit-variant-generation.orchestrator.test.ts`:
   mock `generateKnowledgeBitBasicCards` and `generateKnowledgeBitFillBlanks`;
   assert they are called in order and combined counts are correct.
9. Extend `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.test.ts`:
   add a case asserting the `sentence` field is forwarded to
   `recordGeneratedFillBlankVariant`.
10. `apps/api/src/router.test.ts` (or co-located route test): assert
    `POST /knowledge-bits/generate-variants` returns 200 and `{ ok: true }`.

## Tests
- **Meta-orchestrator** (`knowledge-bit-variant-generation.orchestrator.test.ts`):
  basic-card then fill-blank called in order; combined counts summed correctly.
- **Fill-blank orchestrator** (extend existing test file): sentence forwarded to
  the repo call.
- **Route** (router test): endpoint resolves to 200 with expected body shape.
- All co-located, no `__tests__` folder, `describe`/`it`-`should` naming.

## Done when
- `knowledgeBitQuestionVariants.sentence` column exists in `schema.ts` and
  migration SQL adds it as nullable with no default.
- Migration number is 0097; `_journal.json` is NOT updated (generate only).
- `recordGeneratedFillBlankVariant` persists `sentence` from the agent output.
- `generateKnowledgeBitVariants()` exists, calls basic-card then fill-blank.
- `POST /knowledge-bits/generate-variants` returns `{ ok: true, counts }`.
- All new tests pass: `npx vitest run` green; `npx tsc --noEmit` zero errors.

## Defaults chosen
- Nullable `sentence` on `knowledgeBitQuestionVariants`, not a sidecar table —
  matches the existing pattern (all variant columns on one table, nullable for
  inapplicable kinds).
- Sequential basic-card → fill-blank in meta-orchestrator — each pass has its
  own claim guard; parallelising would double DB claim contention for no gain.
- Single POST route, no GET — generation is an admin-triggered side-effect, same
  as every other generation endpoint already in router-table.ts.
- Migration 0097 — last journal entry is 0092; in-flight files cover 0093–0096.

END-OF-REPORT

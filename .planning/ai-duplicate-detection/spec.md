---
type: spec
branch: ai-duplicate-detection
task: AI-assisted duplicate detection: surface likely-duplicate subjects (issue #63)
complexity: complex
state: confirmed
updated: 2026-07-31
---
# Spec: AI-assisted duplicate detection

Fixed constraints (decided 2026-07-31, not re-opened by this plan): on-demand scan only (a button, no cron/no create-trigger), embedding similarity via one batched call per scan (never pairwise LLM comparison), subjects only this cut (curricula/tags/domain-nodes deferred).

### Implementation Phases

Single phase — one vertical slice (schema → derivers → orchestrator → controller/routes → shared schemas → UI panel).

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `hashSubjectContent` (`packages/core/src/subject-duplicate/content-hash.ts`) | `name: string`, `description: string \| undefined` | `string` (short hash of the normalized `name + "\n" + description` text) | SCENARIO 2, 3 |
| `cosineSimilarity` (`packages/core/src/subject-duplicate/cosine-similarity.ts`) | two `number[]` vectors of equal length | `number` (−1..1) | SCENARIO 1 |
| `findDuplicatePairs` (`packages/core/src/subject-duplicate/find-duplicate-pairs.ts`) | `{ id: string; embedding: number[] }[]` (every subject with *any* cached embedding — never capped), `threshold: number` | `{ subjectAId: string; subjectBId: string; similarity: number }[]` (subjectAId/subjectBId returned in canonical lexicographic order, using `cosineSimilarity` internally) | SCENARIO 1 |
| `selectSubjectsForScan` (`packages/core/src/subject-duplicate/select-scan-candidates.ts`) | `{ id: string; contentHash: string; cachedHash: string \| null }[]`, `cap: number` | `{ toEmbed: string[]; reused: string[]; capped: boolean }` (subjects with no cached hash or a stale one need embedding; **the cap bounds only `toEmbed` — the paid embedding call — never the comparison step**, which always runs over every subject with any cached embedding; never-yet-embedded subjects are prioritized first within the cap so backlog coverage converges over successive scans rather than permanently excluding older subjects — corrected after red-team review found the original wording implied the cap also shrank the comparison set, which would silently and permanently blind the scan to duplicates among older subjects once the corpus outgrew the cap) | SCENARIO 2, 3, 7 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 (scan produces suggestions) | `subject-duplicate.orchestrator.ts`, `subject-duplicate.repo.ts`, `subject-duplicate.controller.ts`, `find-duplicate-pairs.ts` | `duplicate-scan-panel.tsx`, `subject-duplicate.api.ts` | None |
| SCENARIO 2 (no-op rescan costs nothing) | `subject-duplicate.orchestrator.ts`, `select-scan-candidates.ts`, `content-hash.ts` | None | None |
| SCENARIO 3 (one subject changed, only it re-embeds) | same as SCENARIO 2 | None | None |
| SCENARIO 4 (accept + pick survivor) | `subject-duplicate.controller.ts`, `subject-duplicate.repo.ts`, `subject.repo.ts` (`mergeSubjects` extended) | `duplicate-scan-panel.tsx` | None |
| SCENARIO 5 (reject) | `subject-duplicate.controller.ts`, `subject-duplicate.repo.ts` | `duplicate-scan-panel.tsx` | None |
| SCENARIO 5b (plain delete invalidates pending pair) | `subject.repo.ts` (`deleteSubject` extended) | `duplicate-scan-panel.tsx` (row disappears on next load) | None |
| SCENARIO 6 (embedding API failure) | `embeddings-client.ts`, `subject-duplicate.orchestrator.ts` | `duplicate-scan-panel.tsx` (error state) | None |
| SCENARIO 7 (cap exceeded) | `subject-duplicate.orchestrator.ts`, `select-scan-candidates.ts` | `duplicate-scan-panel.tsx` (capped notice) | None |
| SCENARIO 8 (concurrent scan/merge race) | `subject-duplicate.controller.ts`, `subject-duplicate.repo.ts` | `duplicate-scan-panel.tsx` (error surfaced) | None |
| SCENARIO 8b (double-click / two-tab insert race) | `subject-duplicate.repo.ts` (constraint-violation handling), `schema.ts` (partial unique index) | `duplicate-scan-panel.tsx` (no duplicate card) | None |
| SCENARIO 9 (tracing) | `subject-duplicate.orchestrator.ts`, `apps/api/src/mastra/mastra.ts` (`startTracingSpan`, reused as-is) | None | None |

### Files to create

```
apps/api/src/subject-duplicate/
  subject-duplicate.orchestrator.ts   — triggerSubjectDuplicateScan(): selects candidates, embeds via embeddings-client, persists suggestions
  subject-duplicate.repo.ts           — CRUD for subject_duplicate_suggestions (insert, list by status, resolve)
  subject-duplicate.controller.ts     — HTTP handlers: trigger scan, list suggestions, resolve suggestion
  embeddings-client.ts                — raw fetch to OpenRouter /embeddings; mirrors
                                         tech-research-grounding.ts's endpointUrl() pattern (manual
                                         OPENROUTER_BASE_URL override — a raw fetch bypasses Mastra's
                                         resolveAgentModel, which is what normally applies this
                                         override for e2e mocking), 45s AbortController timeout
                                         (same TIMEOUT_MS value as that precedent), p-retry(2), and a
                                         one-request-per-subject fallback if OpenRouter's batch
                                         positional-ordering assumption doesn't hold (see
                                         architecture.md's flagged assumptions)
  subject-duplicate.orchestrator.test.ts
  subject-duplicate.repo.test.ts (or .integration.test.ts, matching this module's existing convention for DB-touching tests)

packages/core/src/subject-duplicate/
  content-hash.ts + content-hash.test.ts
  cosine-similarity.ts + cosine-similarity.test.ts
  find-duplicate-pairs.ts + find-duplicate-pairs.test.ts
  select-scan-candidates.ts + select-scan-candidates.test.ts
  index.ts                            — re-exports, added to packages/core/src/index.ts

packages/shared/src/subject-duplicate.ts
  — subjectDuplicateSuggestionSchema, subjectDuplicateSuggestionStatusSchema
    ("pending" | "accepted" | "rejected" | "stale"), triggerSubjectDuplicateScanResultSchema
    (includes `capped: boolean`, `embeddedCount`, `reusedCount`), resolveSubjectDuplicateSuggestionInput
    (`{ status: "accepted"; targetSubjectId: string } | { status: "rejected" }`)

apps/web/src/subject-duplicate/
  duplicate-scan-panel.tsx            — button + pending list + accept(pick survivor)/reject controls
  subject-duplicate.api.ts            — TanStack server-fn wrappers, mirrors domain-map.api.ts's shape

apps/api/drizzle/<timestamp>_subject_duplicate_detection.sql  — generated via `npm run db:generate:api`, never hand-written
```

### Files to modify

```
apps/api/src/db/schema.ts
  — subjects: + embedding (jsonb, nullable), embeddingHash (text, nullable), embeddedAt (timestamptz, nullable)
  — + subjectDuplicateSuggestions table (id, subjectAId, subjectBId — canonical lexicographic
    order, similarity, reason, source, status, createdAt, resolvedAt), with a partial unique index
    on (subjectAId, subjectBId) WHERE status = 'pending' — the DB-level race guard added after
    red-team review, mirroring curriculum_structure_turns_pending_assistant_unique (schema.ts:432-434)

apps/api/src/subject/subject.repo.ts
  — + updateSubjectEmbedding(subjectId, embedding, hash): writes embedding/embeddingHash/embeddedAt
  — mergeSubjects(targetId, sourceId, resolvingSuggestionId?: string): after the existing
    curricula/domainNodes reassignment, inside the same transaction, invalidate every PENDING
    subject_duplicate_suggestions row referencing sourceId (status -> "stale", resolvedAt set);
    if resolvingSuggestionId is given, immediately afterward — still inside the same transaction —
    set that one specific row to "accepted" instead, overwriting the "stale" it would otherwise
    get. The optional parameter (added after red-team review found the original two-sequential-
    writes design left a crash window where an accepted suggestion could get permanently stuck at
    "stale") keeps the manual "Merge into…" control's existing call sites unaffected (parameter
    omitted, no behavior change). Mirrors how curricula/domainNodes are already touched directly
    inside this function despite "belonging" to other modules; the transaction owner touches every
    table a merge affects, which is this codebase's existing convention here, not a new one.
  — deleteSubject(): same stale-invalidation addition as mergeSubjects, for the same reason — a
    plain delete (the pre-existing "Delete subject" control, unrelated to this feature) must not
    leave a pending suggestion row pointing at a subject that no longer exists. Red-team finding:
    the original draft only wired this into mergeSubjects.

apps/api/src/shared/env.ts
  — + EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small")

apps/api/src/mastra/mastra.ts
  — no functional change; startTracingSpan is reused as-is (already exported)

apps/api/src/router.ts
  — + POST /subject-duplicate-scans -> triggerSubjectDuplicateScan
  — + GET /subject-duplicate-suggestions -> listSubjectDuplicateSuggestions (query param ?status=)
  — + PATCH /subject-duplicate-suggestions/:id -> resolveSubjectDuplicateSuggestion

apps/api/src/server.ts
  — wire the three new controller handlers into the route table, same pattern as domain-priority-review's wiring

apps/web/src/routes/index.tsx
  — loader: + listSubjectDuplicateSuggestions({ status: 'pending' })
  — render <DuplicateScanPanel> above the SubjectSection list, passing initial pending suggestions + all subjects (for name lookups)

apps/web/src/curriculum/api-client.ts
  — + thin fetch wrappers for the three new endpoints, same shape as existing entries (triggerDomainPriorityReview etc.)

packages/core/src/index.ts
  — + export * from "./subject-duplicate"
```

### Data model changes

See `architecture.md`'s "Data model evolution" — additive only (3 nullable columns on `subjects`, 1 new table). No backfill required; existing subjects simply have no cached embedding until the first scan touches them. Migration generated via `npm run db:generate:api`, applied via `npm run db:migrate:api` — never pushed directly, per the constitution's migrations rule.

### Documentation changes

This repo does not use the domain/component taxonomy under `docs/architecture/` described in the IE constitution — its actual established convention (visible in `docs/architecture/domain-priority-review.md`, `docs/architecture/doc-changelog-scan.md`, etc.) is one flat file/folder per feature, written by `/debrief` **after** the feature is built (`as-built.mmd`/`review.md`), not during planning. No existing `docs/architecture/ai-duplicate-detection*` file exists yet. Per this repo's convention, no doc write happens during planning — `/debrief` writes `docs/architecture/ai-duplicate-detection/` (or `.md`) once the feature is built, same as every other entry in that directory.

### Decisions made autonomously

1. **Similarity threshold = 0.86** (cosine, on `text-embedding-3-small`-family vectors) as a named constant (`DUPLICATE_SIMILARITY_THRESHOLD`) in `packages/core/src/subject-duplicate/find-duplicate-pairs.ts`. Explicitly an untuned starting value — not validated against this project's real subject data. DoD asserts behavior ("near-duplicate pair produces a suggestion, unrelated pair doesn't"), never the specific number.
2. **Embedding model = `openai/text-embedding-3-small` via OpenRouter** — cheapest widely-available general-purpose embedding model, sufficient for short name+description text; overridable via `EMBEDDING_MODEL` env var, same override shape as `CURRICULUM_MODEL`.
3. **Per-scan embedding cap = 200 `architecture-mentor` subjects needing a fresh embedding**, description truncated to 2000 characters before hashing/embedding. Corrected after red-team review: the cap bounds only the paid embedding call (`toEmbed`), never the comparison step, which always runs over every subject with any cached embedding — see architecture.md's "Cap bounds the embedding call only" for why capping the comparison itself would silently and permanently blind the scan to duplicates among older subjects once the corpus outgrew the cap.
4. **Retry budget = 2 retries (3 attempts total)**, plus a 45s request timeout (`AbortController`, matching `tech-research-grounding.ts`'s `TIMEOUT_MS` precedent), via the already-installed `p-retry`, on the embeddings HTTP call only — never on the orchestrator as a whole, and never a retry loop around a failed DB write.
5. **`subject_duplicate_suggestions.status` gets a fourth value, `"stale"`**, distinct from `"rejected"` — a pair a human explicitly said "not a duplicate" to (`rejected`) is a different fact than a pair that became moot because one side got merged or deleted away for an unrelated reason (`stale`). Both are excluded from the pending list; only `rejected` reflects a human judgment about the two subjects. Both `mergeSubjects` and `deleteSubject` apply this invalidation (red-team finding: the original draft only wired `mergeSubjects`).
6. **Suggestion pair stored in canonical lexicographic order (`subjectAId` < `subjectBId`), direction chosen by the human at accept time** (`targetSubjectId` in the resolve request body) — the embedding scan never implies which subject should be deleted; that is exactly the AI-output-is-a-suggestion-never-an-automatic-destructive-action line from the agentic-app principles doc. The canonical ordering (not just "unordered") is what lets a plain DB unique index enforce one-pending-row-per-pair regardless of which subject a caller names first — see Decision #13.
7. **Atomic accept via one new optional `mergeSubjects` parameter**: `resolveSubjectDuplicateSuggestion(id, { status: "accepted", targetSubjectId })` looks up the pair, then calls `mergeSubjects(targetSubjectId, otherSubjectId, resolvingSuggestionId: id)`. Inside `mergeSubjects`'s own transaction, after the stale-invalidation sweep, that one row is set to `accepted` instead — in the same transaction as the merge itself, so either both effects commit or neither does. Corrected after red-team review: the original design used two sequential writes (merge, then a separate accept-update), leaving a crash window where an accepted suggestion could get permanently stuck at `stale`, contradicting `stale`'s purpose of distinguishing "moot" from "a human resolved this."
8. **No pgvector** — `jsonb` + in-process cosine similarity, per architecture.md. Revisit only if a future cut needs this at a scale where in-process comparison stops being cheap (hundreds of subjects, not thousands, is the realistic ceiling for a personal app).
9. **UI placement**: `routes/index.tsx`, above the subject list — the only page with every subject in view, following `priority-review-panel.tsx`'s panel shape (button, busy state, inline accept/reject controls, no separate route).
10. **Button copy**: "Scan for duplicates". Pending pair copy: "`<Name A>` and `<Name B>` might be the same subject (similarity `<NN>`%)" with Accept/Reject controls; Accept opens a small inline picker ("keep: [Name A ▾]") before confirming, mirroring `MergeSubjectButton`'s existing armed/confirm/cancel pattern.
11. **Accept-request validation**: `targetSubjectId` must equal the suggestion row's `subjectAId` or `subjectBId`; the controller rejects (400) any other value before calling `mergeSubjects`, so a malformed or stale request can never merge against an unrelated third subject.
12. **Insert-time dedup covers `rejected`, not just `pending`**, backed by the DB unique index for the race case (Decision #13): a rescan never re-inserts a pair the human already rejected, even if the embeddings still clear the threshold — re-nagging about a judgment already made would erode trust in the suggestion list. `accepted`/`stale` rows are excluded from this check entirely since they reference a deleted subject and structurally cannot recur.
13. **DB-level partial unique index on `(subjectAId, subjectBId) WHERE status = 'pending'`**, not just an app-level check-then-act guard (found during grill-plan red-team review): this schema has an explicit precedent (`curriculum_structure_turns_pending_assistant_unique`, `schema.ts:432-434`) for exactly this race shape — a repeatably-clickable trigger where two concurrent requests can both observe "nothing pending yet" before either commits. The repo catches the constraint violation on a losing concurrent insert and treats it as a no-op, not an error.
14. **Resolve is idempotent**: `resolveSubjectDuplicateSuggestion` loads the row first and returns a 409/`already_resolved` response if `status !== "pending"`, rather than flipping an already-resolved row's status again (found during grill-plan red-team review; the existing `resolvePrioritySuggestion` precedent has the same gap, not fixed here since it's out of this feature's scope).
15. **Embeddings-client mirrors `tech-research-grounding.ts`'s raw-fetch conventions exactly**: manual `OPENROUTER_BASE_URL` override via an `endpointUrl()`-style helper (a raw `fetch()` bypasses Mastra's `resolveAgentModel`, which normally applies this override for e2e mocking) and a 45s `AbortController` timeout — both found missing from the original draft during grill-plan red-team review, which flagged this as the codebase's only other raw-fetch-to-OpenRouter precedent and the module this one should match, not reinvent.
16. **Plan auto-confirmed** (no human present to review) — consistency gate passed with 0 gaps after the grill-plan red-team pass and its fixes above.

### Implementation order

1. `/tdd hashSubjectContent` — covers SCENARIO 2, 3
2. `/tdd cosineSimilarity` — covers SCENARIO 1
3. `/tdd findDuplicatePairs` — covers SCENARIO 1
4. `/tdd selectSubjectsForScan` — covers SCENARIO 2, 3, 7
5. Schema: add `subjects` columns + `subjectDuplicateSuggestions` table (with the partial unique index); generate + run migration
6. `embeddings-client.ts` — raw fetch (endpointUrl override + 45s timeout) + `p-retry(2)`; first manual step is one real call against OpenRouter to confirm the key has embeddings access AND that batch input/output ordering behaves as documented (todo.md)
7. `subject.repo.ts`: `updateSubjectEmbedding`, `mergeSubjects` stale-invalidation + `resolvingSuggestionId` addition, `deleteSubject` stale-invalidation addition
8. `subject-duplicate.repo.ts`: insert (canonical pair order, constraint-violation-as-no-op)/list/resolve (idempotency guard) for suggestions
9. `subject-duplicate.orchestrator.ts`: wires selectSubjectsForScan → embeddings-client → updateSubjectEmbedding → findDuplicatePairs → repo insert, wrapped in `startTracingSpan`
10. `subject-duplicate.controller.ts` + `router.ts`/`server.ts` wiring
11. `packages/shared/src/subject-duplicate.ts` schemas
12. `apps/web/src/curriculum/api-client.ts` + `apps/web/src/subject-duplicate/subject-duplicate.api.ts`
13. `duplicate-scan-panel.tsx` + wiring into `routes/index.tsx`

### Definition of Done — per layer

**Backend**
- `npx vitest run packages/core/src/subject-duplicate/content-hash.test.ts` — passes; asserts identical `name+description` produces the same hash and a changed description produces a different one.
- `npx vitest run packages/core/src/subject-duplicate/cosine-similarity.test.ts` — passes; asserts two identical vectors score 1.0 and two orthogonal vectors score 0.0.
- `npx vitest run packages/core/src/subject-duplicate/find-duplicate-pairs.test.ts` — passes; asserts a synthetic pair of vectors above `DUPLICATE_SIMILARITY_THRESHOLD` (0.86) is returned and a pair below it is not.
- `npx vitest run packages/core/src/subject-duplicate/select-scan-candidates.test.ts` — passes; asserts (a) a subject with no cached hash is in `toEmbed`, (b) a subject whose cached hash matches its current content is in `reused` not `toEmbed`, (c) with more `toEmbed`-eligible subjects than the cap, `capped` is `true` and `toEmbed.length` equals the cap, (d) `reused` is never truncated by the cap.
- `npx vitest run apps/api/src/subject-duplicate/subject-duplicate.orchestrator.test.ts` — passes with `global.fetch` mocked for the embeddings call; seeds two subjects with deliberately near-duplicate name+description text ("Webdev" / "Programming — Web Development") and two unrelated ones ("Rust", "Cooking"), runs `triggerSubjectDuplicateScan()`, and asserts exactly one pending suggestion row exists for the near-duplicate pair and none for the unrelated ones — this is the behavioral proof the untuned 0.86 threshold is expected to satisfy, not a claim the number itself is validated.
- `npx vitest run apps/api/src/subject-duplicate/subject-duplicate.repo.test.ts` (or `.integration.test.ts`, matching this module's DB-test convention) — passes; asserts (a) a second insert attempt for an already-`pending` pair is a no-op (covers the DB partial-unique-index path), (b) accepting a suggestion via `mergeSubjects(..., resolvingSuggestionId)` leaves that row `accepted` and every other pending row referencing the deleted subject `stale` in one transaction, (c) `deleteSubject()` on a subject with a pending suggestion leaves that suggestion `stale`, (d) resolving an already-resolved suggestion returns an `already_resolved` error rather than changing its status.
- `curl -X POST http://localhost:8030/subject-duplicate-scans` against a locally running API seeded with the same near-duplicate/unrelated subjects above returns `200` with a JSON body containing one suggestion for the near-duplicate pair, `embeddedCount`/`reusedCount`/`capped` fields, and a Langfuse tracing span is visible for the call (SCENARIO 9).

**Frontend**
- At `http://localhost:3000/` (or the project's local dev port) with the API above seeded and running: the home page renders a "Scan for duplicates" button above the subject list. Clicking it shows a busy state, then a pending-suggestion card reading "Webdev and Programming — Web Development might be the same subject (similarity NN%)" with Accept/Reject controls.
- Clicking Accept opens an inline "keep: [ ▾]" picker (mirroring `MergeSubjectButton`'s armed/confirm/cancel pattern); after choosing a survivor and confirming, the card disappears, the absorbed subject is gone from the subject list below, and the survivor's curricula count reflects the merge — matching `MergeSubjectButton`'s existing accept behavior exactly.
- Clicking Reject on a different pending card removes it from the panel immediately, and both subjects remain in the list below, unchanged.
- Clicking "Scan for duplicates" again with nothing changed since the last scan completes and shows no new suggestions (SCENARIO 2 — verified qualitatively by unchanged network payload / no new embedding cost, exact zero-call proof is the backend vitest coverage above, not a frontend-observable state).

**Infrastructure**
- N/A — not touched. No new secret, no new Pulumi resource, no new deploy step. `EMBEDDING_MODEL` gets a default in `apps/api/src/shared/env.ts`, reusing the existing `OPENROUTER_API_KEY`. The only infra-adjacent step is the generated Drizzle migration (`npm run db:generate:api` then `npm run db:migrate:api`), which is schema evolution through the existing migration pipeline, not new infrastructure.

### Scope boundary

- Curricula, tags, and domain-nodes are not scanned — subjects only, per the fixed constraint.
- No cron/scheduled scan, no scan-on-subject-create trigger — button only.
- No pairwise LLM comparison at any subject count — the cap bounds the embedding call, it never triggers a fallback to a different (more expensive) comparison mechanism.
- A rescan never auto-resolves an existing pending suggestion just because a fresh comparison would no longer surface it (e.g. threshold tuning later, or a description edit that reduces similarity) — pending suggestions are only resolved by an explicit human accept/reject, or invalidated to `stale` by an unrelated merge. This keeps "the human hasn't looked at it yet" and "the AI no longer thinks it's a match" from being silently conflated.
- No UI for adjusting the similarity threshold in this cut — it's a code constant, tunable later if the 0.86 default proves noisy in practice.
- `language-practice`-kind subjects are never compared or suggested, matching `mergeSubjects`' own kind restriction.

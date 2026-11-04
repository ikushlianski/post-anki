---
type: spec
branch: learn-from-doc-site
task: Let parent subjects hold cards
complexity: complex
state: confirmed
updated: 2026-10-25
---
# Spec: Let parent subjects hold cards

### Summary
Today a subject that has sub-subjects cannot hold cards: adding or moving cards to it is refused, and when it gets its first sub-subject its cards are moved into an automatic "Common" sub-subject. This change lifts that rule so any subject, parent or not, can hold cards, and adding a sub-subject no longer moves anything. Existing "Common" sub-subjects stay as they are, and the AI helpers that worked around the rule (card placement, sub-subject suggestions) start treating a parent's own cards and courses like any other subject's.

### The ask
> "lift the rule which prevents the parent subject from having any cards."

Dispatch context (owner unavailable; defaults chosen per the dispatch): today a subject that has sub-subjects cannot hold cards: adding or moving cards to it is refused (409 subject_has_children), and when a subject first gets a child its existing cards/sources are moved into an auto-created "Common" sub-subject.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| ➕ `pickSubSubjectPoolIds` (new, pure, in `apps/api/src/subject-suggestion/subject-suggestion-pool.ts`) | a subject, its direct children | subject ids whose cards form the suggestion pool: the subject itself, plus its legacy "Common" child when present | SCENARIO 7 |
| `collectSubjectSubtreeIds` (existing, `packages/core/src/subject-hierarchy/subject-hierarchy.ts`, unchanged) | root id, hierarchy rows | root plus all descendants | SCENARIO 5 |
| `buildBrowserSubjectEntries` (existing, `apps/web/src/knowledge-bit/knowledge-browser-subject-list.tsx:17`, unchanged) | subject options, direct counts | per-subject totals including self and descendants | SCENARIO 5 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `apps/api/src/subject/subject-leaf.ts` — existence-only check; `apps/api/src/knowledge-source/knowledge-source.controller.ts:58` — drop 409 branch | `apps/web/src/routes/-add-knowledge.test.tsx` — parent via checkbox is sent | None |
| SCENARIO 2 | `apps/api/src/knowledge-bit/knowledge-bit-move.repo.ts`, `knowledge-bit-move.controller.ts:20` — drop 409 branch | `apps/web/src/knowledge-bit/use-knowledge-overview-move.ts:6,58` — drop has-children message | None |
| SCENARIO 3 | `apps/api/src/subject/subject.repo.ts:166-185,283-295` — no absorb on create/reparent; `apps/api/scripts/seed-business-sub-subjects.ts:55,65`; `apps/api/src/subject/subject-leaf.ts` — delete absorb helpers | None | None |
| SCENARIO 4 | None (no migration; `apps/api/src/db/migrations/0104_backfill-common-subject.sql` untouched) | None | None |
| SCENARIO 5 | Tests only: `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts`, `subject-review-due-counts.repo.integration.test.ts`, `knowledge-bit-browser.repo.integration.test.ts` | None | None |
| SCENARIO 6 | `apps/api/src/knowledge-bit/knowledge-bit-placement.repo.ts:46-70` — drop parent exclusion | None | None |
| SCENARIO 7 | `apps/api/src/subject-suggestion/subject-suggestion-sub-subjects.ts:51-83`, `subject-suggestion-evidence.repo.ts:94-110`, new pool deriver | None | None |
| SCENARIO 8 | `apps/api/src/subject/subject-leaf.ts` — error type narrows to not-found | `packages/shared/src/knowledge-source-refusal.ts:9` — drop sentence; `apps/ios/**` — no change | None |

### Files to create
```
apps/api/src/subject-suggestion/
├── subject-suggestion-pool.ts        — pickSubSubjectPoolIds deriver
└── subject-suggestion-pool.test.ts   — unit tests in business language
```

### Files to modify
```
apps/api/src/subject/
├── subject-leaf.ts — findSubjectAssignmentError returns only "subject_not_found" | null; delete listParentSubjectIds, listLeafSubjectIds, ensureCommonSubject, moveSourcesToCommon, hasChildSubjects, absorbParentItemsOnFirstChild once unused; keep COMMON_SUBJECT_NAME. Optionally rename the file to reflect it no longer enforces leaves (update importers in the same change).
│     used by: knowledge-source.controller.ts, knowledge-bit-move.repo.ts, knowledge-bit-placement.repo.ts, subject.repo.ts, subject-suggestion-sub-subjects.ts, scripts/seed-business-sub-subjects.ts
│     tests: subject-leaf.integration.test.ts; mocked in knowledge-source.controller{,.article,.errors,.refusals,.duplicate,.durable}.test.ts
├── subject.repo.ts — updateSubject and createSubject keep the parent advisory lock but stop calling hasChildSubjects/absorbParentItemsOnFirstChild. Must not change: cycle checks, parent_not_found/invalid_parent, delete reparenting, merge.
│     used by: subject.controller.ts, subject-suggestion.repo.ts (accept path)
│     tests: subject-parent.repo.integration.test.ts, subject-leaf.integration.test.ts, subject-delete-*.integration.test.ts
└── subject-leaf.integration.test.ts — rewrite: parent accepts; first child (create, reparent, child named Common) leaves sources on the parent and creates no Common; move into a parent succeeds; merge test unchanged.
apps/api/src/knowledge-source/
├── knowledge-source.controller.ts — rejectSubject keeps only the 400 subject_not_found branch; comment at :57 updated.
│     used by: router-table.ts
│     tests: knowledge-source.controller.test.ts:355 (409 case becomes "files under a parent subject"), .errors/.refusals/.duplicate mocks
└── knowledge-source.controller.test.ts — replace the 409 test with one proving a parent subject id is persisted.
apps/api/src/knowledge-bit/
├── knowledge-bit-move.repo.ts — MoveKnowledgeBitsError becomes "subject_not_found"; logic unchanged otherwise (curriculum-placed and unapproved still skipped).
│     used by: knowledge-bit-move.controller.ts; tests: subject-leaf.integration.test.ts
├── knowledge-bit-move.controller.ts — drop the 409 branch; not-found stays 404.
│     tests: knowledge-bit-move.controller.test.ts:66 (remove 409 case)
├── knowledge-bit-placement.repo.ts — listTopicsForPlacement drops the parent-subject exclusion and the listParentSubjectIds import; TOPIC_HIERARCHY_PROMPT_LIMIT unchanged.
│     used by: knowledge-bit-placement.orchestrator.ts, detect-knowledge-bits.controller.ts
│     tests: knowledge-bit-placement.repo.integration.test.ts:228 (flip to expect parent topics)
├── knowledge-bit-review-queue.repo.integration.test.ts — add: parent scope includes a card filed directly on the parent.
├── subject-review-due-counts.repo.integration.test.ts — add: parent's due/new counts include its own cards.
└── knowledge-bit-browser.repo.integration.test.ts — add: parent filter and counts include a card on the parent itself.
apps/api/src/subject-suggestion/
├── subject-suggestion-sub-subjects.ts — pool from pickSubSubjectPoolIds; pool size sums counts over pool ids; Common child still excluded as a candidate.
│     used by: subject-suggestion-scan.ts; tests: subject-suggestion-scan.test.ts:309,333
├── subject-suggestion-evidence.repo.ts — listBitsForSubject accepts a list of subject ids (interface in the same file and in subject-suggestion-scan.types.ts usage).
│     used by: subject-suggestion.orchestrator.ts, subject-suggestion-new-subject.ts (listUnplacedBits only); tests: subject-suggestion-evidence.repo.integration.test.ts
└── subject-suggestion-scan.test.ts — parent with own cards and children gets suggestions; parent with only a Common child still does.
apps/api/scripts/
├── seed-business-sub-subjects.ts — createChild inserts the child under the lock without absorb.
│     tests: apps/api/src/subject/seed/business-sub-subjects.seed.test.ts (store is faked; unchanged)
└── seed-knowledge-browser-demo.ts — add a "Common" child under Demo Programming with two or three cards.
packages/shared/src/
└── knowledge-source-refusal.ts — remove subject_has_children from REFUSAL_SENTENCES.
      used by: packages/shared/src/index.ts → api controllers, web add-knowledge; tests: knowledge-source-refusal.test.ts
apps/web/src/
├── knowledge-bit/use-knowledge-overview-move.ts — remove OVERVIEW_MOVE_HAS_CHILDREN_MESSAGE and its branch; generic failure message stays.
│     used by: knowledge-overview-screen.tsx; tests: none direct
└── routes/-add-knowledge.test.tsx — add: tick "Also allow parent subjects", pick a parent, the create call carries that parent id.
docs/architecture/subject/subject-hierarchy.md — new "Where cards live" section.
apps/ios/README.md:13 — drop "subject has sub-subjects" from the refusal list.
```

### Risk & rollout
- Blast radius: every path that files cards under a subject (add knowledge, bulk move, AI placement) and the AI sub-subject scan; see `architecture.md` "Failure modes" and "Rollout".
- The parent advisory lock in subject create/reparent must stay: it shares the lock space with subject merge and delete, so removing it would let a child be attached to a parent that is mid-delete.
- Installed phone and Mac builds need no release; they simply never receive the old refusal.
- Rollback is a plain revert; cards already on parents remain valid under the old code.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 1, 2, 5 | A parent subject with one sub-subject, several cards filed directly on the parent and some on the child | extend `apps/api/scripts/seed-knowledge-browser-demo.ts` (Demo Programming already has its own cards and the Demo TypeScript child) |
| SCENARIO 4 | A legacy "Common" child under that parent holding two or three cards | extend `apps/api/scripts/seed-knowledge-browser-demo.ts` |

### Documentation changes
- subject domain: update `docs/architecture/subject/subject-hierarchy.md` with a "Where cards live" section: any subject holds cards; adding or moving a sub-subject moves nothing; legacy "Common" children are ordinary sub-subjects; parent views roll up self plus descendants; the add-knowledge picker still lists sub-subjects first and shows parents behind "Also allow parent subjects"; the subject checker recommends only subjects without children.
- knowledge-bit domain: `apps/api/src/knowledge-bit/ingestion-pipeline.md` already describes the checker as leaf-only, which stays true; no edit. `docs/architecture/knowledge-bit/knowledge-browser.md` already describes the subtree filter; no edit.
- iOS: `apps/ios/README.md` refusal list.

### Decisions made autonomously
1. Existing "Common" sub-subjects are left untouched, no data migration — reversible later, and folding cards back could undo learner moves.
2. Creating, re-parenting or AI-approving a sub-subject moves no cards — the ask removes the reason the move existed.
3. The parent lock in subject create/reparent stays — it also serializes against merge/delete of the parent.
4. A parent's review, counts, browser filter and overview include its own cards plus descendants' — every read path already rolls up "self plus subtree"; kept consistent.
5. AI placement offers a parent's course topics — the exclusion existed only to enforce the lifted rule.
6. AI sub-subject suggestions pool the parent's own cards plus a legacy "Common" child's — keeps today's suggestions for migrated data and adds them for new parent cards.
7. The subject checker keeps recommending only subjects without children; parents stay only as homes for a proposed new subject — matches the add-knowledge picker's "sub-subjects first" default; logged as an owner question.
8. The add-knowledge picker keeps parents behind the "Also allow parent subjects" checkbox — that UX was chosen on 2026-10-11 and now works end to end; logged as an owner question.
9. The has-sub-subjects refusal is removed from the server, the shared sentences and the web move flow — nothing can produce it any more.
10. Phone and Mac app code is not changed — installed builds keep their mapping, which is now never triggered.
11. Deleting a parent that holds its own cards keeps today's delete behaviour — out of scope, listed as a risk.

### Implementation order
1. `pickSubSubjectPoolIds` — red-green-refactor, covers SCENARIO 7
2. Server write paths: existence-only subject check, add-knowledge and move routes without the 409, covers SCENARIO 1, 2, 8
3. Subject create/reparent and the Business seed without the Common move; delete the unused helpers, covers SCENARIO 3, 4
4. AI placement and sub-subject suggestion pool, covers SCENARIO 6, 7
5. Roll-up tests for review, counts and browser, covers SCENARIO 5
6. Shared sentences and web move message; web add-knowledge test, covers SCENARIO 1, 2, 8
7. Demo seed, docs, full checks, browser pass

### Scope boundary
- Subject checker recommending parent subjects: not changed (owner question).
- Add-knowledge picker showing parents by default: not changed (owner question).
- Folding existing "Common" sub-subjects back into parents: not done (owner question).
- What happens to a deleted subject's own cards: unchanged existing behaviour.
- Phone and Mac app code and a new app release: not needed.
- Editing the already-applied backfill migration: never.

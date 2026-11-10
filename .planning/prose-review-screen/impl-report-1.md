## Phase 3 implementation report

### What was done

Step 1 — `packages/shared/src/knowledge-bit.ts`: added `subjectName: string | null` to `PendingKnowledgeSourceForReview`.

Step 2 — `apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts`: imported `subjects` from schema, added `.leftJoin(subjects, eq(subjects.id, knowledgeSources.subjectId))`, selected `subjects.name` as `subjectName`, and mapped it into each grouped source entry.

Step 3 — `apps/web/src/knowledge-bit/knowledge-bit-review-source-group.tsx`: when `source.subjectName` is non-null, renders a small `<p>` label above the "Source text" heading using uppercase tracking-wide styling.

Step 4 — `apps/api/src/knowledge-bit/knowledge-bit-approval.repo.integration.test.ts`: added two cases under `listPendingKnowledgeBitsForReview` — "returns subjectName from linked subject when present" and "returns null subjectName when source has no subject".

### Cascade fixes

Adding `subjectName` as a required field required updating all other sites that construct `PendingKnowledgeSourceForReview` literals:
- `apps/api/src/knowledge-bit/knowledge-bit-approval-entries.repo.ts` — hardcoded `subjectName: null` (this file already had pre-existing unrelated TS errors)
- `apps/web/src/knowledge-bit/knowledge-bit-review-sources.ts` — extended `RemovedBitSnapshot` with `subjectName`, threaded it through `snapshotBit` and the `restoreBit` `!group` branch
- `apps/web/src/mocks/knowledge-bit-review.mock.ts` and five panel/sources test files — added `subjectName: null` to every source-literal

### Check results

`npx tsc --noEmit` (api, web, shared): no `subjectName` errors; pre-existing unrelated errors unchanged.
`npx vitest run` on touched non-integration files: 6 test files, 60 tests — all passed.

### Defaults

`subjectName: null` used wherever the subject is unknown or the source doesn't carry one, matching the existing nullable `sourceText` pattern.

END-OF-REPORT

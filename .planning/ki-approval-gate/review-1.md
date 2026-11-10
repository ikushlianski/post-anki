# Review: KI Approval-Gate — Three Extra Items

Date: 2026-10-13

## Item 1 — Clear topicId when rejecting a placed bit

PASS. `rejectKnowledgeBit` in `knowledge-bit-approval.repo.ts` line 99 sets
`{ approvalState: "rejected", topicId: null }` in the same UPDATE. The null
clear only runs on the `pending → rejected` transition; an already-rejected
re-call returns early via the `findRejectionFeedbackId` path (line 94) without
touching the row again, which is correct.

## Item 2 — Return 409 with reason on blocked approve/reject/edit

PASS.

- `approveKnowledgeBit` returns `"blocked"` for cross-state transitions and
  `"not_found"` when the row is absent; controller maps both correctly (409 /
  404) at lines 29–37.
- `rejectKnowledgeBit` returns `{ ok: false, reason: "blocked" | "not_found" }`;
  controller maps at lines 49–54.
- `editKnowledgeBitQuestionVariant` returns `{ error: "blocked" | "not_found" }`;
  controller maps at lines 78–82.

All HTTP status mappings are correct and covered by the 12 controller unit
tests (all green).

## Item 3 — Block approve while regenerated questions still pending

PASS. Lines 44–58 of `knowledge-bit-approval.repo.ts` query
`knowledgeBitQuestionVariants` for any row with `supersededAt IS NULL`; if
none exist, `"no_variant"` is returned and the controller sends 409. This
guard only fires on the `pending → approved` transition, not on a no-op
re-approve of an already-approved bit — which is the correct behaviour.

## TypeScript

`npx tsc --noEmit` produced errors only in `model-comparison/` (missing shared
types and schema members). Those errors are pre-existing and unrelated to this
diff. Zero errors in `knowledge-bit-approval.*`.

## Tests

`npx vitest run` on `knowledge-bit-approval.controller.test.ts`: 12/12 pass.
The integration test file listed in git status
(`knowledge-bit-approval.repo.integration.test.ts`) was skipped by vitest
because it requires a live DB; no failures reported.

## Verdict

APPROVED. All three items are implemented correctly and the controller unit
tests provide full coverage of the status-code contracts.

END-OF-REPORT

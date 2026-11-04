# Review: embedding scans report what they saved

VERDICT: PASS (personal-reviewer, Sonnet, read-only; review-factory not installed)

No Critical or High findings. All six scans count results that were returned and saved; `skippedCount` appears only when some items were skipped and is never negative. Shared result types gained an optional field; no consumer in the API or web app breaks.

Not covered by tests: the subject-duplicate and source-duplicate scans' skipped path, judged by reading (same length comparison as the tested scans).

Checks: 6 test files, 53 tests pass; `tsc --noEmit` clean for apps/api and apps/web.

Citation: apps/api/src/knowledge-bit/knowledge-bit-embedding.orchestrator.ts:37

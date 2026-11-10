# Inngest migration review: units A–D

## Review

state: needs-changes
reviewedBy: claude-sonnet-4-6 (effort: default)
Blocking issues: 2
  1. durable-extraction.starter.ts imports five members from knowledge-bit.repo.ts that were never added: `durableWorkflowExists`, `getKnowledgeSourceClaimToken`, `KnowledgeSourceClaimToken`, `markSourceOwnedByDurable`, `releaseDurableOwner` — `npx tsc --noEmit` fails for migration code with five TS2305/TS2724 errors; the starter cannot compile.
  2. `extractionCancelHandler` is defined and exported in extraction-inngest.workflow.ts but is absent from the serve handler registration (line 339 of api-server.ts passes only `[extractionInngestFunction]`); cancel events for sources with no active running workflow are silently dropped, leaving them in `processing` until reconcile.
Divergences from plan: 1
  Unit D claimed knowledge-bit.repo.ts was reconcile-sufficient; the five repo helpers the starter requires (owner-marker write/release, claim-token read, workflow-exists check) that the plan's approach section commits to keeping were not added.

---

## Phase 1: Scenario review

No `scenarios.md` present — MISSING-FROM-PLAN check not applicable per brief.

---

## Phase 2: Architecture review

Architecture planned: one HTTP endpoint on the existing node:http server, client id `post-anki-api`, env keys INNGEST_DEV/BASE_URL/EVENT_KEY/SIGNING_KEY/DURABLE_EXTRACTION_ENGINE, serve mounted at /api/inngest before the bearer gate, extractionInngestFunction with idempotency/concurrency/cancelOn/onFailure, starter picks adapter by DURABLE_EXTRACTION_ENGINE, reconcile via failProcessingSourcesWithEndedWorkflows(null) for Inngest-owned rows.

Architecture built: matches intent for client, serve handler, env, workflow function config, event types, starter engine selection, reconcile path. Two structural gaps: five repo helpers the starter depends on are absent; cancel handler function is defined but unregistered.

Infrastructure changes reflected in architecture.md: N/A — no architecture.md in this plan folder.
Self-resolved: None.
Divergences needing input:
  - Which file is the intended home for `getKnowledgeSourceClaimToken`, `markSourceOwnedByDurable`, `releaseDurableOwner`, `durableWorkflowExists`? They belong in `knowledge-bit.repo.ts` based on the plan's wording ("claim/owner markers stay"), but they are simply absent from the diff.
  - Should `extractionCancelHandler` be added to the `createInngestServeHandler([...])` call in api-server.ts?

---

## Phase 3: Code quality

Tests: pass (29/29 across inngest-serve.test.ts, extraction-inngest.workflow.test.ts, durable-extraction.starter.test.ts)
Type check: fail — 5 errors in migration-specific file durable-extraction.starter.ts (all missing-export errors from knowledge-bit.repo.ts); pre-existing errors in unrelated files also present but outside the scope of units A–D.
Lint: not run (blocked by tsc failure).
BAML tests: not applicable.
Self-resolved: None.
Needs your input:
  - Add the five missing exports to knowledge-bit.repo.ts to unblock tsc.
  - Register extractionCancelHandler in the serve call.

---

## Phase 4: Performance and security

[HIGH] Security: /api/inngest is correctly placed before the bearer gate, so Inngest SDK signature verification runs rather than shared-secret auth. However, CORS logic (origin check → 403 for disallowed origins) executes before the inngest branch is reached (lines 354-358 of api-server.ts). Inngest dev server makes server-to-server requests with no Origin header; whether resolveCorsDecision passes or blocks a missing-origin request is untested and unverified. If it returns `forbidden` for missing origins, the dev server cannot reach /api/inngest. The inngest-serve.test.ts verifies auth bypass but uses its own server that bypasses CORS entirely, so this code path has no test coverage.
Impact: local Inngest dev server blocked by CORS gate, extraction never triggered despite correct mounting.
Resolution: Escalated — read resolveCorsDecision to confirm missing-origin behaviour; if it can block, add a short-circuit for the inngest path before the CORS block or verify the CORS function passes through server-to-server calls.

[MEDIUM] Control flow: the outer catch in extraction-inngest.workflow.ts (lines 103-117) wraps `step.run("guard")` and `step.run("release")` in an inner try/catch that logs and swallows all errors before throwing NonRetriableError. If the Inngest SDK uses exception-based control flow for step scheduling (SDK version-dependent), those signals would be swallowed and the guard step could fail silently. Plan explicitly warned: "Do not let catch swallow SDK control flow." Tests pass because @inngest/test does not exercise real SDK control flow signals.
Impact: guard/release step may silently not run on certain SDK versions; source could be left in processing.
Resolution: Escalated — wrap only application errors, re-throw unknown/SDK exceptions, or move NonRetriableError throw to before the inner catch.

---

## Phase 5: Business feature explainer

Skipped — no user-facing display changes in units A–D (backend workflow infrastructure only).

---

## Detailed findings (worst first)

### BLOCKING-1: Five repo exports missing — tsc fails for migration code

`apps/api/src/knowledge-bit/durable-extraction.starter.ts` lines 10-15 import `durableWorkflowExists`, `getKnowledgeSourceClaimToken`, `KnowledgeSourceClaimToken`, `markSourceOwnedByDurable`, `releaseDurableOwner` from `knowledge-bit.repo.ts`. None are present in the file's diff or current state. `npx tsc --noEmit` produces five type errors (TS2305, TS2724). Tests pass only because the test file mocks the entire module via `vi.mock("./knowledge-bit.repo.js", ...)` before importing it. The functions themselves — owner-marker write/release and claim-token read — are architecturally essential: the starter uses them to atomically bind a source to a workflow id before sending the event and to release the marker if the send fails.

Fix: add `getKnowledgeSourceClaimToken`, `markSourceOwnedByDurable`, `releaseDurableOwner`, `durableWorkflowExists` to `apps/api/src/knowledge-bit/knowledge-bit.repo.ts`. Their signatures are implied by StarterDeps in the starter file and by the integration test in `durable-extraction.workflow.integration.test.ts`.

### BLOCKING-2: extractionCancelHandler defined but not registered

`apps/api/src/api-server.ts` line 339: `createInngestServeHandler([extractionInngestFunction])`. The `extractionCancelHandler` exported from `extraction-inngest.workflow.ts` is imported nowhere and never passed to the serve handler. When a cancel event arrives for a source whose workflow has already ended or not yet started, Inngest delivers the event but no function handles it; the source stays in `processing` until the stale-age reconcile fires (default 30 min). The `cancelOn` config on the main function only cancels a currently-running workflow execution; it does not handle the event when no run is active.

Fix: add `extractionCancelHandler` to the array: `createInngestServeHandler([extractionInngestFunction, extractionCancelHandler])` and import it in api-server.ts.

### HIGH: CORS gate executes before /api/inngest branch — dev server reachability unverified

`apps/api/src/api-server.ts` lines 354-358: `resolveCorsDecision` runs for every request including `/api/inngest`, and `if ("forbidden" in cors) { sendError(res, 403, ...); return; }` fires before the inngest branch on line 378. Inngest dev server sends requests without an Origin header. Whether `resolveCorsDecision` treats a missing origin as forbidden is not documented and is untested for the inngest path. `inngest-serve.test.ts` builds its own HTTP server that skips `createApiServer` and all CORS logic, so this interaction has no coverage. If missing origin is treated as forbidden, the dev server cannot poll or invoke steps.

Fix: move the `/api/inngest` branch before the CORS decision block, or confirm `resolveCorsDecision` returns a non-forbidden result when origin is undefined.

### MEDIUM: Inner catch in workflow outer-catch may swallow SDK control flow

`apps/api/src/knowledge-bit/extraction-inngest.workflow.ts` lines 103-113: the outer catch wraps both guard-step calls in a nested try/catch that logs and discards every exception before re-throwing `NonRetriableError`. Inngest SDK versions that use exception-based control signals for step scheduling (e.g., a special `StepError` to pause execution) would have those signals silently dropped. The plan explicitly notes: "Do not let catch swallow SDK control flow." The `@inngest/test` engine used in tests does not exercise this mechanism, so the tests do not catch the issue.

Fix: check whether the current SDK version uses exception-based control flow; if so, re-throw unknown exception types before logging, or restructure so guard/release steps do not sit inside a broad catch.

---

## Fix note (applied after review)

BLOCKING-1 resolved: added `KnowledgeSourceClaimToken` (with `run: number` and `claimedAt: Date`), `getKnowledgeSourceClaimToken`, `markSourceOwnedByDurable` (internal consistency guard + DB CAS on `updatedAt`), `releaseDurableOwner`, and `durableWorkflowExists` to `knowledge-bit.repo.ts`. All five missing exports now present; `npx tsc --noEmit` no longer reports errors in `durable-extraction.starter.ts`.

BLOCKING-2 resolved: imported `extractionCancelHandler` from `extraction-inngest.workflow.ts` in `api-server.ts` and added it to `createInngestServeHandler([extractionInngestFunction, extractionCancelHandler])`.

HIGH (CORS) resolved: confirmed `resolveCorsDecision` returns `{ noOrigin: true }` (not `{ forbidden: true }`) for missing-origin requests, so the CORS gate in `createApiServer` does not block the Inngest dev server. No early-return needed. Added a test to `inngest-serve.test.ts` that asserts this behaviour; `npx vitest run apps/api/src/shared/inngest-serve.test.ts` passes 4/4.

## Re-review verdict: PASS
END-OF-REPORT

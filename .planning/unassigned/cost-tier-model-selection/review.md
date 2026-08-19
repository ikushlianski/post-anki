---
type: review
branch: learn-from-doc-site
task: cost-tier model-selection setting
state: approved
reviewedBy: sonnet (this session, independent re-verification, fourth pass)
updated: 2026-08-19
---

# Re-review (pass 4): Cost-tier model selection

## Summary
Verdict: approved
Fourth independent pass over the same uncommitted diff. The one blocking issue from pass 3 — `stats.service.ts`'s "further reading" recommendation call silently ignoring the course it belonged to — is now fixed and independently reconfirmed: `apps/api/src/stats/stats.service.ts:137` passes `{ curriculumId }` into `webSearch`. A full sweep of every `webSearch(` and `agent.generate(` call site in `apps/api/src` found no remaining case where a subject/curriculum id was locally available but not threaded; the two intentionally scope-less sites (`decide.orchestrator.ts:47`, `probe-session.generate.ts:594`) match the accepted gaps spec.md already discloses. `npm run typecheck --workspaces` is clean across all 6 workspaces; `npx vitest run` reproduces the exact same baseline (38 failed / 3104 passed, 7 files) with no new failures.
Blocking issues: None.
Divergences from plan: unchanged carry-forwards from pass 3, all non-blocking (see below).

## Prior blocking issue — status
1. `stats.service.ts:133` `webSearch` call not threaded — **RESOLVED**, reconfirmed by direct read: `apps/api/src/stats/stats.service.ts:133-138` now passes `{ curriculumId }` as the 4th argument, `curriculumId` being the same parameter already used at the (now) `:141` log line.

## Independent call-site sweep (this pass)
Grepped every `webSearch(` and `.generate(` in `apps/api/src` (excluding tests):
- `webSearch`: 2 call sites (`study-material.orchestrator.ts:52`, `stats.service.ts:133`) both pass a scope; `probe-grounding.ts:157`'s internal call also scoped.
- `.generate(`: 22 call sites. 20 pass a `requestContext` (subjectId or curriculumId) sourced from a parameter already in scope. The 2 without: `decide.orchestrator.ts:47` (cross-curriculum blind-spot analysis, genuinely no single curriculum) and `probe-session.generate.ts:594` (multi-curriculum probe-quiz batch) — both match spec.md's "Scope boundary" section verbatim, which names exactly these two as accepted gaps that fall to the global tier only, never a pricier one.

No new unscoped call site found.

## Scenarios.md spot-check (all 8 marked [x])
- Scenario 1 (global default) — holds: `tier-resolver.ts:19-45`, `model-tier.test.ts:18-28` reconfirmed present.
- Scenario 2 (subject override) — holds at the deriver level; DB-backed cascade itself still has no direct integration test (carried, non-blocking, see Phase 1 detail below).
- Scenario 3 (curriculum override) — holds; the "clearing falls through" test is still a near-duplicate of the subject-override test in inputs/expectation (carried, non-blocking polish item, not a correctness gap — both paths do produce the correct fallthrough, just via redundant test data).
- Scenario 4 (every agent uses resolved tier) — holds: all 21+ `.generate()` call sites route through `dynamicResolvedModel`/`resolveAgentModel`; no hardcoded `env.CURRICULUM_MODEL` reads remain in `model.ts`.
- Scenario 5 (web-search grounding) — now holds cleanly: both `webSearch` call sites scoped, confirmed above.
- Scenario 6 (cheapest tier is real/text-capable) — holds; single source of truth `TIER_TO_MODEL_ID` in `model-tier.ts`, no second copy found via grep.
- Scenario 7 (admin changes global default) — holds; `updateAdminSettings` patches only provided fields, `getGlobalModelTier()` re-reads with no caching.
- Scenario 8 (subject/curriculum override set/clear) — holds; both UI controls explicitly write `modelTier: null` for "inherit," never a copied resolved value.

Self-audit: clean (6 checks) — every citation re-read directly from the live file this session, not copied from the prior review's text.

## Phase 3: Code quality
Tests: pass at baseline — `npx vitest run`: 38 failed / 3104 passed, 7 files failing, identical to the pass-3 baseline count. No new failures.
Type check: pass — `npm run typecheck --workspaces`, 0 errors across all 6 workspaces.
Lint: not configured (unchanged).

## Phase 4: Performance and security
No CRITICAL or HIGH issues newly introduced. Carried-forward, non-blocking findings from pass 3 (all judged acceptable to ship as-is, per task instructions on severity):
- `[MEDIUM]` Bare `as ModelTier` casts on stored values with no runtime parse (`admin-settings.repo.ts:12`, `subject.repo.ts:32,80`, `curriculum.repo.ts:2131,2236`) — only reachable via a direct DB write, not through the app's own write paths.
- `[LOW]` Duplicate near-identical test in `model-tier.test.ts` (Scenario 3's fallthrough case).
- `[LOW]` 4 hardcoded `'cheap'` fallback string literals instead of one shared constant.
- `[LOW]` Tier enum re-listed as a literal array in 3 web components instead of reading `modelTierSchema.options`.
- `[HIGH]` (carried, environmental, not self-resolvable from this repo) e2e's `CURRICULUM_MODEL` env pin is inert; whether the out-of-repo e2e mock server matches OpenRouter traffic by the new model id (`deepseek/deepseek-v4-flash-latest`) can't be verified from this checkout. Recorded as an open item below.

## Open items (not blocking, recorded for the human)
- e2e mock-server compatibility with the new default model id — needs a live e2e run against the actual mock service to confirm, out of scope for a repo-only review.
- No component/integration tests for the admin-settings tier picker or the subject/curriculum override pickers (BE repo-level logic is tested; UI wiring isn't).
- `docs/architecture/curriculum/model-selection.md` doc still doesn't exist — spec.md already discloses this as an intentional follow-up once admin-settings itself is confirmed and merged, not an oversight.

## Final output
Review complete. No blocking issues.
Reviewed by: sonnet (this session, fourth independent pass)
review.md → state: approved

Files:
- review.md — this file.
- scenarios.md — all 8 scenarios confirmed PASS this pass (Scenario 5 upgraded from PARTIAL to PASS).
- spec.md — Scope boundary section now accurately names every call site, including `stats.service.ts`.
- todo.md — all 8 coding tasks confirmed done; no reopen needed.

Next: ready to commit/squash. Recommend confirming e2e model-id compatibility before merging to main, but that check requires an actual e2e run, not further code review.

---
type: discussion
branch: workplace-scenario-packs
state: confirmed
updated: 2026-07-28
---

# Discussion log — run autonomously, no human present

This session ran under `grand-loop-playwright`'s autonomy override: every fork was resolved with a
reversible, codebase-consistent default and logged here.

## Complexity assessment

```
Complexity: Medium
Reason: 3 e2e scenarios, one real test-infrastructure change (the mock LLM's phrase-batch
  responder becomes pack-aware), zero application code changes, zero action gaps. Downgraded from
  "Simple" despite the small footprint because the central claim ("packs theme content, provably")
  needed real investigation to avoid a circular test — that investigation surfaced a genuine gap
  (the mock is currently pack-blind) worth grill-me scrutiny, not a mechanical two-file spec.
Planning path: Full planning + grill-me (no grill-plan — not Very Complex; a single, well-scoped
  test-infrastructure change with no data-model or cross-service implications).
```

## Branch-defining fork (resolved first — this reshaped the entire rest of the plan)

**1. Is this a build ticket or a verification-gap ticket?** The wishlist item reads like ordinary
feature-porting work ("port workplace scenario packs"), matching the shape of every other item in
the active queue. Before drafting any scenario, direct reads of `apps/api/src/mastra/
language-practice.agent.ts`, `generate-phrase-batch.orchestrator.ts`, `practice.controller.ts`,
`apps/web/src/practice/pack-select.tsx`, `batch-practice.tsx`, and `apps/api/src/db/schema.ts`
established that every piece of application code the source app's own
`.bmad/workplace-scenario-packs/spec.md` called for already exists on `main`, byte-for-byte
matching that spec's decisions — landed as scaffolding-ahead-of-need during the two earlier,
already-shipped batch-practice and phrase-bank-mastery ports. **Decision: plan this as a
verification-gap ticket.** This is the fork that collapsed "Files to touch" from a multi-layer
application change down to one test-infrastructure file plus three test files — see `spec.md`'s
"Headline finding" for the full evidence trail (git log confirms `pack-select.tsx` and the `Pack`
enum first landed in commit `5a21fa1`, not any workplace-scenario-packs-branded commit).

## Independent leaves (batched, each with a recommended default applied)

**2. Retry-storm-guard fix — port it or not?** The source commit bundles two unrelated things (per
its own commit message: a retry-storm bug fix + the pack feature). Direct read of
`apps/web/src/practice/use-practice-batch.ts` showed a guard mechanism (in-flight ref +
`lastFailedKeyRef` keyed on `level:pack` + `AbortController` cleanup for stale in-flight calls +
`lastResetKeyRef` reset-idempotency) that is strictly a superset of what the source app's fix does,
and it's already e2e-proven by `@english-batch-practice.S5`
(`retry-storm-guard-bounds-failed-generate`), which even exercises a real pack switch. **Decision:
explicitly out of scope, stated as such in `spec.md` and `playwright.md` so no future reader
reopens it.**

**3. DB-layer assertion mechanism.** The source app's plan used a `queries/read-settings-pack.ts`
layer. Post-anki's verification-repo feature folder (`features/practice/`) has no `queries/`
directory — confirmed by listing the folder. The precedent already established by
`check-my-writing-mode`'s S1 test (`countWhere`/`getRow` from `db/pg.ts`, used directly inline in
the test) is the one this plan follows instead. **Decision: `countWhere`/`getRow`, no new query
layer.**

**4. How many packs need real themed mock content?** The source app's own plan wrote 2 themed
mock-data fixtures (`code-review-pack`, `incident-postmortems-pack`) for its 2 content-scenarios.
This plan's scenarios only exercise `CodeReview` (S2/S3). Considered: write themed content for only
`CodeReview` and let the other 3 named packs fall through to a default/error. **Decision: give
every named pack (not just `CodeReview`) a real, minimal, distinct themed content block, with a
strict throw for anything outside the 5-value enum.** Reasoning: the property being ported from the
source commit is specifically "no wildcard fallback, every declared value must be honest" — a mock
that silently defaults `StandupUpdates`/`IncidentPostmortems`/`GivingFeedback` to General's content
would reintroduce exactly the kind of untagged-stub leak the source commit's own fix closed,
just relocated from "missing pack tag" to "missing pack branch." The extra cost is small (three more
templated string blocks, no new files, no new scenarios) and removes a trap for whichever future
ticket picks one of those three packs first.

**5. Cross-test settings contamination — does post-anki share the source app's bug class?** The
source app's `.planning/LOG.md` 2026-07-18 entry documents a real production-adjacent bug: a single
shared `settings` row (no subject concept in that app) left non-General by one test silently leaked
into the next test's first page load, since nothing reset it between tests. Checked
`apps/api/src/db/schema.ts`: `languagePracticeSettings.subjectId` is the table's primary key, and
every practice e2e test (existing and this plan's new ones) creates its own fresh subject via
`setupLanguagePracticeSubject`. **Decision: no risk to mitigate — no "switch back to General before
the test ends" hygiene step needed**, unlike the source app's tests. Recorded explicitly in
`spec.md` decision 4 and `state-fixtures.md`'s "State suites" section so a future reader doesn't
assume this gap exists here too.

**6. Should S3 reuse S2's subject, or get its own?** Considered chaining S3 directly off S2's test
(same subject, same generated CodeReview batch) to save one `setupLanguagePracticeSubject` call.
**Decision: S3 gets its own fresh subject and reproduces the CodeReview-then-General sequence
inline.** Reasoning: test-order independence — Playwright doesn't guarantee S2 runs before S3
(this repo's `fullyParallel` config aside, scenario tests shouldn't assume execution order of
sibling files), and a shared subject would make S3's "the earlier CodeReview rows are untouched"
assertion depend on S2 having already run and left exactly 10 rows in a known state. The extra
subject-creation cost is one more front-door call, already this project's established per-test
pattern.

## Grill-me — critical self-review of the plan just written

**Q1 (recommended: no regression risk). Does making `buildPhraseBatchStub` require a `userText`
argument break any existing caller?** Checked: the function has exactly one call site
(`mock-openrouter/responses.ts`'s `phrase-batch-generate` responder, `content: () =>
JSON.stringify(buildPhraseBatchStub())`). No other file imports `buildPhraseBatchStub` directly
(confirmed by the earlier grep across `mock-openrouter/`). **Answer: no regression risk — one call
site, updated in the same change.**

**Q2 (recommended: preserve the counter). Does adding a pack branch risk breaking
`phraseBatchGenerateCallIndex`'s "second batch differs from first" guarantee, which existing tests
like `batch-finish-auto-advances-to-prefetched-batch` depend on?** This is the real risk in this
plan's one code change. **Answer, and how it's mitigated:** `spec.md`'s "Mock LLM mechanism"
section requires the counter to be threaded into *every* pack's templated string, not just
General's — e.g. `` `Code review stub, generation ${generation}, item ${index + 1}` `` — so two
consecutive calls under the same pack still produce distinguishable content (via `generation`
incrementing) exactly as they do today, and switching pack additionally changes the marker prefix.
This constraint is written directly into `spec.md`'s Code acceptance for S2/S3, not left implicit.

**Q3 (recommended: no new scenario needed). Should there be a 4th scenario proving the mock throws
on an unrecognized pack, to actually prove the "no wildcard fallback" property rather than just
asserting it in prose?** Considered adding a scenario that forges a malformed `Pack:` line and
expects a mock 500. **Answer: no — rejected.** The malformed-pack case can only be reached by a
request the real application never sends (the app's `packSchema` — a Zod enum — rejects any
non-enum value before `updatePracticeSettings` ever persists it, and `generatePhraseBatch`'s `pack`
parameter is always one of the 5 typed values by the time it reaches `buildPhraseBatchPrompt`). A
scenario exercising it would have to bypass the real UI/API entirely to construct the malformed
request, which fails this project's own "actions drive the real UI/API, never bypass it" convention
— it would be testing the mock in isolation, not the product. The throw-on-mismatch behavior is
still real and still valuable (it turns a *future* mistake — e.g. a typo'd pack name added to the
mock without a matching branch — into a loud failure instead of silent wrong content), it just
isn't something this plan's e2e layer can meaningfully exercise from the front door. Left as a
code-level property, not a scenario.

**Q4 (recommended: keep 3, don't split S2 further). Should "content is themed" and "DB rows carry
the right pack" be two separate scenarios instead of one?** **Answer: no — keep them together.**
They're the same behavior observed at two layers (UI text, DB row), not two distinct behaviors;
splitting them would mean generating two separate batches to prove one claim, doubling LLM-mock
round trips and test runtime for zero additional coverage. This matches the Phase 6.0 triage's
"merge" guidance — same flow, multiple asserts, one test.

**Q5 (recommended: no new architecture.md). Does a test-infrastructure-only change ever warrant an
architecture.md, given this repo's own trigger list (new async boundary, new service, sync→async
change, significant ownership shift, infrastructure change)?** **Answer: no.** None of those
triggers apply to a mock HTTP server's response-selection logic; it's not part of the deployed
system, has no async-boundary or ownership implications, and changes no infrastructure resource.
Confirmed consistent with `check-my-writing-mode`'s and `phrase-bank-concurrency-fix`'s own
precedent for when `architecture.md` is/isn't warranted.

No answer above changed a previously-written plan file — all five were confirmed against what
`spec.md`/`scenarios.md`/`state-fixtures.md` already said, or (Q2) were already the reason those
files were worded the way they are.

## Consistency gate

Run inline against the four written artifacts (`spec.md`, `scenarios.md`, `playwright.md`,
`state-fixtures.md`):

1. **Scenario → Acceptance.** PASS — SCENARIO 1/2/3 each have a full `Acceptance:` block with
   Code/Behavior/Integration/Observability populated (Code explicitly "None" for S1, since it makes
   no mock-LLM call).
2. **Scenario → e2e box.** PASS — each scenario carries exactly one unchecked
   `[ ] @workplace-scenario-packs.S<N> — e2e test written` line, born unchecked per this skill's
   contract.
3. **Scenario → state contract.** PASS — `state-fixtures.md` has a full per-scenario contract for
   all 3 scenarios, every entity tagged subject/scenery, state source `additive-seed` throughout,
   reseed strategy `wipe-and-replay-baseline-plus-mocks` for all three.
4. **Scenario → action map.** PASS — `playwright.md`'s scenario→action map covers all 3 scenarios;
   the "Action gaps consolidated" table is explicitly empty (no gaps this plan introduces); no
   scenario composes an action absent from both the existing-action list and a gap entry.
5. **Diagram → scenario/architecture.** PASS (vacuously) — no Mermaid diagrams were written; none of
   the 3 scenarios' branching or this change's structure was complex enough to earn one (a
   single-file, single-function mock change with 3 straightforward e2e flows).
6. **Deriver.** PASS (vacuously) — no Code acceptance item in this plan is pure-logic-with-no-flow-
   surface; the one Code item (the mock's pack-parsing) is inherently only provable end-to-end
   through the e2e scenarios themselves (see grill-me Q3), not a candidate for a standalone unit
   test/deriver.
7. **Documentation.** PASS — no `architecture.md` was written (grill-me Q5), so this check does not
   apply; `spec.md`'s "Documentation changes" section states this explicitly rather than leaving it
   blank.
8. **Constitution + framework safety.** PASS — no scenario seeds its own subject (all three tag the
   generated `phrases` rows as front-door subject), no forbidden target is touched (local e2e
   Postgres only, per `project.json`), no scenario is parked as a future `test.skip`, all three run
   local-DB-only per this project's own e2e stack.
9. **Open questions → carried.** PASS (vacuously) — `scenarios.md`, `playwright.md`, and
   `state-fixtures.md` each state "None" / "None carried forward" explicitly rather than omitting
   the section.

**Consistency gate: PASS — spec.md / scenarios.md / playwright.md / state-fixtures.md promoted to
confirmed.**

Plan auto-confirmed by grand-loop-playwright overnight planning run 2026-07-28 — no human reviewer
available.

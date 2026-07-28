---
type: discussion
branch: check-my-writing-mode
state: confirmed
updated: 2026-07-28
---

# Discussion log — run autonomously, no human present

This session ran under `grand-loop-playwright`'s autonomy override: every fork was resolved with a
reversible, codebase-consistent default and logged here. No genuine no-safe-default architectural
fork was found — everything below resolves cleanly against existing patterns already established in
this repo (most importantly, `phrase-bank-panel.tsx`'s off-Electric REST+react-query precedent and
`batch-practice-electric-fallback`'s recent Electric-only-read-hang fix one wishlist item earlier).

## Branch-defining forks (resolved first, would have reshaped the rest of the plan)

**1. Electric sync vs plain REST for the history list.** The source app used Electric/TanStack-DB
exclusively. Post-anki's own language-practice UI is a deliberate hybrid — the phrase-batch stream
uses Electric, but the Phrase Bank panel deliberately does not (explicit code comment citing
"decision 9 in architecture.md"). Post-anki also just fixed a real production bug
(`batch-practice-electric-fallback`, commit `55aabd7`) caused by exactly the failure mode porting
the source's Electric-only history list verbatim would reintroduce. **Decision: plain REST +
react-query**, mirroring the Phrase Bank panel exactly — no new Electric collection, no shape
allowlist entry.

**2. Subject scoping.** The source app has no subject concept at all (globally English-only).
Post-anki's entire English feature set is scoped under `subjects.kind = 'language-practice'`.
**Decision: `writing_checks` gets a `subjectId` column** (no FK, matching every other
language-practice table's existing convention), and the route hangs off
`/practice/:subjectId/check-writing`.

**3. BAML → Mastra.** Post-anki has no BAML. **Decision: new Mastra agent**
(`AGENT_KEYS.writingCheck`), new file, structured output via the same `agent.generate(prompt, {
structuredOutput: { schema } })` mechanism every existing agent uses, reusing the existing
`verdictSchema` rather than inventing a new scale.

**4. Migration convention.** The source app's decision was "no migration tool exists, ad-hoc
`CREATE TABLE`." Post-anki has Drizzle. **Decision: port the table shape, discard the ad-hoc-CREATE-
TABLE reasoning** — real migration via `db:generate:api`/`db:migrate:api`.

**5. The auth scenario (source S3) doesn't port as a same-shaped scenario.** The source app's
`requireAdminMiddleware` is attached per-server-function — a real thing to forget on a new
function/table, which is exactly what that scenario existed to catch. Post-anki's auth is one
global gate in `server.ts`'s `authorized()`, called once before any route dispatch — structurally
impossible to forget on a new route, since the gate wraps `handleRequest()` itself, not each
handler. **Decision: do not port an S3-shaped scenario.** Documented explicitly in `playwright.md`'s
scenario triage rather than silently dropped.

## Independent leaves (batched, each with a recommended default applied)

**6. New route vs. a section on the existing practice page.** `/practice/:subjectId` already
manages `BatchPractice`'s own generating/grading loading state plus the Phrase Bank panel. Adding a
third generating/grading-shaped surface would recreate the exact UX collision the source app's own
decision #4 explicitly avoided by choosing a separate route. **Decision: new route**, same
reasoning, adapted — with a nav link from the existing practice page.

**7. New route's kind-guard: copy `practice.$subjectId.tsx`'s loader check, or write new logic?**
The existing route already has `subject.kind !== 'language-practice' → notFound()` in its loader.
**Decision: copy the identical check into the new route's loader** — 3 lines, already proven by
existing tests on the parent route, not worth a dedicated new e2e scenario (see `playwright.md`'s
"Not e2e" section for the explicit reasoning, matching this skill's merge-triage guidance for a
genuinely redundant path).

**8. Agent file placement.** New file (`writing-check.agent.ts`) vs. appended to the existing
`language-practice.agent.ts` (which already holds `phraseBatch` + `gradeBatch`). **Decision: new
file** — mirrors the source app's own entity-first-separation reasoning for keeping
`writing_check.baml` out of `practice.baml`, adapted to this codebase's flat `*.agent.ts`
convention. Reversible either way; chosen to keep the port's own reasoning intact rather than
re-litigate it against a marginally different file-organization convention.

**9. Repo file placement.** New file (`writing-check.repo.ts`) vs. added to `practice.repo.ts`
(currently 106 lines). **Decision: new file** — matches this folder's own existing precedent
(`phrase-bank.repo.ts` is already split out from `practice.repo.ts` for a finer-grained entity), and
keeps files under this project's ~150-300 line guideline as they grow.

**10. Server-side length cap on submitted text.** Not requested by the wishlist, but an unbounded
textarea feeding an LLM call directly is a cheap, reversible guard already precedented by the
source app's own identical decision. **Decision: `z.string().trim().min(1).max(5000)`**, same as
source — no dedicated e2e scenario for the max-length edge (S3's whitespace-only case already
proves the same validator mechanism).

**11. `architecture.md`: write it or not?** Checked against the trigger list (new async boundary,
new service, sync→async change, significant ownership shift, infrastructure change). A new table on
the already-built Postgres/Drizzle pipe and a new agent on the already-built Mastra registry are
feature additions on existing architecture, not shifts to it. **Decision: no `architecture.md`** —
same reasoning the source app's own plan used.

## Consistency gate — self-check log

1. Scenario → Acceptance: PASS — all 3 scenarios have Code/Behavior/Integration/Observability/Tests
   blocks, each layer populated (no scenario needed an explicit `None`, since all 3 have real
   BE+FE+Infra surface).
2. Scenario → e2e box: PASS — S1-S3 each carry exactly one unchecked
   `[ ] @check-my-writing-mode.S<N> — e2e test written` line.
3. Scenario → state contract: PASS — every scenario has a `state-fixtures.md` row with concrete
   state, subject/scenery tagging, state source, and reseed strategy.
4. Scenario → action map: PASS — every scenario appears in `playwright.md`'s map; the one action gap
   (`checkWriting`) and the one mock-openrouter responder gap are both in the consolidated tables
   with their used-by lists.
5. Diagram → scenario/architecture: PASS (vacuous) — no Mermaid diagrams added; none needed (no new
   async flow complex enough to warrant one).
6. Deriver: PASS (vacuous) — no pure-logic Code item flagged unit-worthy by the Phase 6.0 triage
   beyond the orchestrator/repo unit tests already named in `spec.md`'s DoD, which aren't
   scenario-bound derivers; all 3 scenarios are e2e-verdict.
7. Documentation: PASS (vacuous) — no `architecture.md` was written, so the mandatory documentation-
   impact check doesn't trigger; `spec.md`'s own "Documentation changes" section states this
   explicitly rather than leaving it blank.
8. Constitution + framework safety: PASS — no migration bypassed (Drizzle used correctly), no
   IaC/Console patching, no scenario seeds its own subject (S1-S3 all treat the language-practice
   subject as scenery, created via the existing `subject` feature's action, never seeded directly by
   this ticket's own fixtures), no scenario targets a forbidden target, no scenario is parked as a
   future `test.skip`, all tests run against the project's local e2e Postgres stack.
9. Open questions → carried: PASS (vacuous) — `scenarios.md`'s "Open questions" section explicitly
   states none carried forward, with the reasoning for why the source app's two open items don't
   apply here.

All 9 checks PASS. `spec.md`, `scenarios.md`, `playwright.md`, and `state-fixtures.md` promoted from
`draft` to `confirmed`.

## Grill-me pass (self-adversarial re-read, run before final confirmation — no second human/model
available in this unattended run, so this is a deliberate second pass over the same plan rather than
a fresh subagent red-team)

Two things checked hardest, both held up:

1. **Does dropping the source's S3 (auth) scenario leave a real gap?** Re-checked: the global gate
   in `server.ts` is structurally in front of `route()` dispatch — grep-confirmed no route bypasses
   `handleRequest()`. A new route file cannot accidentally skip it the way a new server-function in
   the source app's per-function-middleware design could skip attaching `requireAdminMiddleware`.
   This is a real structural difference, not an assumption — holds.
2. **Does the mock-openrouter responder for `writingCheckAgentSchema` actually avoid colliding with
   `grade-batch`'s matcher?** `grade-batch` matches on `ctx.schemaProps.includes('gradedAnswers')`.
   The new schema's top-level keys are `score`/`verdict`/`feedback`/`nativeAlternatives` directly —
   `gradedAnswers` is never a top-level key here, so `grade-batch`'s matcher never fires for this
   agent's requests, and a new matcher keyed on `nativeAlternatives` present AND `gradedAnswers`
   absent (or simply `nativeAlternatives` present, since no other existing responder's schema
   carries that key at the top level — confirmed by grep across `responses.ts`) is unambiguous.
   Placement in the responder list only needs to come before the generic catch-alls
   (`study-chat`/`web-grounding`), same constraint already documented for the two existing practice
   responders — noted explicitly in `playwright.md`'s action-gap row so `/implement-playwright`
   doesn't have to re-derive this.

No corrections needed to any plan file as a result of this pass.

## Second grill-me pass — three real corrections found and fixed

A second adversarial re-read (after the first pass above already promoted files to `confirmed`)
found three real gaps the first pass missed. All three are fixed in place — `spec.md`,
`scenarios.md`, `playwright.md`, and `state-fixtures.md` now reflect the corrected versions.

1. **No enqueue/response-queue mechanism exists in post-anki's mock-openrouter.** The draft plan
   described S1/S2 as "enqueuing" a stubbed response before submit — the source app's BAML
   `dequeueStub`/`POST /api/test/mock-baml` FIFO idiom, carried over by habit. A direct read of
   `mock-openrouter/responses.ts` shows every responder is a pure function of the request
   (schemaProps + `ctx.userText` matching, no queue, no enqueue endpoint) — this is the same
   silent-fail-closed failure class `english-subject-merge`'s `LOG.md` entry already recorded once
   for a different agent. Fixed: the new `writing-check` responder selects between the two S2
   fixtures by matching the submitted text inside `ctx.userText` (the agent prompt embeds the
   submitted text verbatim), the same content-branching technique this mock already uses for
   `ENRICHMENT_REDUNDANT_MARKER`/`LECTURE_COMPILE_FORCE_FAIL_MARKER` — order-independent, no queue
   needed. Updated in `spec.md` (Files to touch), `scenarios.md` (S1/S2 Integration blocks),
   `playwright.md` (action-surface note + pre-test-state table), `state-fixtures.md` (both
   scenario rows).
2. **The new route as originally named would not have rendered.** `practice.$subjectId.tsx`'s
   `PracticePage` component has no `<Outlet/>` — a plain `practice.$subjectId.check-writing.tsx`
   file would file-route-nest under it with nowhere to mount. Fixed: renamed to
   `practice.$subjectId_.check-writing.tsx` (trailing-underscore escape), matching this codebase's
   own existing precedent for exactly this shape — `curriculum.$curriculumId_.assess.tsx` and
   `curriculum.$curriculumId_.stats.tsx` both opt out of nesting under the equally
   `<Outlet/>`-less `curriculum.$curriculumId.tsx` the same way. The resulting URL is still
   `/practice/:subjectId/check-writing` (confirmed via `routeTree.gen.ts`'s `fullPath` for the
   curriculum precedent — the underscore is a file-routing convention, not part of the URL).
   `practice.$subjectId.tsx` itself needs no change beyond the new nav link. Updated in `spec.md`
   decision 3, "Files to touch", and "Implementation order".
3. **Two smaller DoD-consistency gaps**, neither a design fork: (a) the Backend DoD named
   `writing-check.orchestrator.test.ts`/`writing-check.repo.test.ts` without listing them under
   "Files to touch"/"Implementation order" — added to both; (b) the POST response shape omitted
   `createdAt`, which S2's newest-first history ordering and the shared `WritingCheck` type both
   depend on being present on every row — added to the response shape, decision 4, and the Backend
   DoD bullet.

None of these three change the plan's branch-defining forks (Electric-vs-REST, subject scoping,
Drizzle migration, BAML-vs-Mastra, dropping the source's auth scenario) — they're implementation-
detail corrections within forks already settled. Re-ran the consistency gate's 9 checks after these
fixes — all still PASS; the S-tag cross-references (`@check-my-writing-mode.S1`-`S3`) between
`scenarios.md` and `playwright.md` remain consistent, confirmed by direct grep after editing.

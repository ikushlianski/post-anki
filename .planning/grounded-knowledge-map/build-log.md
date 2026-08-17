# Grounded knowledge map — build log

## Phase 1 build log (autonomous overnight build, scenarios 1-9)

Built and independently proven via real `npx vitest run`, real `curl` against a
locally-running API (port 8130, since 8030/3000 were held by another session),
and real Playwright-driven browser interaction (chromium, launched directly —
never `mcp__chrome-devtools__*`). Full pass/fail detail is in the run report;
summary here is what a human needs before merging.

**Migration sequencing (per the "review/clarify" note above):** generated
incrementally, Phase-1-only — a single migration `0013_wooden_lake.sql`
adding just `sources.approval_status`. Applied cleanly to the shared local
dev Postgres (was completely empty when I started — no conflict risk from
other concurrent worktrees).

**Deviations from spec.md, each with why:**

1. **`preferredLevel` is no longer threaded into research-triggered
   generation.** Today's bare-name path already drops it (no third arg
   passed); the new gate makes docUrl-triggered creation go through the same
   async gap as bare-name, and there's nowhere planned to persist a
   transient creation-time value across that gap without an unplanned
   schema column. Kept in scope for `createCurriculumInput` (harmless,
   unused for research) rather than removing the level picker UI.
   Consequence: a research-triggered curriculum's topics now always start
   `included: false` regardless of the level picked at creation (same as
   bare-name already behaved) — the docUrl+level-picker combo loses its
   pre-inclusion bias. Restoring it would need a persisted
   `curricula.preferredLevel` column, deliberately deferred, not silently
   dropped — flagging it here for a follow-up decision.
2. **Origin-tracking marker row.** `resolveCurriculumOrigin` classifies a
   curriculum as "research" vs "sources" purely from source *kind*, but
   Phase 1 now stores individual candidate rows (mostly kind `link`) instead
   of one combined `web_research`/`llms_txt` blob. Fixed by keeping the
   existing `insertResearchSource` call as an always-approved,
   never-a-candidate marker row (kind `web_research`, empty grounding text)
   inserted at the start of candidate gathering — same pattern this file
   already used for exactly this reason, just extended. The
   `getApprovableSourceCount` gate check excludes this kind so it can never
   satisfy SCENARIO 4's "≥1 approved" requirement on its own.
   **Known edge case (flagged by review, not fixed):** for a docUrl-created
   curriculum where the learner ends up generating with zero real
   candidates (SCENARIO 5's override), the marker's `value` is the original
   docUrl itself, which `getCurriculumCitableUrls` counts as a citable URL
   — so the SCENARIO 8 "ungrounded" notice won't fire for that one specific
   combination (docUrl + override + zero candidates). Bare-name override is
   unaffected (marker's value is a name, not a URL) — verified directly,
   this exact case renders `hasCitableSources: false` correctly.
3. **Bug fix outside Phase 1's file list:** `docResearchPlanSchema`'s
   `strictOrder: z.boolean().optional()` (in `curriculum-research-plan.ts`)
   fails OpenAI/Azure-routed strict-mode structured output with "'required'
   is required to be supplied and to be an array including every key in
   properties" — a pre-existing bug (confirmed unrelated to my diff: the
   pasted-source path using a different, non-optional-field schema works
   fine in the same environment). This 400'd on every real
   `generateCurriculumFromApprovedSources` call and blocked getting real DoD
   proof, so I changed it to `.nullable()` (matches the working pattern
   already used elsewhere per this session's own memory notes). This file
   is also touched by Phase 3 (adding a `tags` field) — small rebase surface
   for whoever builds Phase 3 next, not a conflict, just a heads-up.
4. **Real bug found and fixed in `source-fetch.ts` and `doc-link-grounding.ts`:**
   fetching an approved PDF/binary candidate (arxiv/ACL papers turn up
   routinely from the general trusted-source search) can pull NUL bytes and
   other control characters into the fetched text, which Postgres's `text`
   column rejects outright at insert time — crashed
   `generateCurriculumFromApprovedSources` for real. Both files now strip
   control characters (except normal whitespace) before storing fetched
   text. This is new-in-Phase-1 exposure (candidate gathering is the first
   code path that auto-approves-and-fetches a large, diverse set of
   arbitrary discovered URLs at volume) — not present before this build.
5. **Retry-research now wipes ALL source rows for the curriculum**, not just
   `web_research`/`llms_txt` kind (the old `deleteResearchSources` filter),
   since real candidates are now kind `link` too. Added
   `deleteAllCurriculumSources`; the old function was removed since nothing
   else called it.
6. **Real second gate leak found and closed:** `POST /curricula/:id/reparse`
   only ever blocked on `status === "curating"` — an
   `awaiting_source_approval` curriculum passed straight through to
   `reparseCurriculum` → `parseCurriculum`, which reads every source row
   with no `approvalStatus` filter and generates immediately. That's a
   second, ungated path to synthesis, directly violating SCENARIO 2 ("no
   path... other than the approval action") and SCENARIO 4. Not reachable
   from today's web UI (the curriculum page only renders the approval panel
   in that state) but callable directly. Fixed: `handleReparse` now 409s
   with `awaiting_source_approval` for a curriculum in that state. Verified
   with a real `curl` reproduction before and after the fix — before: would
   have generated; after: real 409, curriculum verified still
   `awaiting_source_approval` with 0 modules.

**Known, accepted (not a bug):** the sibling repo's `study-technology-doc-url`
Playwright test (in `verification-repo`, not this repo) asserts a docUrl
creation reaches `status: ready` synchronously with level-tier pre-inclusion.
Both invariants are intentionally gone in Phase 1 (the gate, and deviation #1
above) — that test will fail red until someone updates it for the new gated
flow. Flagged here explicitly per the task's instruction, not discovered
silently.

**Manual verification performed (real, not self-declared):**
- Backend: `npx vitest run` per workspace — 93/93 api, 203/203 core,
  13/13 web, 84/84 bot, all passing, including new tests for
  `extractSameSiteLinks`/`dedupeSourceCandidates` (10 tests) and
  `isApproveSourcesBlocked` (4 tests).
- `npx tsc --noEmit` clean in every workspace (shared, core, api, web, bot).
  No project-wide ESLint exists in this repo (only `apps/bot`'s "lint" script,
  which is itself just `tsc --noEmit`) — typecheck is the applicable gate.
- Real `curl` runs against a locally-running API (multiple real technologies:
  Next.js, Temporal, Redis, PostgreSQL, Kafka, plus a deliberately obscure
  name) proving: bare-name creation lands on `awaiting_source_approval` with
  real pending candidates (never straight to `ready`); zero-approved
  approve-sources with no override returns a real 400, never a 2xx; the
  override path proceeds and correctly yields `hasCitableSources: false`;
  the full remove-candidate + add-manual-link + approve sequence generates
  real modules/topics (5-module Redis/PostgreSQL curricula) only after that
  call, never before.
- Real Playwright (chromium, `@playwright/test`, launched ad hoc — never
  `mcp__chrome-devtools__*`) against `npm run dev`-equivalent processes:
  screenshotted and interacted with the actual `SourceApprovalPanel` — 21
  real candidates rendered with discovery-tier-labeled titles, clicked
  "Remove" on one (count dropped 21→20, verified via reload), typed and
  submitted a manual link (count 20→21, link visible), clicked "Approve &
  generate", polled until the page showed the normal curate/confirm bar with
  6 real generated modules. Also screenshotted the zero-candidate state:
  warning text + the distinctly-labeled "Generate anyway (ungrounded)"
  button, no normal approve button present.
- Did not exercise the home/board page (Electric-sync-based) — the running
  local Electric container is wired to the production Neon database, not
  local dev Postgres, so pointing an ad hoc verification instance at it
  would have shown production data. Not part of Phase 1's new UI surface
  (the board's existing subject/curriculum list is unchanged); skipped
  rather than risk touching prod-wired infrastructure.
- Left the local dev database (`postanki_dev` on :5437) with the test
  subject/curricula created during verification (named `Next.js`,
  `Temporal`, `Redis`, `Redis Retry`, `PostgreSQL`, `Kafka`,
  `Zero Source Test`, `Gate Test Two`, `Xyzzyplorph Obscure Tech`,
  `Pasted Test` under a `GKM Verify Subject` subject) — harmless local test
  data, easy to identify and delete if unwanted.

## Phase 2 build log (autonomous overnight build, scenarios 10-12)

Built and independently proven via real `npx vitest run`, `npx tsc --noEmit`
per workspace, real `curl` against the locally-running API (port 8030), and
real Playwright-driven browser interaction (chromium, launched directly via
the `playwright` package already present in root `node_modules` — never
`mcp__chrome-devtools__*`) against `vite dev` (web on :3002, since :3000/3001
were held by other unrelated worktrees/repos on this machine — verified via
`lsof` before touching anything, and only killed a stale API process that was
confirmed to be this same worktree's own leftover from Phase 1's session,
never another repo's process).

**Migration:** generated incrementally on top of Phase 1's `0013_wooden_lake.sql`,
per that migration's own note to whoever builds next — `0014_burly_night_nurse.sql`,
a single additive column: `ALTER TABLE "curricula" ADD COLUMN "pre_assessment_completed_at" timestamp with time zone;`.
Applied cleanly against the shared dev database (confirmed this is a Neon
cloud Postgres branch, not the local docker-compose one — verified directly
via the DB's own contents matching Phase 1's build-log-recorded test data
before touching anything; `apps/api/.env`'s `DATABASE_URL` was left
untouched, exactly as instructed).

**A real bug found and fixed, not in spec.md's file list — flagging per the
task's instruction to log every fork resolved, since this one wasn't a fork
so much as a genuine defect the DoD's own browser-check step surfaced:**
`ConfirmBar` (`apps/web/src/curriculum/curriculum-lifecycle.tsx`) called
`confirmCurriculum` then `router.invalidate()`. Verified directly with
Playwright plus network/DB inspection that this sequence updates the
database correctly (`status: confirmed`) but **never moves the browser's URL**
— a same-route `router.invalidate()` does not turn a loader's thrown
`redirect()` into an actual client-side navigation in this TanStack Router
version. Without a fix, a learner clicking "Confirm curriculum" would see the
confirm succeed silently and land on the ordinary curriculum page instead of
the pre-assessment screen — the exact scenario SCENARIO 10 exists to
prevent, and the loader-level redirect on `/curriculum/$curriculumId` alone
would not have caught it since that page never itself reloads on this path.
Fixed by having `ConfirmBar`'s `confirm()` check `needsPreAssessment` on the
mutation's own return value and `navigate()` directly to the assess route
when true, falling back to `router.invalidate()` otherwise (idempotent
re-confirm of an already-graded curriculum). The loader-level redirect on
`/curriculum/$curriculumId` is kept as a second, independent guard for any
direct/bookmarked/reloaded visit to a confirmed-but-ungraded curriculum that
doesn't go through the confirm button at all.

**Deviation from spec.md's literal file name:** spec.md's Files-by-scenario
table names the new route `apps/web/src/routes/curriculum.$curriculumId.assess.tsx`
(no trailing underscore). Built it as `curriculum.$curriculumId_.assess.tsx`
instead, matching the codebase's own established escape convention already
used for the sibling `curriculum.$curriculumId_.stats.tsx` route — required
because `curriculum.$curriculumId.tsx` renders no `<Outlet>`, so a
non-escaped child file name would nest assess under it silently (and given
this feature's own redirect logic, would actually produce an infinite
redirect loop: visiting assess would re-run the parent's loader, see
confirmed+ungraded, and redirect to assess again). The resolved URL is
unaffected — still `/curriculum/:id/assess` — only the on-disk file name and
route id carry the underscore, exactly as the existing stats route already
demonstrates.

**Scope note:** did not add a redirect guard to `probe/$topicId.tsx` (the
individual topic study page). `spec.md`'s Files-by-scenario table for
SCENARIO 10-12 lists only `curriculum.repo.ts`, `schema.ts`, and the new
assess route/redirect-wiring in `curriculum.$curriculumId.tsx` — topic pages
are only ever reached today via links rendered inside
`curriculum.$curriculumId.tsx`'s module list, which the loader-level redirect
prevents from ever rendering while pre-assessment is outstanding, so "before
any topic page is reachable" holds through the app's actual navigation paths
without touching a file outside the phase's listed scope. Flagging this as a
considered-and-declined defense-in-depth addition, not an oversight, in case
a future direct-link/bookmark path to `/probe/$topicId` is ever added without
going through the curriculum page.

**Manual verification performed (real, not self-declared):** confirmed a
"ready" test curriculum from Phase 1's own leftover data (`Pasted Test`, 3
modules, 3 included topics) via a real Playwright click on "Confirm
curriculum" (with an explicit wait for SSR hydration to finish before
interacting — clicking immediately after the button becomes DOM-visible
races React's hydration and silently no-ops the click, a pure test-script
timing issue unrelated to the app itself, worth noting for whoever authors
real e2e tests here next); observed the browser land on
`/curriculum/<id>/assess` within about a second of the confirm response;
graded exactly one of the three listed topics (4/5) via the shared
`SelfGrade` widget, left the other two blank; clicked "Start studying" while
it remained enabled the whole time; observed the browser return to
`/curriculum/<id>` with the module/topic list and no confirm bar; re-visited
`/curriculum/<id>` directly afterward and confirmed it did NOT bounce back to
`/assess`. Cross-checked every step against the database directly: final
state was `status: confirmed`, `pre_assessment_completed_at` set to a real
timestamp, one topic's `self_grade = 4`, the other two `self_grade = null`
— proving SCENARIO 10, 11, and 12 together in one real run, not three
separate self-declared claims. Screenshot saved during the run (not part of
this repo) showed the destination curriculum page rendering normally with
the grade visibly persisted on the inline per-topic widget too, confirming
both surfaces read/write the same `selfGrade` column as required.

Backend curl proof: `POST /curricula/:id/complete-pre-assessment` against
the already-confirmed test curriculum returned 200 with a real
`preAssessmentCompletedAt` timestamp; a subsequent `GET /curricula/:id`
reflected the same timestamp; a `complete-pre-assessment` call against a
nonexistent id returned a real 404.

**Every pre-existing `confirmed` curriculum in the shared dev database now
has `preAssessmentCompletedAt: null`**, so any learner's next visit to an
already-in-progress course will route through the pre-assessment screen once
before reaching its topics — consistent with the spec's "one-time step"
framing (the column has no way to be non-null for a curriculum that existed
before this migration), but flagging it explicitly since it's a real,
visible behavior change for existing data, not just new curricula.

**Test/typecheck proof:**
- `npx tsc --noEmit` clean in `shared`, `core`, `api`, `web`, `bot` after all
  Phase 2 edits (one pre-existing-shape ripple fixed: `curriculum.repo.ts`'s
  `createCurriculum`'s manually-constructed row literal needed
  `preAssessmentCompletedAt: null` added once `Curriculum`'s shape grew a
  required field; `board.collection.ts`'s Electric-sync read path — a
  parallel row-mapping function for the local-first board, unrelated to the
  REST `curriculum.repo.ts` — needed the same column threaded through since
  it independently mirrors the same `Curriculum` shape for the board's
  live-query read path).
- `npx vitest run` (non-watch) passing across `shared`/`core`/`api`/`web`/`bot`,
  including two new test files: `apps/web/src/curriculum/pre-assessment.test.ts`
  (the extracted `needsPreAssessment` predicate — this phase has no deriver
  per spec.md's own Derivers table, so this is the closest equivalent: a
  small pure function pulled out of the loader specifically so it has
  something real to assert) and an added case in the pre-existing
  `board.collection.test.ts` asserting `preAssessmentCompletedAt` round-trips
  through the Electric read path unchanged.

## Phase 3 build log (autonomous overnight build, scenarios 13-16)

Built and independently proven via real `npx vitest run` (non-watch) per
workspace, `npx tsc --noEmit` per workspace, real `curl` against the
locally-running API (port 8030 — killed and restarted this worktree's own
stale leftover `--watch` server processes from Phase 1/2 first, verified via
`lsof`/`ps` that they belonged to this worktree before touching anything),
and real Playwright (chromium, launched directly via the `playwright`
package already present in root `node_modules` — never
`mcp__chrome-devtools__*`) against a fresh `vite dev` on port 3002 (port 3000
was occupied by an unrelated project's dev server, confirmed via `lsof`
before choosing 3002; `apps/web/.env`'s `API_BASE_URL` already pointed at
8030, untouched).

**Migration:** generated incrementally on top of Phase 2's
`0014_burly_night_nurse.sql` — `0015_loving_doctor_faustus.sql`, adding
`tags`, `tag_assignments` (both with their unique indexes) and
`ALTER TABLE probe_sessions ALTER COLUMN curriculum_id DROP NOT NULL`.
Applied cleanly against the shared dev database (same Neon branch Phase 1/2
used).

**Schema decision, not in spec.md's literal text:** `tags`/`tag_assignments`
reuse `node_feedback`'s polymorphic `nodeType`/`nodeId` pattern exactly as
architecture.md specified — verified `node_feedback`'s actual shape in
`schema.ts` first, per the task's instruction, rather than assuming it.

**Endpoint set extends spec.md's literal 3 by one:** spec.md's Files-by-scenario
table names only `GET /tags`, `POST /tags/:id/assignments`,
`DELETE /tags/:id/assignments/:assignmentId` — but `tag.repo.ts`'s own stated
job in the same spec is "tag CRUD", and there is no way to create a tag from
a bare name (the tag picker's actual UI need) without a create endpoint.
Added `POST /tags` (idempotent resolve-or-create by name, case-insensitive)
as the minimal missing piece — everything else matches spec.md exactly. The
router's single-capture-group `RouteDef` also gained a `params: string[]`
variant to support the two-id `DELETE /tags/:id/assignments/:assignmentId`
route; covered by two new `router.test.ts` cases.

**Real design gap found and fixed, not anticipated in planning:** a tag
attached to a module/topic must be removable from that specific node, but
`DELETE /tags/:id/assignments/:assignmentId` needs the *assignment* id, not
just which tag it is — `Module.tags`/`Topic.tags` as originally sketched in
spec.md (`Tag[]`) has no assignment id to send. Fixed by introducing
`TagChip` (`Tag` + `assignmentId`) as the actual element type of
`Module.tags`/`Topic.tags` in both `packages/shared` and the web app's own
`model.ts` — the tag's own identity plus the specific attachment being
rendered. `curriculum.repo.ts`'s `loadTagsByNode` batch-loads this in two
queries (all assignments for the node-id batch, then the tag rows they
point at) so `getCurriculumDetail` costs no extra query per module/topic.

**A second real gap, same root cause as Phase 2's `preAssessmentCompletedAt`
ripple:** `z.array(tagSchema).default([])` makes zod's *output* type
non-optional (`Tag[]`, not `Tag[] | undefined`) even though the schema
defaults it — every existing test file across `core`/`web` that builds a
literal `Topic`/`Module` object failed to typecheck. Switched to
`.optional()` (`tags?: TagChip[]`) instead of `.default([])`, matching
advisor-flagged guidance given before writing code; read sites use
`?? []`. Zero ripple into unrelated test files as a result.

**Grounding correctness for cross-curriculum sessions (SCENARIO 14), the
main technical risk flagged going in:** `generateProbeBatch`
(`probe-session.generate.ts`) previously called `gatherProbeGrounding` once
per batch keyed on `ctx.curriculumId` — a single value that doesn't exist
for `scope: "tag"` (topics can span curricula). Changed to group
`ctx.topics` by their own `curriculumId`, fetch grounding once per distinct
curriculum (still exactly one call for module/topic scope — no behavior or
latency change there, verified via the existing single-curriculum regression
curl below), and sanitize each generated question's citation URLs against
its own topic's own curriculum's citation list (resolved via the existing
`topicIdByTitle` map) rather than one global list — so a tag session can
never leak one curriculum's URL onto another curriculum's question. Left
`probe-session.service.ts` and the row-shape parts of
`probe-session.generate.ts`/`.repo.ts` otherwise untouched, since Phase 4
(replenish) lands in the same files next and the todo's own "review/clarify"
note asked whoever builds Phase 3 to keep that edit surgical.

**`getScopeContext`'s new `"tag"` branch synthesizes `status: "confirmed"`**
(topics.repo `getTagScopeContext`) — `prepareProbeSession` hard-guards
`ctx.status !== "confirmed"`, and a tag has no single curriculum status of
its own to report. Only topics whose own curriculum is actually `confirmed`
are included; a tag with zero eligible topics returns `not_found`, matching
the existing failure-mode shape for a missing scope id (per
architecture.md's own documented failure mode for this case).

**AI tag suggestion wired into both architect agents' instructions and
structured-output schemas**, using the same `.nullable()` (not
`.optional()`) pattern Phase 1 already established for `strictOrder` to
avoid the identical OpenAI/Azure strict-mode 400. `saveCurriculumPlan`
resolves each proposed tag name against the `tags` table
(`resolveOrCreateTag`, case-insensitive) and assigns it to the module.

**Frontend:** `TagPicker` (new) renders/add/removes chips, reusing the
`NodeCommentControl`-style local-busy-state pattern already established on
`module-section.tsx`/`topic-row.tsx` rather than introducing a new mutation
hook. `ProbeSessionQuiz` generalized to accept `scope`/`scopeId` (defaulting
to `topic`/`topicId` for every existing caller — zero behavior change on the
already-shipped topic quiz) so the same component serves the new
`probe.tag.$tagId.tsx` route. A compact tag list was added to the home page
(`routes/index.tsx`) as the "tag list" entry point spec.md's Implementation
Phases table calls for in prose but doesn't name a file for — kept minimal
(a wrapped list of chips linking to each tag's session) rather than
inventing a new route/file not in spec.md's Files-to-create list.

**Manual verification performed (real, not self-declared):**
- Backend: `npx vitest run` — 208/208 core (5 new `normalizeTagName` tests),
  95/95 api (2 new router tests for the two-param route), 17/17 web, 84/84
  bot, all passing. `npx tsc --noEmit` clean in all five workspaces.
- Real `curl` end-to-end: created a tag ("Performance") via `POST /tags`;
  confirmed a second `PostgreSQL` curriculum (previously `ready`, all topics
  `included: false` from Phase 1's known deviation — included one topic by
  hand, then confirmed) so two genuinely different, independently-confirmed
  curricula existed; assigned the tag to a PostgreSQL **topic** directly and
  to a Redis **module** (exercising both the direct-topic and
  module-inheritance union paths); `POST /probe-sessions` with
  `{scope:"tag", scopeId:"<tagId>"}` returned a real 10-question session
  whose questions' `topicId`s spanned both curricula's topics — verified by
  extracting distinct `topicId`s from the response, not by inspection alone.
  Answered one question from each topic and confirmed via `GET
  /curricula/:id` that each topic's own progress/attempts updated
  independently with zero cross-contamination (SCENARIO 16), while the
  session's own `correct`/`answered`/`total` counters stayed accurate across
  both. Ran a full bare-name research→approve→generate cycle for "Node.js"
  and confirmed the doc-research architect proposed real per-module tags,
  including reusing the existing "Performance" tag (exact case-insensitive
  match, not a duplicate "performance" row) — proving SCENARIO 13 and 15
  together with real LLM output, not a mocked one. Confirmed the ordinary
  single-curriculum `scope: "topic"` path is unaffected by the grounding
  refactor (real session generated, `curriculumId` populated, correct
  grounded content).
- Real Playwright: home page renders a "#Performance" tag chip linking to
  `/probe/tag/<id>`; clicking through to that route and generating a quiz
  (clicked "Generate Probing Questions", waited for the real ~40s two-curriculum
  grounding+generation call to finish — the app's own actual latency, not a
  script bug I initially mistook it for) rendered real questions whose
  prompt text visibly named both "Redis" and "PostgreSQL" concepts,
  including a genuinely integrative question referencing both by name;
  completed the session (screenshot: "Quiz complete — 4/10 correct").
  Separately verified the `TagPicker` UI on the PostgreSQL curriculum page:
  the chip added via AI suggestion was removable (click × → gone after
  reload) and a tag re-typed by hand as lowercase "performance" correctly
  reattached the same existing tag row rather than creating a duplicate.
- Did not exercise the Electric-sync board/home page's live-query path for
  tags specifically (same prod-wired-Electric-container reason Phase 1
  logged) — the board's existing subject/curriculum list rendering is
  unaffected by this phase; the new tag-list widget on that page uses a
  plain `react-query` fetch, not the Electric collection, so it isn't
  exposed to that gap.
- Left the shared dev database with additional test data: a `tags` row
  ("Performance", reused across both manual and AI-suggested paths, plus
  AI-created "debugging" and "security" tags), `tag_assignments` rows on the
  `Pasted Test` (Redis) and `PostgreSQL` curricula, a newly confirmed
  `PostgreSQL` curriculum (previously `ready`), and a new curriculum ("GKM
  Phase3 Tag Suggestion Test", Node.js) generated end-to-end. All clearly
  named test data under the same `GKM Verify Subject` Phase 1 already used;
  easy to identify and delete if unwanted.

## Post-deploy checks

- Tag two topics under two different existing curricula with the same tag by hand, then start a tag-scoped study session and confirm both curricula's topics actually appear in one session. **Done during Phase 3's own build — see Phase 3 build log above for the real proof; nothing further to verify here.**
- Run a real quiz session down past the 10-remaining threshold and watch (via logs or network tab) that a replenish call actually fires exactly once, not zero or multiple times. **Done during Phase 4's own build — see Phase 4 build log below for the real proof, including a deliberate concurrent-answer race; nothing further to verify here.**

## Phase 4 build log (autonomous overnight build, scenarios 17-20)

Built and independently proven via real `npx vitest run` (non-watch) per
workspace, `npx tsc --noEmit` per workspace, a real scripted `curl` answer
loop against a locally-running API (port 8230 — 8030 was held by another
worktree/session, confirmed via `lsof` before picking a different port), and
a real Playwright browser run (chromium, launched directly via the
`playwright` package already present in root `node_modules` — never
`mcp__chrome-devtools__*`) against a `vite dev` on port 3003 pointed at that
same API via an `API_BASE_URL` shell env var override (never edited
`apps/web/.env`, which stays pointed at the shared :8030 dev API other
sessions may be using — `vite.config.ts`'s own `if (fileEnv[key] &&
!process.env[key])` guard means an already-set shell env var wins over the
file, so this is a safe, non-destructive override).

**Migration:** generated incrementally on top of Phase 3's
`0015_loving_doctor_faustus.sql` — `0016_dusty_cassandra_nova.sql`, a single
additive column: `ALTER TABLE "probe_sessions" ADD COLUMN "replenishing"
boolean DEFAULT false NOT NULL`. Applied cleanly against the shared dev
database (same Neon branch Phase 1/2/3 used).

**`rankGapsForReplenish` implementation note:** spec.md's deriver table
describes it as reusing "`openGaps`'s existing wanted-first/shallower-depth-
first ordering" — that ordering actually lives inline inside `nextGapToProbe`
(`packages/core/src/curriculum/gap.ts`), not inside `openGaps` itself (which
only filters, doesn't sort). `nextGapToProbe` only ever needed its single top
pick before this call site existed. Rather than refactor `gap.ts` (not in
Phase 4's file list, and `nextGapToProbe` has other callers outside this
plan's scope), `rankGapsForReplenish` reimplements the same two-key sort
(wanted-first, then `DEPTH_RANK` ascending) as a small, independently-tested
pure function in the new `replenish.ts`, and the caller in
`probe-session.generate.ts` feeds it `openGaps(gaps, topic.depth)`'s output —
so the actual behavior matches spec.md's description exactly, only the code
location of the sort logic itself is duplicated rather than shared.

**A real, necessary bug found and fixed, not anticipated in planning — without
it the replenish feature would be invisible to both the web quiz and the
bot:** `getActiveSessionRow` (`probe-session.repo.ts`) filtered strictly on
`status = "active"`. A session's `status` is derived purely from its
currently-persisted question rows (`deriveSessionProgress`), so the instant a
learner answers the last of an initially-loaded batch, `status` flips to
`"completed"` — even though, in the same request, a replenish may have just
been triggered and is still generating in the background. With the original
filter, `GET /probe-sessions/active` would return `null` during that window,
which means: the web quiz's refetch-on-low would get nothing back and fall
through to the "no quiz generated" empty state (looking like the whole quiz
vanished, not "quiz complete"), and the bot's equivalent re-check would find
no session to resume from either. Verified this exact failure directly with a
scripted `curl` answer loop before the fix (`GET /probe-sessions/active`
returned `null` right after the last answer, even though the DB row still
existed with `replenishing: true`). Fixed by widening the query's WHERE
clause to `status = "active" OR replenishing = true` — a session with a
replenish genuinely in flight now stays visible for lookup purposes
regardless of what its raw question-row-derived status currently says, and
correctly drops out of "active" again once `replenishing` clears (whether
that's because the top-up succeeded and counters were re-synced back to
"active", or because it failed and there's genuinely nothing more coming).

**Deviation from spec.md's literal total-size framing:** a replenish batch's
size is a new fixed constant (`REPLENISH_BATCH_SIZE`, apps/api's
`probe-session.generate.ts`), set equal to the existing `MIN_TOTAL` (10), not
computed via the initial batch's own gap-count-scaled `targetTotal` formula.
spec.md doesn't specify a replenish batch size; this was picked as the
sound default — a top-up should be a small, fast, predictable addition, and
its gap list is already narrowed to this session's own currently-open gaps
(via `rankGapsForReplenish`), so it doesn't need to be as large as a first
batch to still be useful. One direct, size-related consequence, not a
deviation from any scenario as written but worth flagging: because topic-
scope quizzes' own initial-batch floor (`scaleTopicQuizTotal`'s `MIN_TOTAL`)
is the same number as the replenish floor, a topic quiz that starts at
exactly 10 questions (small topics, few gaps) crosses the replenish
threshold after just the *first* answer, not only once a "large" session
(SCENARIO 17's own framing) runs low. This was verified as real, observed
behavior during testing (see below), not a hypothetical — logged as a
to-review item above rather than silently changed, since spec.md's own
`shouldReplenish(total, answered, floor)` deriver signature, taken literally,
produces exactly this.

**Real bug found and fixed in the bot's own completion logic, surfaced while
implementing the "equivalent check" spec.md calls for:** `submitQuizAnswer`
(`apps/bot/src/quiz/quiz-flow.ts`) decided "quiz complete" purely from
`result.status` — the status computed at the instant of that specific answer,
before its own possible replenish trigger could have any effect. If an
*earlier* answer's replenish had already landed by the time a *later* answer
resolves, the freshly-refetched `session` (already being fetched in the same
function, for an unrelated reason) would show more unanswered questions
even though this answer's own `result.status` still said `"completed"` —
using the stale field would end the chat context and show a final "quiz
complete" message while more questions were already sitting in the database,
unreachable without a destructive full regenerate. Fixed by deciding
completion from the freshly-fetched `session`'s own `firstUnanswered(...)`
check instead of `result.status` alone. Additionally, `renderSession` (used
by the bot's "Next →" flow) now does one bounded, single extra
`getActiveProbeSession` re-fetch specifically in its "no more questions"
branch, to catch a replenish that lands in the real wall-clock gap between a
learner clicking "Next →" and the message rendering — no timer or polling
loop, matching architecture.md's explicit "refetch-on-low, not polling"
decision, just applied at the one additional point the bot's own chat-based
UI needed it that the web quiz's `useQuery`/`invalidateQueries` flow didn't.

**Manual verification performed (real, not self-declared):**
- Backend: `npx vitest run` (non-watch) — 216/216 core (8 new tests:
  `shouldReplenish` 4 cases, `rankGapsForReplenish` 4 cases, including a
  business-outcome assertion that it doesn't mutate its input), 95/95 api,
  17/17 web, 84/84 bot, all passing. `npx tsc --noEmit` clean in all five
  workspaces (shared has no test files by design, unchanged from prior
  phases — not something this build touched).
- Real scripted `curl` answer loop against the running API (module-scope
  session, single curriculum): answered a 13-question session down past the
  floor, confirmed the crossing answer's own response still reported the old
  total (expected — the trigger and the response are computed in the same
  request, before the background generation can affect it), then polled
  `GET /probe-sessions/active` with no client-side "generate more" call of
  any kind — total grew from 13 to 23 within about 8 seconds of the crossing
  answer, and the session's `status` (as read back) returned to `"active"`
  on its own once the top-up's own `syncSessionCounters` re-run resolved it.
- Same proof repeated for a **tag-scoped session spanning two different
  curricula** (PostgreSQL + Redis, via the "Performance" tag Phase 3's own
  build left in the database): a 9-question session (already at/under the
  floor from creation, since `planModuleQuizDistribution`'s LLM-produced
  count came in under `MIN_TOTAL` this run) grew to 18 after full answering,
  and the API log showed **two separate `probe_grounding` calls, one per
  curriculum ID**, for the replenish generation — direct confirmation that
  the per-curriculum-grouped grounding Phase 3 built for the *initial* batch
  carried through correctly to the *replenish* batch too, not regressed back
  to a single-curriculum assumption. The resulting session's full topic-id
  set still spanned both curricula's topics after the top-up.
- Concurrency guard (SCENARIO 20): scripted two `POST
  .../answer` calls fired from two threads at effectively the same instant,
  both crossing the floor (remaining 10 and 9 respectively in the same
  breath). Polled for 90+ seconds afterward: the session's total grew
  exactly once (13 → 23, not 13 → 33), and only one new `probe_grounding`
  log line appeared for that curriculum in the relevant time window —
  `tryClaimReplenish`'s atomic `UPDATE ... WHERE replenishing = false
  RETURNING id` correctly let only one of the two racing answers actually
  start generation.
- Real Playwright (chromium) against the actual web quiz UI, single
  continuous browser session (no reloads): answered 40 questions in a row on
  a real topic-scope quiz, observing the on-screen "Question N/Total" counter
  grow **four separate times** (18 → 26 → 35 → 43 → 52) purely from clicking
  through options and "Next question" — each growth landing shortly after
  remaining crossed the 10-question floor, exactly the SCENARIO 17/18
  behavior, with zero page reloads and zero manual "generate more" clicks.
  Also exercised both single-select and multi-select question types in the
  same run (this topic's batch included "select all that apply" questions),
  confirming replenish-triggered generation correctly inferred
  `allowMultiSelect` from the session's own already-loaded question types.
- Regression smoke-check of Phases 1-3 after all Phase 4 changes: bare-name
  curriculum creation still lands on `awaiting_source_approval` with real
  pending sources (never straight to `ready`); `approve-sources` on a
  genuinely zero-approvable-candidate curriculum (verified via its
  `sources` rows directly, not just an empty request body — the endpoint
  approves *all currently-pending* rows when any exist, which is correct,
  intended behavior, not a regression) still returns a real 400
  (`no_approved_sources`); the same curriculum's normal approve-all path
  still carries a real bare-name curriculum through to `ready` with modules
  generated. Tag-scoped sessions spanning two curricula were re-confirmed
  live as a side effect of the replenish proof above.
- Left the shared dev database with additional test data: two new probe
  sessions with `total` grown past their original batch size (one
  module-scope, one tag-scope) on top of Phase 1/3's existing test
  curricula/tag, plus one new bare-name curriculum ("Rust Ownership Smoke",
  `ready`, 5 modules) created purely to exercise the approve-all path during
  the regression smoke-check. All clearly identifiable alongside the

## Phase 5 build log (2026-07-19, includes two live mid-build scope additions)

Built directly against `.planning/grounded-knowledge-map/spec.md`'s Phase 5
section as it existed at the start, then two more requirements arrived live
mid-build via the coordinating agent and were folded in before calling this
done: (1) a study-time budget (roughly 4-8 weeks) the draft-structure agent
must respect, surfaced to the user; (2) replacing the chat's "regenerate
everything from scratch" mechanism with a genuine tool-calling agent
(`addModule`/`removeModule`/`renameModule`/`mergeModules`/
`promoteTopicToModule`/`splitModuleIntoNewCourse`/`suggestSplitIntoCourses`),
per `~/webdata/ilya-projects/ai-dev/docs/principles/001-building-agents.md`
and `002-ai-agent-mistakes.md`. Both additions are reflected below alongside
the original spec's work — this is the actual, final shape of what shipped,
not a chronological diary.

### What was built

**Backend — new files:**
- `apps/api/src/curriculum/curriculum-structure.ts` — `generateDraftStructure`
  (first draft, always preceded by a trusted-source search, lands on
  `shaping_structure`), `submitStructureTurn` (one chat turn — records the
  user message, hands off to the tool-calling structure-editor agent,
  records the assistant turn with whatever the tools left the draft as),
  `confirmStructure` (writes real `modules`/`topics` via the existing
  `saveCurriculumPlan`, flips to `ready`).
- `apps/api/src/curriculum/source-text.ts` — `assembleAllSourceText`,
  extracted out of `curriculum-parse.orchestrator.ts` so
  `curriculum-structure.ts` doesn't need to import that file (would have
  been a circular module dependency: orchestrator → structure → orchestrator,
  since `generateCurriculumFromApprovedSources` now calls
  `generateDraftStructure`).
- `apps/api/src/mastra/structure-editor.agent.ts` — the first tool-using
  agent in this codebase (every other architect agent here only uses
  `structuredOutput`). Its `tools` config is a *dynamic* function resolved
  from `requestContext` per call, not a static object — see the "real bug"
  section below for why.
- `apps/api/src/mastra/structure-editor-tools.ts` — the 7 spec'd tools plus
  an 8th, `regenerateStructure` (see Deviations), each backed by a pure,
  independently-tested transform in `packages/core`. Every tool call is
  serialized through a per-turn promise queue (see "real bug" below).
- `packages/core/src/curriculum/structure-editor.ts` +
  `structure-editor.test.ts` — `applyAddModule`, `applyRemoveModule`,
  `applyRenameModule`, `applyMergeModules`, `applyPromoteTopicToModule`,
  `applySplitModuleOut` — pure snapshot transforms, 14 tests.
- `packages/core/src/curriculum/structure-time-budget.ts` +
  `.test.ts` — `estimateStructureStudyTime` (topics × ~1.5h + topic-less
  modules × ~2h, ÷ ~4h/week), `buildScopeGrowthNote` (unused in the final
  shape — superseded by `suggestSplitIntoCourses`, kept as a tested,
  reusable heuristic; see Deviations). 7 tests.

**Backend — modified:**
- `apps/api/src/db/schema.ts` — new `curriculum_structure_turns` table
  (`role`, `message`, `structureSnapshot` jsonb, `splitSuggestion` jsonb,
  `toolActions` jsonb, `order`, `createdAt`); `curricula.status` gains
  `"shaping_structure"` (plain text column, no enum migration needed).
  Two migrations: `0017_real_master_chief.sql` (the table) and
  `0018_heavy_ironclad.sql` (`splitSuggestion`/`toolActions`, added once the
  tool-calling requirement arrived) — both generated via `db:generate:api`
  (never hand-written) and applied via `db:migrate:api` against the shared
  Neon dev database Phase 1-4 already used.
- `apps/api/src/curriculum/curriculum-parse.orchestrator.ts` —
  `generateCurriculumFromApprovedSources` no longer synthesizes directly;
  it approves pending sources then calls `generateDraftStructure`.
- `apps/api/src/curriculum/curriculum-rules.ts` — added
  `isPastedMaterialAndResearchConflict`, `isPastedMaterialAndSourcesConflict`
  (same style as the existing `isDocUrlAndResearchTopicConflict`), 7 new
  tests in `curriculum-rules.test.ts`.
- `apps/api/src/curriculum/curriculum.controller.ts` — `pastedMaterial`
  handling in `handleCreateCurriculum` (including fixing the source-mandate
  guard so a `requireSources` subject doesn't wrongly 400 a pasted-material
  creation — `!researchTriggered && !materialPasted && isSourceMandateUnmet`);
  new `handleGetStructureTurns`/`handleSubmitStructureTurn`/
  `handleConfirmStructure`; `shaping_structure` guards added to
  `handleAddSources`/`handleReparse` (409s instead of silently bypassing the
  chat).
- `apps/api/src/curriculum/curriculum.repo.ts` — `insertApprovedTextSource`,
  `insertStructureTurn`, `getStructureTurns`, `getLatestStructureSnapshot`,
  `createSplitOutCurriculum`.
- `apps/api/src/curriculum/curriculum-prompt.ts` — `buildStructureDraftPrompt`,
  `buildStructureToolTurnPrompt`, `buildStructureGuidedRegenPrompt`
  (replacing an earlier, since-removed `buildStructureRegenPrompt` once the
  tool-calling requirement made a direct structured-output regen the wrong
  shape for the main turn). 18 tests total in `curriculum-prompt.test.ts`.
- `apps/api/src/curriculum/tech-research-grounding.ts` — trusted-source
  search prompt gained the user's named seed examples (OpenAI, Anthropic,
  Google/Gemini, Vercel) as "illustrative, non-exhaustive."
- `apps/api/src/mastra/doc-research-architect.agent.ts` — additive
  instructions: the AI/LLM-developer persona line, the explicit two-step
  topics-then-subtopics reasoning, and the 4-8-week study-time-budget
  framing (replacing reliance on the old generic "2-7 modules" cap for this
  specific path).
- `apps/api/src/mastra/mastra.ts` — registered `structureEditor` agent.
- `apps/api/src/router.ts` / `server.ts` — three new routes:
  `GET/POST /curricula/:id/structure-turns`,
  `POST /curricula/:id/confirm-structure`.
- `packages/shared/src/curriculum.ts` — `curriculumStatusSchema` +
  `"shaping_structure"`; `createCurriculumInput.pastedMaterial`;
  `structureSnapshotSchema`/`structureSnapshotModuleSchema`/
  `structureSnapshotTopicSchema` (the ONE definition — `docResearchPlanSchema`
  in `curriculum-research-plan.ts` re-exports it directly, zero transform
  between agent output, DB storage, and wire format, per advisor guidance);
  `splitSuggestionSchema`; `structureTurnSchema` (+ `splitSuggestion`,
  `toolActions`); `submitStructureTurnInput`.

**Frontend:**
- `apps/web/src/curriculum/curriculum-structure-chat.tsx` (new) — draft tree
  with per-module/topic "research this more" checkboxes, turn history with
  compact "→ did X" tool-action lines, the study-time readout, a
  confirm/decline panel for `suggestSplitIntoCourses` proposals (canned
  messages routed through the same chat endpoint — no new endpoint), the
  message input, and "Build this course."
- `apps/web/src/curriculum/study-technology-form.tsx` — third mode toggle
  ("Search for it" / "I already have material") with a paste textarea,
  mutually exclusive with docUrl/researchTopic.
- `apps/web/src/routes/curriculum.$curriculumId.tsx` — renders
  `CurriculumStructureChat` for `status === "shaping_structure"`, same slot
  pattern as `SourceApprovalPanel`; loader ensures `structureTurnsQuery` when
  status warrants it.
- `apps/web/src/curriculum/api-client.ts` / `curriculum.api.ts` /
  `curriculum.queries.ts` — client + server-fn wiring for the three new
  endpoints; **fixed `STATUS_FROM_BE` map** (see below).
- `apps/web/src/subject/subject-section.tsx` — added the missing
  `shaping_structure` entry to `STATUS_BADGE` (a `Record<CurriculumStatus,
  ...>` — TypeScript caught this one at compile time, not discovered live).

### Deviations from spec.md, disclosed

1. **An 8th tool, `regenerateStructure`, beyond spec.md's enumerated 7.**
   The coordinator's own mid-build message explicitly authorized this
   ("the 'generate a new structureSnapshot' capability is still needed as
   the tool-calling agent's own internal building block") — without it,
   free-text content-quality steering that isn't a structural reshape
   (e.g. "make module 2 lean more into production concerns") would have no
   tool to reach for.
2. **Trusted-source grounding for every draft/turn is URL-only (no body
   fetch), reusing `gatherTrustedSourceCandidates` exactly as spec'd** — the
   agent gets a list of titles + URLs, not fetched page text. This mirrors
   the Phase 1 decision (#4 in spec.md's "Decisions made autonomously") to
   defer full-text fetches for unapproved candidates; fetching full bodies
   for a search that reruns on *every* chat turn would be materially more
   expensive for a check that's structurally the same shape as Phase 1's
   already-accepted trade-off.
3. **Supplemental research for flagged `researchGapLabels` uses only
   `gatherTrustedSourceCandidates`, not the full `gatherSourceCandidates`
   docs-chain-plus-crawl.** A flagged item is an arbitrary module/topic
   label, not a technology name with a plausible docs site to crawl — the
   llms.txt-probe-plus-same-site-crawl chain has no natural target here, and
   running it per flagged label per turn would be materially more expensive
   for no benefit.
4. **`buildScopeGrowthNote`/the researchGapLabels-triggered prose nudge from
   the *first* mid-build addition is built, tested, but not wired into the
   final `submitStructureTurn`** — it was superseded by the *second*
   mid-build addition (`suggestSplitIntoCourses`), which the coordinator
   explicitly said should replace "just noting it in prose." Left the
   function in `structure-time-budget.ts` (still used for the study-time
   readout the frontend renders) with its own tests rather than deleting
   working, tested code that's one plausible future call site away from
   being useful again.

### Real bugs found and fixed during implementation (not anticipated in planning)

1. **`clientTools` is not a server-side tool-execution mechanism — verified
   directly in `@mastra/core`'s compiled source.** First implementation
   passed the per-turn tool set via `agent.generate(prompt, { clientTools:
   tools })`. The model correctly requested tool calls (visible in
   `onStepFinish` logs), but they never executed — `listClientTools` in
   `@mastra/core`'s bundled JS destructures `execute` OUT of each tool
   before conversion (`const { execute: execute2, ...toolRest } = tool2`),
   because `clientTools` is explicitly for tools the *caller* executes and
   feeds results back for (e.g. browser-side tools via `@mastra/client-js`),
   not tools Mastra's own agentic loop runs. Fixed by making the agent's
   `tools` config a *dynamic* function (`({ requestContext }) =>
   createStructureEditorTools(...)`) resolved from a `RequestContext`
   instance passed per-call — the mechanism Mastra actually executes
   server-side. Would have shipped as a completely silent no-op (the chat
   would "work" — turns render, messages send — while every requested edit
   quietly did nothing) if not caught by an actual curl-driven
   `promoteTopicToModule` test that showed the snapshot never changing.
2. **A real read-modify-write race when the model requests multiple tool
   calls in one step.** Verified directly: asking for a two-course split in
   one message produced `toolActions` claiming both splits happened, but
   the resulting snapshot had only removed one module — the second
   `splitModuleIntoNewCourse` call read `state.snapshot` before the first
   call's `await`s (new-curriculum creation, turn insert) resolved, then
   overwrote the first call's mutation when it finally wrote back. Fixed by
   serializing every tool's execution through a per-turn promise queue
   (`createStructureEditorTools`'s `enqueue`) — tool calls now always run
   one at a time, in request order, regardless of how the provider/SDK
   schedules them. Re-verified after the fix: an identical two-course-split
   request correctly produced two new curricula and left zero source
   modules behind for both groups.
3. **`STATUS_FROM_BE` in `apps/web/src/curriculum/api-client.ts` was missing
   `shaping_structure`** (caught by the advisor before implementation, not
   discovered live) — would have silently coerced the new status to
   `curating`, showing `CuratingBanner` forever with the chat UI never
   reachable.

### DoD verification — exact commands and results

**`npx vitest run` clean across every workspace** (`npm run test` from repo
root, non-watch):
```
core: Test Files  27 passed (27) | Tests  237 passed (237)
api:  Test Files  6 passed (6)   | Tests  109 passed (109)
web:  Test Files  3 passed (3)   | Tests  17 passed (17)
bot:  Test Files  12 passed (12) | Tests  84 passed (84)
```
(`packages/shared` has no `test` script — pre-existing, unrelated to this
phase; `npm run test --workspaces --if-present` skips it correctly.)

**`npx tsc --noEmit` clean across every workspace** — `npm run typecheck`
from repo root: all five workspaces (`shared`, `core`, `api`, `web`, `bot`)
reported zero errors.

**Migrations applied cleanly, zero manual SQL:**
```
npm run db:generate:api  →  0017_real_master_chief.sql (curriculum_structure_turns, isolated)
npm run db:generate:api  →  0018_heavy_ironclad.sql (split_suggestion, tool_actions columns, isolated)
cd apps/api && npm run db:migrate  →  "api migrations applied" (both times)
```

**Live `curl` sequence against a locally-running API (`npm run dev:api`,
port 8030 — cleared a stale watch-mode process from an earlier run first via
`lsof -ti :8030 | xargs kill -9` before restarting cleanly), against the
existing shared Neon dev database, using a dedicated `Phase5Test` subject:**

- Create via `pastedMaterial` (`{"name":"Rate Limiting Patterns",
  "pastedMaterial":"Rate limiting protects services..."}`) → polled `GET
  /curricula/:id` from `curating` to `shaping_structure` in ~15s → `GET
  /curricula/:id/structure-turns` showed exactly 1 turn, `role: assistant`,
  `structureSnapshot` with 6 real modules (including, unprompted, a module
  titled "Best Practices and Observability" containing a topic
  "Implementing Rate Limiting in AI Applications" — direct evidence the
  AI/LLM-developer persona instruction took effect).
- Bare-name path: `POST /curricula` with `researchTopic:"Temporal.io
  workflow orchestration platform"` (no docUrl) → `awaiting_source_approval`
  with real candidates (`llms_txt` from `docs.temporal.io`, several
  `arxiv`/`researchgate` links from the trusted-source search) → `POST
  .../approve-sources` with `{}` → polled to `shaping_structure` (NOT
  `ready`) with a real 6-module snapshot correctly about the workflow
  platform (not the "temporal logic" formal-verification sense a
  training-data guess might have produced — confirms grounding, not
  training-data recall, drove the draft).
- `POST .../structure-turns` with `{"message":"The Raft Algorithm topic...
  deserves to be its own module — please promote it."}` on a separate
  Distributed-Consensus curriculum → response showed the user turn + a new
  assistant turn, `toolActions: ["promoted topic \"Raft Algorithm\" to its
  own module"]`, and the snapshot with "Raft Algorithm" now a standalone
  module positioned right after its former parent.
- `suggestSplitIntoCourses` → `splitSuggestion` populated with two real
  groups and a reason; a follow-up `{"message":"Yes, please split..."}`
  turn produced `toolActions` naming two `splitModuleIntoNewCourse` calls;
  `GET /curricula?subjectId=...` confirmed two brand-new curricula rows
  existed, each `status: "shaping_structure"`, each with exactly one seeded
  assistant turn carrying the extracted module as its snapshot.
- `POST .../confirm-structure` on one of the split-out curricula → `status:
  "ready"`; `GET /curricula/:id` showed one real module row
  ("Introduction to Kubernetes Networking") — proving `confirm-structure`
  writes real `modules`/`topics` independent of which entry point produced
  the snapshot.
- Regression: `POST .../approve-sources` with `{}` on a curriculum with zero
  approved/pending candidates → `400 no_approved_sources` (not 2xx).
  `{"override":true}` on the same curriculum → polled through to
  `shaping_structure` (not straight to `ready`) with a real snapshot, i.e.
  the override-with-zero-sources fallback still exists and still routes
  through the chat.
- Regression: `POST .../structure-turns` and `POST .../confirm-structure`
  on a curriculum NOT in `shaping_structure` → both `409
  not_shaping_structure`.
- Regression: pre-assessment redirect trigger — confirmed a
  pastedMaterial → shaping_structure → confirm-structure ("ready") →
  `POST /curricula/:id/confirm` chain lands on `status: "confirmed"` with
  `preAssessmentCompletedAt: null`, the exact condition
  `needsPreAssessment` (Phase 2, untouched) checks — same trigger, now
  reached via the new path instead of the old direct-to-ready one.

**Frontend — real Playwright (chromium, launched directly via the
`playwright-core` package already in root `node_modules`; never
`mcp__chrome-devtools__*`)**, against `vite dev --port 3040` (the default
3000 was held by an unrelated project's dev server, confirmed via `lsof`
before picking a different port) pointed at the API on 8030 via
`apps/web/.env`'s existing `API_BASE_URL`:
- `structure-chat-panel`, `structure-draft-tree` (4-6 modules rendered per
  test curriculum), and `structure-study-time-estimate` ("Roughly 3 weeks
  of study — 6 topics across 4 modules") all rendered correctly navigating
  directly to a `shaping_structure` curriculum's URL.
- Sent a real chat message via the rendered input + send button; a new
  assistant turn rendered with the correct tool-action line ("→ renamed
  ... to ..."), turn count went from 1 to 3 (user + assistant).
- Clicked "Build this course"; confirmed via both the DB (`status: "ready"`,
  correct renamed module) and a follow-up page load showing the normal,
  fully-editable topic-list view (`Confirm curriculum` button, module
  sections with tags/comments/add-topic controls, the renamed module
  present) — the same view every other entry point already reaches.
- **Found and fixed a test-harness-only issue, not a product bug:**
  interacting with the form immediately after `structure-chat-panel`
  becomes DOM-visible raced React hydration — a `.click()` fired zero
  network requests, and pressing Enter triggered the browser's *native* GET
  form submission (verified via request logging: a bare `GET
  /curriculum/:id?` with no params) instead of the React `onSubmit`
  handler. A 3-second settle wait after the panel appears made every
  subsequent run succeed reliably and reproducibly.
- **Could not exercise the "paste textarea creates a curriculum" click path
  starting from the home page**, because the home page's subject list is
  empty in this dev environment due to a pre-existing, unrelated bug in
  Phase 4's Electric-sync board (`apps/web/src/curriculum/board.collection.ts`
  passes a relative `SHAPE_URL` — `/api/electric-shape` — directly to
  `ShapeStream`, which requires an absolute URL and throws `Failed to
  construct 'URL': Invalid URL` client-side; confirmed via browser console
  capture; the Electric proxy itself works fine, verified directly with
  `curl http://localhost:3040/api/electric-shape?table=subjects&offset=-1`
  returning real data). Did not touch this file — it's Phase 4's, already
  shipped and independently verified, out of Phase 5's scope, and the fix
  isn't a one-liner (the SSR/hydration error is a separate, deeper
  `useSyncExternalStore`/`getServerSnapshot` issue in the same code path).
  Substituted: the `pastedMaterial` → `shaping_structure` mechanism is
  proven end-to-end via the curl sequence above; the paste-textarea UI
  itself (mode toggle, textarea, mutual exclusivity with docUrl) was
  verified by direct code/typecheck review, not a click-through. Flagging
  this as a real, pre-existing gap the user should know about — it likely
  blocks *any* feature's home-page verification, not just this one.

### Regression coverage confirmed unaffected
Tag CRUD/assignment and probe-session replenish files (`apps/api/src/tag/`,
`apps/api/src/probe-session/*`, `packages/core/src/{tag,probe-session}/*`)
were not touched in this phase — confirmed via `git diff --stat` showing
only the pre-existing Phase 1-4 modifications already present at the start
of this session, zero additional changes from Phase 5 work.
  existing `GKM Verify Subject` test data; harmless to delete if unwanted.

---
type: decisions
branch: To-Learn-List
task: turn post-anki into a full learning management system
state: open
updated: 2026-08-08
---

# Decisions log

Autonomous defaults chosen during the unattended run, one line each.

## Batch: 0.2, 0.4, 0.5, 0.7, 0.8 (schema + seed)

- 0.2: added `topics.releaseState` (nullable text, values `"queued" | "declined"`); NULL means
  "not declined" (still releasable), matching every pre-existing row and `confirmStructure`'s
  `defaultIncluded: false` rows. Schema + `topic-progress.repo.ts`'s
  `rowReleaseState`/`setTopicReleaseState` accessor only — `slice-release.ts` still reads only
  `included`, unchanged, per scope boundary.
- 0.4: `depthElectedAt` added to `topicSchema` (required, nullable) and to `updateTopicInput`
  (writable, `z.string().datetime().nullable().optional()`). Not auto-stamped inside `updateTopic`
  — every existing PATCH caller (e.g. the curriculum depth slider) would otherwise stamp "depth
  elected" on an unrelated depth change. The web app's `learningStatus` proxy
  (`apps/web/src/learning-list/depth-choice.ts`'s `electedDepthForTopic`) is still live; switching
  it to the new field is unmet follow-up, not done here.
- 0.5: added `topics.headroomOfferedAt` (nullable timestamp) + `topic-progress.repo.ts`'s
  `rowHeadroomOfferedAt`/`setTopicHeadroomOfferedAt` accessor. Deliberately NOT added to
  `topicSchema`/`updateTopicInput` — task scope was storage only, and doubling the read-model
  blast radius (see 0.4's ripple below) bought nothing here.
- 0.7: `domain_node_links` table added (`fromNodeId`, `toNodeId`, `kind`, directional, no FK).
  Seeded one row: AWS `also_in` Cloud Computing, via `seed-domain-taxonomy.ts`'s
  `seedAwsCloudComputingLink`. Looked up by walking Web Development (root) -> AWS rather than a
  bare name match, since the test-only `PLACEHOLDER_HIERARCHY` fixture also has a node named
  "AWS". Link insert is NOT folded into `SeedDomainTaxonomyResult`'s created/skipped counters —
  those are pinned by existing tests to `domain_nodes` row counts only.
- 0.8: added an optional `order` field to the taxonomy YAML/parser/seed pipeline
  (`parse-taxonomy-yaml.ts`, `seed-domain-taxonomy.ts`), used only when a node declares it
  (`node.order ?? index`). Set explicit `order` on React (3), Node.js (3) and AWS (4) in
  `web-dev-areas.yaml` — past their real it-taxonomy.yaml siblings' existing 0-based indices. No
  backfill migration: this only fixes newly-inserted rows going forward. If the taxonomy seed has
  already run against a real subject before this change lands, that subject's React/Node.js/AWS
  rows keep the old colliding order — acceptable per `todo.md`'s still-open "run the taxonomy seed
  against the production subject once, after migration" manual step (prod hasn't been seeded yet).
- Migration: generated a single new migration, `0033_cultured_colleen_wing.sql` (domain_node_links
  CREATE TABLE + 2 indexes, `topics.release_state` + `topics.headroom_offered_at` ADD COLUMN).
  Not run or pushed against any real database.
- Ran into 3 apps/api test failures and several apps/web/apps/api typecheck errors from another
  concurrent agent's in-flight work on item 0.1/12 (`existingCurriculumMatch`,
  `findCurriculumMappedToNode`) at the start of this session; both were fixed by that other agent
  during this run and the repo is fully green as of the end of this batch — noted here only
  because they briefly looked like regressions from this batch and were not.

## Batch: 0.1, 0.6 (recommend-destination extend path, approval trust levels)

- 0.1 match granularity: `existingCurriculumMatch` is computed against the resolved Area id
  (`domain_node_links`/`curriculum_domain_node_mappings.domain_node_id = areaId`), not the
  sub-subject — the anti-sprawl case is "same Area already has a course," not "same sub-subject."
- 0.1 match status: `findCurriculumMappedToNode` matches `suggested` and `confirmed` mappings
  alike (only excludes `rejected`). A confirmed-only match would almost never fire once 0.6 landed
  both mapping kinds as `suggested` — a freshly-approved mini-course's own placement starts
  `suggested`, so 0.1 and 0.6 would otherwise cancel each other out.
- 0.1 write path: extend reuses `mergeSourcesIntoCurriculum` and gates on the target curriculum's
  status via a new shared deriver, `resolveSourceMergeAction` (`apps/api/src/curriculum/
  curriculum-rules.ts`) — the same three-way gate `handleAddSources` already enforced
  (`awaiting_source_approval` queues sources for later approval, `shaping_structure` blocks with
  an error, everything else merges straight in). `handleAddSources` was refactored to call the
  same deriver instead of duplicating the status checks, so there is exactly one gate, not two.
- 0.1 status reuse: an approved "extend" lands the learning-list item on the existing
  `course_created` status rather than adding a new enum value — the item did end up linked to a
  course either way, and a new status would ripple into the web status-label map for no behavioral
  gain.
- 0.1 known consequence, not fixed here: extending a `confirmed` curriculum knocks it back through
  `curating` → `ready` and rebuilds any of its modules with no learner progress — inherited from
  `mergeSourcesIntoCurriculum`'s existing merge semantics (touched-module locking), not a new
  extend-specific behavior. Flagging since no test in this batch exercises that exact case.
- 0.1 schema compat: `existingCurriculumMatch` was added to `learningListRecommendationSchema`
  with `.nullable().default(null)`, not a plain nullable field — a plain nullable field would fail
  `safeParse` on every recommendation JSON persisted before this change (missing key, not a
  present `null`), silently turning every pre-existing classified item's stored recommendation
  into `null` and knocking it out of the approval flow.
- 0.6: both the sub-subject placement and the AI-suggested Area mappings now land as `suggested`
  via `insertSuggestedMappings`, at a default depth of `"working"` (matches
  `curricula.defaultDepth`'s own default) for the sub-subject row. `createCurriculum` is no longer
  called with `domainNodeId` from the learning-list approval path, so it writes no directly
  `confirmed` mapping there anymore — the only remaining `domainNodeId`-at-create-time callers are
  the explicit "add course here" and non-taxonomy-subject auto-placement paths, both unrelated to
  this task and left untouched.
- 0.6 known consequence: a freshly-approved mini-course's `domainNodeId` now comes back `null`
  (nothing confirmed yet), so it will not appear on the domain map or count toward a node's
  rollup until the learner confirms a placement. This is the intended behavior change, not a bug
  — `getLearningMapSnapshots` and friends already null-coalesce an absent primary mapping.

## Batch: 0.4b, 0.5 completion (depth election read/write, headroom persistence)

- 0.4b: `electedDepthForTopic` (`apps/web/src/learning-list/depth-choice.ts`) now takes
  `depthElectedAt: string | null` instead of `learningStatus` — a topic reaching `probing` by any
  route other than `TopicDepthGate.elect()` no longer reads as "already elected."
- 0.4b write: `TopicDepthGate.elect()` stamps `depthElectedAt` with `new Date().toISOString()`
  only the first time (`nextDepthElectedAt` keeps the existing value once set), so a headroom
  accept (`going_deeper`) never restamps the original election time.
- 0.5 field exposure: `headroomOfferedAt` added to `topicSchema`/`updateTopicInput`
  (`packages/shared/src/topic.ts`) as `.nullable().optional()`, not required like
  `depthElectedAt` — `apps/api/src/domain-map/domain-map.repo.ts`'s `toTopicForProgress` also
  builds a `Topic` and is out of this task's write scope, so making the field required would have
  broken that construction site's typecheck.
- 0.5 read-path fix (scope exception, logged per advisor guidance): the probe screen's topic data
  comes from `GET /curricula/:id` (`apps/api/src/curriculum/curriculum.repo.ts`'s `toTopic`), not
  a direct topic fetch — there is no `GET /topics/:id`. Added one line there
  (`headroomOfferedAt: row.headroomOfferedAt ? ... : null`) mirroring the line the 0.4a agent
  already added for `depthElectedAt` in the same function, since without it "decline survives a
  reload" cannot work at all — the initial page load has no other path to that column. Kept to
  the same one-field-mapping shape as the existing precedent; no other curriculum.repo.ts logic
  touched.
- 0.5 write path: added a dedicated `declineHeadroomOffer` client/server fn hitting the existing
  `PATCH /topics/:id` with only `{ headroomOfferedAt }`, rather than overloading
  `electTopicDepth` (which always sends `learningStatus` — reusing it for a decline would have
  written an unrelated status change as a side effect).
- 0.5 web-local mirror: `apps/web/src/curriculum/model.ts`'s own `topicSchema` (this file's
  established self-contained-mirror convention) got both fields — `depthElectedAt` required
  (matches the backend's required field, single construction site under this task's control) and
  `headroomOfferedAt` required-nullable (backend optional, but `mapTopic` always coalesces with
  `?? null`).
- Removed the now-dead `learningStatus` prop from `TopicDepthGateProps` — nothing in the component
  reads it once `electedDepthForTopic` switched to `depthElectedAt`.

## Note: transient other-agent breakage observed during this batch (0.4b, 0.5)

- Root `npm run typecheck` flipped between clean and broken multiple times during this session
  purely from concurrent edits to `apps/api/src/learning-list/slice-release.ts` and
  `slice-generation.orchestrator.ts` (both outside this task's scope — `slice-release.ts` is
  explicitly listed as another agent's file). Never touched by this batch. `@post-anki/web`'s own
  `tsc --noEmit` was clean on every run. `packages/core` grew from the 494 baseline to 507 tests
  and `depcruise` from 645 to 650 modules during this session, also from other agents' unrelated
  work, not this batch.

## Batch: 0.3, 0.2 completion, 0.9 (pacing, releaseState predicate, real slice generation)

- 0.3 pacing anchor: `nextIngestionSlice` gained `lastReleasedAt`/`now` on its contract
  (`packages/core/src/learning-list/ingestion-slice.ts`) rather than a second constant — reuses
  `GENERATION_DAY_MS`. The API layer derives `lastReleasedAt` as
  `item.questionsGenerated > 0 ? item.updatedAt.toISOString() : null` — `questionsGenerated === 0`
  is the only reliable "never released yet" signal without a new schema column (schema.ts is
  another agent's file), since `updatedAt` is also touched by approval-time writes
  (`linkCurriculum`) that happen before any release ever could.
- 0.3 residual risk, logged not fixed: if a release ATTEMPT fails (agent throws, empty output,
  truncates to zero topics), `questionsGenerated` stays 0 and the pacing gate stays bypassed for
  that item until a release actually succeeds — a persistently-failing item could retry more than
  once a day. This does not violate the literal guarantee (no slice ever unlocks early), only the
  cost-gate's spirit on a rare failure path. Fixing it cleanly needs a dedicated
  "last release attempt" timestamp, which needs a schema column outside this task's remit.
- 0.3 mechanics: `advanceIngestionCursor` (`learning-list.repo.ts`) now takes an explicit `now`
  and stamps `updatedAt` from it instead of calling `new Date()` — the real-wall-clock version
  drifted out of sync with a caller-supplied logical `now` (tests backdating/advancing time) by
  however long the DB round trip took, which was enough to make a same-day pacing check land on
  the wrong side of the 24h boundary. Matches this codebase's existing explicit-`now` convention
  (`recordLivenessActivity` et al.), not a new pattern.
- 0.2 completion: `nextUnreleasedTopicIds` (`slice-release.ts`) filters
  `topics.releaseState IS DISTINCT FROM 'declined'`, not `!= 'declined'` — plain `!=` against a
  nullable column is `NULL`, not `true`, in SQL, which would have silently dropped every
  legitimately-releasable NULL-state topic instead of just the declined ones. Only the read
  predicate was wired; `updateTopic`/`setTopicReleaseState`'s own callers are untouched, exactly as
  scoped.
- 0.9 architecture: `releaseNextSlice` now has two branches. If pre-drafted `included: false`
  topics already exist for the curriculum (the ordinary, non-learning-list `confirmStructure`
  flow), it still just flips them — that mechanism predates this batch and isn't itself doing any
  generation, so "advance by what was actually generated, never by intent" doesn't apply to it; it
  keeps the original `topicIds.length * QUESTIONS_PER_TOPIC` (capped to remaining) estimate,
  because those topics' own gaps are discovered live during study, not upfront — there is no real
  gap count to read at flip-time. When nothing is pre-drafted (every learning-list mini-course
  today, since `approveMiniCourseRecommendation` never drafts a structure), a new
  `slice-generation.orchestrator.ts` calls a new Mastra agent (`learningListSlice`) against the
  curriculum's `assembleAllSourceText`, truncates the result with a pure core deriver
  (`truncateSliceGeneration`) to the slice's own `topicCount`/`questionCount`, and only THAT branch
  advances the cursor by the actual gap rows it wrote.
- 0.9 transaction shape: the LLM call runs with no open Postgres transaction (advisor guidance —
  holding one across a multi-second model call would starve the connection pool for every other
  release/answer in flight). `decideSlice` is a short, advisory-locked transaction that only reads
  state and, for the flip branch, writes and commits inline; for the generation branch it commits
  read-only and hands back a request. `slice-generation.orchestrator.ts`'s write side is a second,
  separately-locked transaction that re-reads `questionsGenerated` fresh and re-truncates against
  the ceiling's current remaining budget, so a concurrent release on the same item can only ever
  under-write, never overshoot the ceiling.
- 0.9 taxonomy safety: the agent's structured-output schema
  (`slice-generation-plan.ts`) has no `tags` field and no domain/taxonomy field at all — unlike
  `curriculumPlanSchema`, which resolves proposed tags via `resolveOrCreateTag` (a taxonomy-adjacent
  write from model output). The write path never touches `domain_nodes`, `curricula`, or any
  taxonomy table — it only inserts `modules`/`topics`/`gaps` scoped to the already-existing,
  already-approved curriculum. Verified by an integration test asserting the `domain_nodes` row
  count is unchanged across a release.
- 0.9 provenance: a generated topic's `sourceId` is the curriculum's first `sources` row (a
  learning-list mini-course has exactly one source in practice — the captured URL/description).
  Multiple-source curricula would need a real per-topic attribution scheme; not built here since
  every current learning-list path (`sourcesForItem` in the approval orchestrator) produces exactly
  one source.
- 0.9 module framing: each successful generation call creates exactly one new `modules` row
  titled `Slice {order}` to hold that slice's topics — mirrors S4's "one module and ~3 topics" per
  slice, and gives future slices of the same item their own module rather than accumulating into
  one ever-growing module. `maxModuleOrder(curriculumId)` is called plain (no `tx` parameter
  exists on it) inside the write transaction — safe only because the advisory lock serializes every
  release for this item, so a same-item second slice always sees the first slice's committed module
  before computing its own order; it would NOT be safe if some other path inserted modules for this
  same curriculum outside that lock, which nothing currently does for learning-list curricula.
- 0.9 dedup is prompt-enforced only, not write-enforced: `existingTopicTitles` feeds the "never
  repeat these" instruction into the prompt, but `truncateSliceGeneration` does not check for
  overlap with prior titles. A model that repeats a title anyway produces a duplicate topic under a
  new module; the ceiling still holds (nothing generates past it) but nothing here would catch or
  collapse the duplicate.
- 0.9 scope boundary, flagged not fixed: `approveMiniCourseRecommendation` still never calls
  `releaseNextSlice`/`releaseNextSliceSafely` itself. A freshly-approved mini-course therefore has
  zero topics until `recordAnswerActivity` fires for its curriculum — but no answer is possible
  before topics exist, so the very first slice of a brand-new mini-course currently has no trigger
  that ever calls it. This is a pre-existing gap (release was already a no-op flag-flip for these
  curricula before this batch, so no answer was possible before this work either) and is not in
  this task's explicit DoD checklist. Deliberately not wired in: the natural trigger point
  (`approveMiniCourseRecommendation`) is exercised by
  `learning-list-approval.orchestrator.integration.test.ts`, which already shares one
  `getMastra`/`generate` mock queue across that whole file for its own domain-mapping assertions —
  adding a second, unrelated fire-and-forget agent call into the same approval path risks stealing
  a `mockResolvedValueOnce` meant for that file's own test and introducing flakiness in a suite
  this task does not own. Left as a follow-up for whichever agent next touches the approval
  orchestrator or the study/probe entry point that should trigger a fresh item's first slice.
- 0.9 mechanics: added `learningListSlice` to `AGENT_KEYS`/`mastra.ts`'s agent registry (a new
  agent, not the "do not touch" `router.ts`/`schema.ts`). No new npm dependency — reuses the same
  `Agent`/`resolveAgentModel` pattern every other agent in `apps/api/src/mastra/` already uses.
- Test counts this batch: `packages/core` 494 → 507 (13 new: pacing + `truncateSliceGeneration`).
  `apps/api` unit suite unchanged at 331 (all new coverage is DB-backed). Added
  `apps/api/src/learning-list/slice-release.integration.test.ts` (10 tests, isolated
  `getMastra` mock, own throwaway database) and extended
  `apps/api/src/liveness/answer-activity.integration.test.ts` (13 → 15 tests) to assert pacing and
  the corrected concurrent-race outcome (exactly one of several simultaneous releases succeeds, not
  all of them up to the ceiling — the old test encoded the exact bug 0.3 fixes).
- Full-suite `apps/api` integration run is flaky under this environment's local Postgres —
  confirmed pre-existing and unrelated to this batch: re-running the whole 48-file suite twice
  produced two different sets of unrelated failing files (`seed-domain-taxonomy` once,
  `subject-merge-concurrency` another time — neither touched by this batch), both connection/
  timeout errors from the shared local instance under full parallel load, while every file this
  batch actually touched (`answer-activity.integration.test.ts`,
  `slice-release.integration.test.ts`) passed cleanly every time it was run in isolation.

## Batch: schema + migration + taxonomy seed for learning-paths, learning-brain, study-scheduling
  (one migration, `apps/api/src/db/schema.ts`, taxonomy parser/seed only — behaviour agents build
  on top of this next; scope was explicitly narrower than the three modules' full todo.md items)

- One migration generated: `apps/api/src/db/migrations/0034_confused_garia.sql` (via
  `npm run db:generate`). Never run against the dev or prod database and never pushed — it was
  only ever applied inside per-test throwaway Postgres databases that
  `seed-domain-taxonomy.integration.test.ts` creates and drops itself
  (`createMigratedTestDb`/`dropTestDb`), which the task's own rules permit.
- New tables, all additive, no `.references()` FK (matches this schema's dominant convention):
  `domain_node_prerequisites` (schema.ts:1077), `learning_paths` (schema.ts:1104),
  `learning_path_steps` (schema.ts:1123), `notes` (schema.ts:1164), `study_sessions`
  (schema.ts:1197). Nothing existing was dropped, renamed, or had a column removed.
- **Prerequisite edges: an edge table, never a column on `domain_nodes`** — matches
  `domain_node_links`'s own precedent exactly (both are cross-references living beside the tree,
  not inside it). Unique pair index + an index on `domainNodeId` (schema.ts:1085-1091), per the
  spec's explicit index call-out.
- **`learning_path_steps.domainNodeId` is the only foreign reference a step carries** — never a
  curriculum id, per the spec's explicit instruction; content is discovered live through
  `curriculum_domain_node_mappings` at read time, not stored here. No progress/status column —
  always derived, never persisted (spec.md's Decisions, restated in the schema comment so a future
  reader doesn't "helpfully" add one).
- **`learning_path_steps.order` is a plain not-null integer, snapshotted at creation** — the spec
  is explicit that an in-progress path must never silently reshuffle if prerequisite edges change
  later, so this column is written once by the creation orchestrator (next round) and never
  recomputed by anything this batch touched.
- **`notes.searchVector` uses a hand-rolled `customType<{ data: string }>({ dataType: () =>
  "tsvector" })`** (schema.ts, just above the `notes` table) — drizzle-orm 0.36 has no built-in
  `tsvector` column helper, and the spec is explicit about "no new dependency," so this is the
  smallest thing that makes `drizzle-kit generate` emit a real `tsvector` column instead of a
  `text` stand-in. The GIN index is declared via `index(...).using("gin", table.searchVector)`
  (schema.ts:1176) — confirmed by reading the generated SQL, not assumed:
  `CREATE INDEX ... USING gin ("search_vector")`. Population is left to `note.repo.ts` (a later
  round) — the spec is explicit that the vector is written at application time, not via a
  DB-generated column or trigger.
- **Two indexes added beyond what either spec's "Data model changes" section names verbatim**,
  under the task's own hard rule ("uniqueIndex/index on hot reads"), both logged rather than
  silently added: `learning_path_steps_path_id_idx` (schema.ts:1131) — every path-detail page load
  reads a path's own steps; `study_sessions_status_scheduled_for_idx` (schema.ts:1216) — the
  schedule list and the consistency rollup both filter by status and order by `scheduledFor`. Ask
  the behaviour agent that builds the read paths to revisit these if the real query shape differs.
- **Prerequisite-edge revival threads through three files as a genuine two-pass pipeline**, not
  edges computed inline during node insertion:
  1. `parse-taxonomy-yaml.ts` revives `id` -> `SeedNode.yamlId` (set whenever the raw node declares
     one) and `prerequisites` -> `SeedNode.prerequisiteYamlIds` (set only when non-empty, mirroring
     `children`'s own "omit when there's nothing to add" convention rather than `kind`/`order`'s
     "set whenever defined" convention — carrying an empty array through on all 208 of
     it-taxonomy.yaml's nodes, which all declare `prerequisites: []` explicitly, would be pure
     noise). The old "drops id and prerequisites" test/comment is gone — reversed, not just edited.
  2. `seed-domain-taxonomy.ts`'s `seedNode` (pass one) inserts nodes exactly as before, and
     additionally records every node's `yamlId -> nodeId` into a map and every node with non-empty
     `prerequisiteYamlIds` into a pending list — on EVERY run, not only when a node is freshly
     created, because an idempotent second run needs the same complete map for pass two to resolve
     against.
  3. `seedPrerequisiteEdges` (pass two) runs only after every root, across BOTH taxonomy YAML files,
     has been fully inserted — this completeness-before-resolution ordering is what makes a forward
     reference (e.g. `cloud-computing`, declared late in the file, naming `networking`, declared
     early) resolve correctly. Resolution itself is `resolveTaxonomyPrerequisiteEdges` — a pure
     deriver in `packages/core/src/learning-path/resolve-taxonomy-prerequisite-edges.ts`, unit-tested
     against fixtures with zero DB, dropping (never throwing on) a prerequisite id absent from the
     map, per spec. Edge writes are existence-checked SELECT-before-INSERT, same convention as
     `seedNode`/`seedAwsCloudComputingLink`, backed by the unique pair index as the real idempotency
     guarantee.
- **Found and fixed a real data bug while wiring this up, on advisor review**: `it-taxonomy.yaml`
  had two distinct nodes both named "Log Aggregation" sharing the same `id: log-aggregation` (one
  under `devops-infrastructure > Monitoring & Logging`, one under `observability-diagnostics >
  Logging`, the latter referenced by its sibling `log-analysis`'s `prerequisites: [log-aggregation]`).
  Verified independently — `grep -oP '(?<=id: )\S+' | sort -u | wc -l` gave 207 unique ids against
  208 parsed nodes before the fix. Because `yamlIdToNodeId.set()` is last-write-wins and the
  referenced occurrence happened to be seeded after the unrelated one (later root domain in file
  order), the one edge this collision actually produced (`log-analysis -> log-aggregation`) was
  already correct by accident — the 66-edge count and the cloud-computing spot-check in the
  integration test could not have caught this either way, since a mis-targeted edge is still
  exactly one row. Fixed at the source: renamed the unreferenced, unrelated occurrence's id to
  `log-aggregation-devops` (`apps/api/scripts/seed-data/it-taxonomy.yaml`) — no name/description/
  structure change, purely disambiguating a machine id that was previously unused by any code path
  (the parser dropped `id` entirely before this batch). 208 unique ids for 208 nodes afterward.
- **Added a permanent guard against this exact class of bug recurring**: `detectYamlIdConflict`
  (`packages/core/src/learning-path/detect-yaml-id-conflict.ts`, pure, unit-tested) — `seedNode`
  now throws loudly if a `yamlId` resolves to two different `nodeId`s, rather than silently
  overwriting the map. Deliberately does NOT fire on the legitimate case where web-dev-areas.yaml
  re-declares the Web Development/Frontend/Backend scaffold by name (the existing existence-check
  resolves both declarations to the SAME nodeId, so `previousNodeId === nodeId` and the guard is a
  no-op) — confirmed by the full integration suite still passing (created: 244/skipped: 3, then
  247 on rerun, unchanged from before this guard was added).
- Idempotency proof (the task's explicit "prove it with a test" requirement): three new `it` blocks
  in `seed-domain-taxonomy.integration.test.ts`'s existing full-taxonomy describe block — exactly
  66 prerequisite edges seeded from a single run (independently verified against the shipped YAML:
  60 nodes declare a non-empty `prerequisites` list totalling 66 references, none dangling), the
  cloud-computing forward+cross-branch case resolves to the correct two prerequisite nodes, and a
  third `seedDomainTaxonomy` call (this test's database has already been seeded twice by earlier
  tests in the same describe block, so this is genuinely a THIRD run) still shows exactly 66 edges.
- Test counts this batch: `apps/api` 331 -> 334 (net +3: +4 new assertions in
  `parse-taxonomy-yaml.test.ts` for `yamlId`/`prerequisiteYamlIds`, -1 obsolete assertion removed —
  "drops the id and prerequisites fields" no longer holds now that this batch revives them — plus
  the pre-existing `seed-domain-taxonomy.integration.test.ts` file, which is excluded from this
  count since integration tests run under a separate command; that file grew from 9 to 12 tests).
  `packages/core` 507 -> 518 (+11: 8 for `resolveTaxonomyPrerequisiteEdges`, 3 for
  `detectYamlIdConflict`). Root `npm run typecheck` clean across every workspace both before and
  after the log-aggregation fix.
- Not done in this batch, by design (behaviour agents' next round, per the task's explicit
  ownership boundary of "schema.ts, the migration, and the taxonomy seed only"): `resolvePathOrder`,
  `pathProgress`, `nextPathStep` and the rest of `packages/core/src/learning-path/`; every
  `apps/api/src/learning-path/`, `apps/api/src/note/`, `apps/api/src/study-session/` repo/
  controller/service; every `packages/shared/src/{learning-path,note,study-session}.ts` zod schema;
  all router wiring; all web UI. `.planning/lms-buildout/todo.md`'s 1.1-1.4, 2.1-2.4, 3.1-3.4 stay
  unchecked — this batch is a prerequisite for them, not any one of them.

## 0.10 — trigger the first slice release on approval

- Closes the "0.9 scope boundary, flagged not fixed" gap logged above: both
  `approveMiniCourseRecommendation` and `approveExtendRecommendation`
  (`learning-list-approval.orchestrator.ts`) now call the existing, already-tested
  `releaseNextSliceSafely(itemId)` (`slice-release.ts`) right after `linkCurriculum` +
  `startLivenessTracking` land. No new release logic was written — this batch is purely wiring an
  existing, already-safe entry point into a second call site. `releaseNextSliceSafely` already
  swallows and logs every failure (network, model, DB), so a slice-generation failure can never
  fail the approval itself — confirmed by a dedicated test
  (`learning-list-approval-first-slice.integration.test.ts`, "still succeeds when the
  slice-generation agent fails").
- Mini-course: fired via `Promise.all([suggestDomainMappings(curriculum.id),
  releaseNextSliceSafely(itemId)])` — independent of each other (domain mapping only needs
  `curriculum.id`; release only needs the item's own `curriculumId` already committed by the prior
  `linkCurriculum` await), so parallelized rather than sequential per the async-patterns rule.
  Extend: fired as a single `await releaseNextSliceSafely(itemId)` after the
  queue-vs-merge branch, since the extend path's own two source-handling branches already diverge
  in awaited-ness (one `await`s `insertPendingSources`, the other fires `mergeSourcesIntoCurriculum`
  and forgets it) and forcing them into a `Promise.all` with the release call would misrepresent
  that the merge branch is intentionally decoupled from the response.
- Extend-path race, accepted as-is: when `resolveSourceMergeAction` picks `"merge"` (immediate,
  fire-and-forget `mergeSourcesIntoCurriculum`), `releaseNextSliceSafely` fires before that merge
  necessarily lands, so the very first slice release for a newly-extended item may only see the
  target curriculum's pre-existing content, not the freshly-submitted source. This is not a
  regression — before this batch nothing ever triggered a release here at all — and it self-heals:
  the newly-linked item's own liveness/pacing state is unaffected (nothing was released, so nothing
  consumed the day's pacing slot or advanced the cursor), so the same item picks up the merged
  content on its very next answer via the pre-existing `recordAnswerActivity` trigger. Not
  wired to await the merge instead, since that merge is deliberately fire-and-forget throughout the
  rest of this function (existing design, not something this batch owns).
- Mock-queue conflict, solved by injection (per the task's explicit menu of options), not by
  splitting or restructuring the existing file's queue: `learning-list-approval.orchestrator.integration.test.ts`
  now `vi.mock`s `./slice-release.js` directly (`releaseNextSliceSafely: vi.fn().mockResolvedValue(null)`)
  instead of routing the new call through its existing single-response `getMastra` mock. This was
  chosen over a key-routed `getAgent(key)` mock (the pattern already used elsewhere, e.g.
  `gap-mastery-concurrency.integration.test.ts`) because that file's mock didn't even declare a
  `learningListSlice` key in `AGENT_KEYS`, and because letting the real call through would hit
  `assembleAllSourceText` on this file's fake `https://aws.example.com/...` URLs with no
  `fetchedText` cached — a real network fetch attempt inside every domain-mapping test, not just
  slower but a genuine new source of flakiness. Stubbing the module-level function is a cleaner
  seam: it decouples the two concerns entirely rather than teaching one mock to serve both. All 11
  pre-existing tests in that file, including every domain-mapping assertion (SCENARIO 2/3, the
  hallucinated-node-id / suggested-not-confirmed check, the extend-merge scenario), are unmodified
  and still pass.
- Real end-to-end coverage lives in a new file,
  `learning-list-approval-first-slice.integration.test.ts` (own throwaway database, per the
  integration-test convention), which mocks `../mastra/mastra.js` with a key-routed `getAgent`
  (`domainTaxonomyMapping` vs `learningListSlice`, mirroring the existing
  `gap-mastery-concurrency.integration.test.ts` pattern) so both agents can be driven
  independently. Learning-list items in these tests use `kind: "video"` with `rawText` (never a
  URL) — `sourcesForItem` then drafts a `kind: "text"` source, and `resolveSourceText` resolves
  `"text"` sources synchronously with no network call, unlike `"link"` sources against a fake host.
  4 tests: mini-course approval produces real topics/gaps/`questionsGenerated` with zero answers
  recorded; the `domain_nodes` invariant (no row created) still holds through this new trigger
  path; a slice-generation failure doesn't fail the approval; and extending an existing curriculum
  releases real content for the newly-linked item off the target curriculum's already-present
  source text.
- Verified constraints unchanged by this wiring: pacing (`nextIngestionSlice`'s
  `questionsAlreadyGenerated === 0` branch means the very first release is never paced out, per the
  existing `slice-release.ts` comment) and the ceiling (the write-side transaction in
  `slice-generation.orchestrator.ts` re-reads and re-truncates against the ceiling regardless of
  caller) are both exercised unchanged by every pre-existing `slice-release.integration.test.ts`
  test (still 10/10 green) — this batch added a caller, not new release/ceiling logic.
- Test counts this batch: `apps/api` unit suite (fast, DB-free `vitest run`) unchanged at 334 (no
  unit-test file touched; the 331→334 drift versus this file's earlier baseline note predates this
  batch — unrelated work landed 3 tests between then and now). `packages/core` unchanged at 515 for
  the same reason (not touched). New DB-backed coverage: `learning-list-approval-first-slice.integration.test.ts`
  (4 tests, new file). Full `apps/api` integration config (`vitest.integration.config.ts`, 50
  files including the new one) passed 269/269 tests in a single run; one unrelated `ECONNREFUSED`/
  connection-terminated unhandled-error surfaced from `curriculum-move.integration.test.ts` after
  all tests had already reported passing — matches the pre-existing full-parallel-load Postgres
  flakiness already logged above, not reproducible when running the touched files in isolation
  (confirmed: `slice-release.integration.test.ts`, `learning-list-approval.orchestrator.integration.test.ts`,
  and the new file all pass cleanly together in an isolated run).

## Batch: modules 5, 6, 7 (content-library, milestones, study-material-generation — schema only)

- Landed exactly one migration, `apps/api/src/db/migrations/0035_heavy_lucky_pierre.sql`, covering
  all three modules' data-model changes in one Drizzle generation, per the round's "one migration
  per batch" constraint.
- Module 5 (content-library): `sources` gains five nullable columns
  (`schema.ts:251` `lastFetchedAt`, `schema.ts:255` `lastFetchOutcome` — real fetch state,
  replacing the ambiguous `fetchedText IS NULL` read — plus `embedding`/`embeddingHash`/
  `embeddedAt`, a verbatim mirror of `subjects`' own dedup-cache columns for the
  embedding-similarity duplicate tier). New table `sourceDuplicateSuggestions`
  (`schema.ts:1260`), sibling to `subjectDuplicateSuggestions`: `similarity` is nullable (null for
  an exact-URL match, a float for embedding), `matchKind` distinguishes the two tiers instead of
  reusing `subject_duplicate_suggestions.source` (the spec's own enumeration names `matchKind` as
  the discriminator, so that's the field that shipped — a deliberate, logged divergence from the
  table it otherwise mirrors), and the same partial unique index on the pending pair
  (`source_duplicate_suggestions_pending_pair_unique`) guards concurrent scan double-inserts. No
  merge/delete path exists for a source — resolving a suggestion only ever moves `status`, per the
  spec's explicit provenance-preservation rule (`topics.sourceId` must survive).
- Module 6 (milestones): new table `milestones` (`schema.ts:1302`) — polymorphic
  `entityType`/`entityId`/`criteriaKey`, `achievedAt`/`createdAt`, never updated or deleted after
  insert. Unique index `milestones_entity_criteria_unique` on
  `(entityType, entityId, criteriaKey)` is the real DB-level double-award guard the spec calls for
  — confirmed as an actual `uniqueIndex`, not an app-level check-then-insert.
- Module 7 (study-material-generation): new table `studyMaterials` (`schema.ts:1346`) — one
  polymorphic table for both `kind: "worked_example" | "analogy"`, deliberately no unique index on
  `topicId` (re-requesting accumulates history, unlike `lectures`' one-per-topic shape). Added a
  non-unique `index("study_materials_topic_id_created_at_idx")` on `(topicId, createdAt desc)`
  (`schema.ts:1363`) beyond what the spec's prose named — not in the spec's own words, but the
  spec's own S6 behavior (`listStudyMaterials` reads every row for a topic, newest first, and rows
  are never deleted) is the exact growing-scan-and-sort hazard
  `domain_priority_suggestions_subject_created_at_idx` already exists to prevent in this file, and
  the hard rule is "index on hot reads." Purely additive, does not contradict the spec's explicit
  "no unique index" instruction. `citations` is a flat `jsonb {title, url}[]` array, no split
  citations table, since a worked-example/analogy body has no ordered sections the way a lecture
  does. 7.1's grounding-order fix (`lecture.orchestrator.ts`) is explicitly out of this agent's
  scope (behavior, not schema) and left for the module's own implementation round.
- All four additions are additive-only (no column/table dropped or renamed), no `.references()`
  FKs anywhere (matches the file's dominant plain-text-id + app-level-validation convention), and
  every non-obvious column carries an explanatory comment per this file's own precedent.
- `npm run typecheck` clean across all workspaces (shared/core/api/bot/mobile). `apps/api` unit
  suite: 334/334 (matches this file's own last-logged baseline exactly). `packages/core`: 537/537
  — neither the task brief's stated baseline (518) nor this file's own last-logged baseline (515)
  matches what actually ran; no file under `packages/core` was touched by this batch, so the drift
  predates this work and is flagged here rather than silently asserted as "baseline met." Migration
  generated via `npm run db:generate` only — never pushed, never run against a real database.
- **Self-correction, logged for transparency**: an early `db:generate` run picked up modules 1-3's
  already-generated-but-not-yet-committed migrations (`0032_nifty_surge`/`0033_cultured_colleen_wing`/
  `0034_confused_garia`, landed on disk by an earlier agent this same run, uncommitted) correctly.
  A subsequent attempt to fix an unrelated unique-index oversight via `git checkout -- meta/_journal.json`
  wrongly reverted the journal to its last COMMITTED state (which only knew about migrations through
  0031), because those three migrations aren't committed yet either. This caused one throwaway
  regenerate to allocate a colliding `0032` before the mistake was caught and the journal's entries
  for 0032-0034 were hand-restored (tag/timestamp reconstructed from this session's own earlier
  read of the file) ahead of the real 0035 generation. Net effect on migrations 0032-0034
  themselves: none — their `.sql` files were never touched, and `apps/api/src/db/migrations/
  meta/0034_snapshot.json` (the only snapshot `drizzle-kit generate` actually diffs against for the
  next migration) was never touched either, so 0035 generated correctly against the true current
  state. One casualty did NOT recover: `meta/0032_snapshot.json` (module 1-3's own intermediate
  snapshot artifact) was deleted while cleaning up the throwaway regenerate and could not be
  reconstructed — it is not required for any future `db:generate` (which only reads the latest
  snapshot in the journal) or for applying migrations (which reads only the `.sql` files), but it
  is a genuine gap in the historical per-step snapshot chain that whoever commits migrations
  0032-0034 should be aware of.

## Batch: module 2 (learning-brain), todo items 2.1-2.3 — capture, search, pull-only review
  (backend only; `apps/api/src/note/`, `packages/core/src/note/`, `packages/shared/src/note.ts`;
  no migration — the `notes` table already existed from an earlier schema-only batch)

- **Barrel wiring, the one deviation from "don't touch the barrels"**: both `@post-anki/shared`
  and `@post-anki/core` declare only `"." -> src/index.ts"` in their `package.json` `exports` — no
  subpath exports exist anywhere in this repo, confirmed by `grep`. Without a barrel line, nothing
  in `apps/api` can import `Note`/`captureNoteInput`/`normalizeSearchQuery`/`selectNoteForReview`/
  `resolveNoteTaxonomySubtree` at all, so "don't touch `packages/core/src/index.ts` /
  `packages/shared/src/index.ts`" and "root `npm run typecheck` clean" directly conflict. Took the
  recommended default (per the task's own "resolve yourself, sound default, don't stop" rule):
  appended exactly one line to the end of each file —
  `export * from "./note/index";` (`packages/core/src/index.ts`) and `export * from "./note";`
  (`packages/shared/src/index.ts`) — nothing else in either file touched. Both diffs are a single
  added line at the end; easy to revert if the wiring pass wants to do it differently.
- **`noteNodeTypeSchema` is its own enum** (`"topic" | "gap" | "source"`), not a reuse of
  `node-feedback.ts`'s existing `nodeTypeSchema` (`"module" | "topic"`) — the two vocabularies
  don't overlap (notes are never attached to a module; feedback is never attached to a gap or
  source), and widening the existing one would let a note be captured against a module, which the
  spec never lists as a valid target.
- **`note.repo.ts` has zero imports from `gap.repo.ts` or any gap-write path** (S4's compliance
  boundary) — verified by `grep -rn "gap.repo" apps/api/src/note/` returning nothing. The
  nodeId-exists check for `POST /notes` reads `topics`/`gaps`/`sources` directly in
  `note.controller.ts`, the same shape `node-feedback.controller.ts` already uses for `modules`/
  `topics`, rather than calling through a repo that itself imports gap-write functions.
- **`searchVector` is written with `sql\`to_tsvector('english', ${body})\`` as a raw SQL value
  inside `.values()`** on insert (`note.repo.ts:insertNote`) — drizzle-orm 0.36 accepts a `SQL`
  expression as a column value with no special-casing needed; confirmed by `npm run typecheck`
  passing and the integration suite writing/reading real rows. `searchNotes` (`note-search.repo.ts`)
  matches on `${notes.searchVector} @@ plainto_tsquery('english', ${query})` and orders by
  `ts_rank(${notes.searchVector}, plainto_tsquery('english', ${query})) DESC` — same `'english'`
  config on both sides, kept as literal string in both places rather than a shared constant, since
  a drift here would silently empty every search result with a still-green typecheck (both
  occurrences are two lines apart in the same file, low risk of drifting unnoticed).
- **GIN index usage is asserted, not assumed**: the integration test runs
  `SET enable_seqscan = off` on its own `pg.Client` (not `SET LOCAL` — no open transaction to scope
  it to) before `EXPLAIN`ing the same `@@ plainto_tsquery(...)` shape `searchNotes` issues, and
  asserts the plan text contains `notes_search_vector_idx` by name — the small-table planner-picks-
  seqscan-anyway gotcha means asserting only "no Seq Scan" would have been weaker proof.
- **Taxonomy filter reads `parentId` only, never `domain_node_links`** (the `also_in` cross-links
  from an earlier batch's 0.7 decision) — matches `domainNodeProgress`'s own subtree walk exactly,
  per the spec's explicit "same shape, not a redesign" instruction (S12). A note attached under a
  node reachable only via an `also_in` link, not a `parentId` chain, will not surface under that
  link's other parent — logged as intentional, matching the existing rollup's own blind spot.
- **Taxonomy filter only matches `status = 'confirmed'` mappings** (S6) — a curriculum whose domain
  placement is still `suggested` (every freshly-approved learning-list mini-course, per an earlier
  batch's 0.6 decision) contributes no notes to any taxonomy-filtered search until a human confirms
  its placement. Correct-by-spec, logged so it doesn't read as a bug later.
- **The taxonomy resolution batches its DB reads** (`note-search.repo.ts:resolveNotesInTaxonomySubtree`)
  — one `gaps` select, one `sources` select, one combined `topics` select (topic-note ids ∪ gap
  rows' topicIds in a single `inArray`), one `curriculum_domain_node_mappings` select — never a
  per-note query, regardless of how many notes matched the text search.
- **`GET /notes/review` returns exactly `{ note: Note | null }`, nothing else** — no `remaining`,
  no `poolSize`, no unread count anywhere in the response, request handling, or repo layer. The
  review candidate pool (`listNotesForReviewPool`) is read fresh on every call and never persisted
  as a queue/backlog table or counter column beyond `notes.lastSurfacedAt` itself (an anti-repeat
  timestamp, not a debt signal — never read as "how overdue is this"). `GET /notes` (list-by-node)
  requires both `nodeType` and `nodeId`; either missing 400s rather than degrading into "list every
  note," so there is no code path that can be read as a global notes count.
- **`selectNoteForReview`'s `now` parameter is accepted but unused** — the spec's own Derivers
  table lists it as an input, and selection is purely a relative ordering (never-surfaced first,
  then oldest `lastSurfacedAt`, tie-break on `createdAt`) that needs no absolute-time comparison.
  Neither `tsc` (no `noUnusedParameters`) nor eslint (none configured in this repo) flags it — kept
  as-is per the spec's contract rather than dropped, since removing it would diverge signature from
  what S9/S11 both cite explicitly.
- **No code comments in any new file**, per this task's explicit hard rule — a deliberate departure
  from this codebase's dominant heavily-commented style (visible throughout every file this batch
  read). Every naming choice is intended to carry the same context a comment would have.
- Router/barrel wiring left for the user, as instructed: `apps/api/src/router.ts` needs 4 new
  `RouteName` union members and 4 route-table entries — `POST /notes` (`createNote`? — named
  `captureNote` here to avoid confusion with any future "note" verb-noun collision), `GET /notes`
  (`listNotesForNode`, query params `nodeType`/`nodeId`), `GET /notes/search` (`searchNotes`, query
  params `q`/`concern`/`domainNodeId`), `GET /notes/review` (`reviewNote`, query param
  `excludeIds`, comma-separated). `apps/api/src/server.ts` needs the matching `case` entries
  dispatching to `handleCaptureNote`/`handleListNotesForNode`/`handleSearchNotes`
  (`note.controller.ts`) and `handleReviewNote` (`note-review.service.ts`), extracting query params
  via `url.searchParams.get(...)` exactly as every existing GET handler with query params already
  does (e.g. `listPrioritySuggestions`). No new `RouteName` conflicts with anything currently in
  that union.
- Test counts this batch: `packages/core` grew from 518 (task brief's stated baseline) to 545 at
  the time this batch ran — 19 of that growth is this batch's own (`search-query.test.ts` 4,
  `note-taxonomy.test.ts` 7, `note-review.test.ts` 8); the remaining drift predates this batch (this
  is a concurrent multi-agent overnight run — other in-flight modules also added core tests). All
  545 pass. `apps/api` unit suite (fast, DB-free `vitest run`) unchanged at 334/334 — no DB-free
  unit-test file was added for the note module (repo/controller are integration/type-checked only,
  per the task's own "controllers and repos type-checked, not unit-tested" rule). New DB-backed
  coverage: `apps/api/src/note/note.repo.integration.test.ts`, 10/10 passing in isolation against
  the local `postanki_e2e` Postgres instance on `localhost:5436` — not counted in either baseline,
  runs only under `vitest.integration.config.ts` per this repo's existing convention.
- **Root `npm run typecheck` was NOT clean at the end of this batch, but not because of this
  batch**: `apps/api/src/learning-path/learning-path.repo.ts:310` and `:383` fail with a type
  mismatch (`priority: number` vs. a narrowed `0 | 1 | -1` union) and a missing export
  (`stepDomainNodeId`) — that file's mtime (04:08) is mid-edit by a different concurrent agent
  working the learning-paths module in this same overnight run, confirmed unrelated: it was
  untouched by this batch, and `@post-anki/shared`/`@post-anki/core`/`@post-anki/api`'s own note-
  specific files typecheck clean in isolation (confirmed via an earlier clean full-repo typecheck
  run before that file's concurrent edit landed). Flagged here rather than silently claimed as met,
  matching this file's own established precedent for transient concurrent-agent breakage.

## Batch: module 1 (learning-paths), todo items 1.1-1.3 — path entity, order resolution, progress/next-step

- **`resolvePathOrder` uses Kahn's algorithm, whole-target-set fallback on any cycle** — edges
  outside `targetNodeIds` (either side) are dropped before the topo sort even runs, so a dangling
  or out-of-set prerequisite is never a special case. On a cycle among the targets, the ENTIRE
  target set falls back to taxonomy-order sort (not just the cyclic subgraph) — simpler and
  equally safe per S15's own wording ("falls back... for the affected targets"), avoids partial-
  fallback complexity for a case (`domain_node_prerequisites` cycle) that should never occur given
  #83's source YAML is a DAG. No `MAX_DEPTH` guard needed: Kahn's is bounded by O(nodes+edges) and
  terminates on a cycle by construction (unconsumed queue), unlike a DFS that could recurse.
- **Taxonomy-order fallback is a plain stable sort by `order`, ties broken by input array
  position** — verified this keeps a Full-Stack Engineer path's React areas (order 0-9) before its
  Node.js areas (also order 0-9, different parent) rather than interleaving them, because
  `targetNodeIds` lists all of React's targets before Node's and `Array.prototype.sort` is
  spec-guaranteed stable. No secondary tiebreak field was added.
- **`pathProgress` calls `domainNodeProgress` once per step, unmodified, and computes no path-level
  aggregate.** Re-read S11 closely: the deriver's output shape (`{overallStatus, steps}`) has no
  combined topicsIncluded/topicsMastered anywhere, so there is nothing to double-count across
  steps — `domainNodeProgress`'s own internal topic-id dedup (per subtree, already tested) is the
  entire correctness mechanism. Resisted the temptation to build a cross-step aggregate "just in
  case"; a test (`path-progress.test.ts`) proves the same shared node returns identical numbers
  from two independent `pathProgress` calls.
- **A step's `done` threshold is `topicsMastered === topicsIncluded` (all included topics
  individually mastered), not `percent === 100`.** `percent` is the average of included topics'
  maturity and the mastery threshold is 80, so an all-mastered step's percent can land anywhere in
  [80,100] and would almost never literally hit 100. spec.md's Decisions phrase ("percent reaching
  100 (all included topics mastered)") treats the two as synonyms; only the parenthetical is
  actually implementable, so that's what shipped. Logged so a reviewer doesn't read the deviation
  from the literal sentence as a bug.
- **An empty step (`topicsIncluded === 0`) is `not_started`, checked before the `done` branch** —
  otherwise `0 === 0` would read as `done`, silently completing a Cloud Engineer path whose AWS
  areas have zero captured content. Also means `nextPathStep` recommends an empty step once every
  earlier step is done (S3 × S7 interaction) — intentional: the empty step's own CTA is "capture
  content," not "skip," and no step is ever access-locked.
- **`markLearningPathCompletedIfDue`'s guard is `status = 'active' AND completed_at IS NULL`, not
  just the latter.** Guarding on `completed_at IS NULL` alone would let a later read of an
  *abandoned* path (whose mapped topics keep accumulating mastery from other paths sharing the same
  Areas) flip it back to `completed` — a read resurrecting a path the learner deliberately walked
  away from, which S10 explicitly forbids ("remains readable, just excluded from active listings").
- **Role templates target curated Area leaf nodes (not whole sub-subjects), one path per role in
  `role-paths.yaml`**: `frontend-engineer` → 10 React Areas, `full-stack-engineer` → 10 React + 10
  Node.js Areas, `cloud-engineer` → 10 AWS Areas — the generic catch-all "Other" Area under each
  sub-subject is deliberately excluded from every template (a bucket, not a learning objective).
  Verified all three resolve cleanly against `web-dev-areas.yaml`'s real node names via a
  standalone script (not just typechecking) before treating the YAML as correct.
- **Role template resolution is subject-scoped by name** (`WEB_DEVELOPMENT_SUBJECT_NAME =
  "Programming / Web Development"`, matching `seed-domain-nodes.ts`'s existing `SEED_SUBJECT_NAME`
  constant and `seed-domain-taxonomy.ts`'s own root-name lookup precedent) rather than by a
  hardcoded subject id, since ids are generated at seed time. `resolveNodePathByName`'s result is
  checked for `fullyResolved === true`, not just a non-null `nodeId` — a typo'd Area name would
  otherwise silently resolve to its parent sub-subject node and write a wrong-but-valid step
  (S4's exact failure mode), so the check is on the stricter field.
- **`gatherStepPushCandidates` (SCENARIO 8) mirrors `push.repo.ts`'s `gatherPushCandidates`
  filters exactly** — confirmed curricula only, dormant curricula excluded via
  `listDormantEntityIds("curriculum")`, included topics only — scoped additionally to the current
  step's own subtree (via a new `collectDescendantNodeIds` helper, `packages/core/src/domain-map/`,
  same bounded BFS shape as `domainNodeProgress`'s internal walk but returning ids instead of a
  rollup — `domain-map-progress.ts` itself was left unmodified rather than adding a subtree-id
  return value to an existing, already-tested function). Ranking itself is untouched
  `selectDailyPush`, called with these pre-filtered candidates — no second ranking algorithm.
- **`packages/shared/src/learning-path.ts` was written with the full canonical zod schema set
  (path, step, role template, progress, create/abandon input) but is NOT yet reachable from
  `apps/api`** — `packages/shared/src/index.ts` doesn't export it yet (left for barrel wiring, per
  this task's explicit no-touch list), and the package's `exports` map (`"." only`) blocks any deep
  import from working around that. `apps/api/src/learning-path/learning-path.controller.ts`
  therefore defines its own tiny local zod schemas for the two request bodies it actually validates
  (`{roleTemplateId}`, `{status: "abandoned"}`) rather than depending on the unwired shared file;
  these should be deleted in favor of the shared ones once the barrel is wired.
- **`packages/core/src/learning-path/index.ts` (the module's own local barrel) was edited to add
  the three new derivers** — this is NOT the forbidden `packages/core/src/index.ts`; the top-level
  file already does `export * from "./learning-path/index"` (landed by an earlier batch), so the
  three new exports (`resolvePathOrder`, `pathProgress`/`derivePathStepStatus`, `nextPathStep`)
  reach `@post-anki/core` without touching the top-level file. Same pattern applied to
  `packages/core/src/domain-map/index.ts` for `collectDescendantNodeIds`.
- Router/barrel wiring left for the user, as instructed. `apps/api/src/router.ts` needs 6 new
  `RouteName` union members and route-table entries: `GET /role-templates` (`listRoleTemplates`),
  `POST /learning-paths` (`createLearningPath`), `GET /learning-paths` (`listLearningPaths`, query
  param `status`), `GET /learning-paths/:id` (`getLearningPath`), `PATCH /learning-paths/:id`
  (`updateLearningPath` — abandon only), `GET /learning-paths/:id/steps/:stepId/push`
  (`getLearningPathStepPush`, two path params like `removeTagAssignment`'s `params: ["id",
  "assignmentId"]` shape). `apps/api/src/server.ts` needs 6 matching `case` entries dispatching to
  `handleListRoleTemplates`, `handleCreateLearningPath`, `handleListLearningPaths`,
  `handleGetLearningPath`, `handleAbandonLearningPath`, `handleGetLearningPathStepPush` (all in
  `apps/api/src/learning-path/learning-path.controller.ts`), extracting the `status`/`stepId`
  params exactly as existing handlers already do. `packages/shared/src/index.ts` needs
  `export * from "./learning-path";` added; `packages/core/src/index.ts` needs no change (already
  wired, see above).
- Test counts this batch: `packages/core` grew from 561 (already-elevated by concurrent batches
  running this same night) by 26 of this batch's own tests (`resolve-path-order.test.ts` 8,
  `path-progress.test.ts` 6, `next-path-step.test.ts` 4, `collect-descendant-node-ids.test.ts` 4 —
  22 net-new learning-path-adjacent, plus this batch observed the suite already at 561 pre-existing
  before its own additions landed, all passing). `apps/api` unchanged at 334/334 — no new unit-test
  file, matching this task's own "repos/controllers are type-checked, not unit-tested" rule; no
  integration test was written either, since the schema/repo shape here was already landed by an
  earlier batch and this batch's own repo functions are pure CRUD/query composition with no novel
  concurrency-sensitive logic worth a throwaway-DB test (unlike e.g. `mergeDomainNodes`'s locking).
- Root `npm run typecheck` IS clean at the end of this batch (verified twice, once before and once
  after this batch's own changes, against the concurrently-updated state of `packages/shared`,
  `packages/core`, and `apps/api` other agents were also editing this same night).

## Batch: router wiring for learning-paths (module 1) and notes (module 2)

- Both modules' handlers were already fully built and tested by earlier batches this same night;
  this batch is pure wiring — 10 new `RouteName` union members, 10 new `ROUTES` entries, 10 new
  `case` dispatches in `server.ts`, no new handler logic anywhere.
- `packages/shared/src/index.ts` gained `export * from "./learning-path";` (`packages/shared/src/index.ts:69`)
  — no name collisions checked and confirmed against every other shared export. The
  learning-path controller's two local stopgap zod schemas
  (`createLearningPathInputSchema`/`updateLearningPathInputSchema`) were deleted outright and
  replaced with the canonical `createLearningPathInput`/`updateLearningPathInput` imports from
  `@post-anki/shared` (`apps/api/src/learning-path/learning-path.controller.ts:1-3`) — the two
  schemas were byte-for-byte identical in shape, so this was a pure swap, not a behavior change.
- Route ordering: `GET /learning-paths/:id/steps/:stepId/push` is listed before
  `GET /learning-paths/:id` in `ROUTES` (`apps/api/src/router.ts`), matching the existing
  specific-before-generic convention (e.g. `/learning-list-items/:id/recommendation` before
  `/learning-list-items/:id`) even though the two patterns don't actually collide here — both are
  `$`-anchored regexes and `[^/]+` can't span the extra `/steps/:stepId/push` segments, so ordering
  is defensive/convention-following rather than load-bearing. Same reasoning applies to
  `GET /notes/search` and `GET /notes/review` (both exact-string patterns) being listed before the
  exact-string `GET /notes` — no real collision risk today since none of the three patterns are
  regexes, but ordered this way so a future `GET /notes/:id` addition (not built by anyone yet)
  slots in after them by construction rather than requiring a reviewer to re-derive the ordering
  rule from scratch.
- `handleReviewNote` lives in `note-review.service.ts`, not `note.controller.ts` (pre-existing
  split from the module-2 batch) — imported separately in `server.ts` rather than re-exported
  through the controller, to avoid adding a cross-file re-export with no other purpose.
- Test counts this batch: `apps/api` 334 -> 341 (7 new: 3 collection/detail assertions, 2
  specific-before-generic ordering assertions covering both the learning-path step-push route and
  the notes search/review routes, 2 negative-method/unknown-sub-resource assertions), all in
  `apps/api/src/router.test.ts`. `packages/core` unchanged at 561/561 (no core file touched by this
  batch). Root `npm run typecheck` clean before and after.

## Batch: analytics and reporting (module 4), todo items 4.1-4.3, backend only

- No partial work found from a prior agent — `packages/core/src/analytics/` and
  `apps/api/src/analytics/` did not exist. Built from scratch per `.planning/analytics-reporting/spec.md`.
- **`stats` vs `analytics` reconciled in favor of spec.md.** The task brief's "extend the existing
  stats service, never a parallel stats layer" is satisfied in substance, not by literally adding to
  `apps/api/src/stats/`: nothing here reimplements `CurriculumStats`, weak spots, or recommendations
  — that stays exactly as it was. `analytics` is a distinct entity/domain (cross-cutting retention/
  coverage/digest, not per-curriculum stats), so it gets its own entity-first folder per spec.md's
  explicit "Files to create" list, which is the authoritative contract here. `apps/api/src/stats/`
  was not touched.
- **`aggregateTimeToMastery`/`aggregateRetentionRate` made key-aware**, not the plain
  `(number|null)[] -> Summary|null` reading spec.md's Derivers table alone might suggest. They take
  `{key, value}[]` plus an explicit `keys: string[]` so the topicId/domainNodeId grouping ("caller's
  join") is itself a tested deriver behavior (S1's "empty group, not an error" is now a real unit
  test, not a service-layer assumption). Both share one internal `aggregateNumbers`/
  `groupAndAggregate` helper (`packages/core/src/analytics/aggregate-numbers.ts`) so "retention
  aggregates the same way time-to-mastery does" (S2) is literally true, not just similar code.
- **Added one deriver beyond spec.md's four-deriver table: `buildMasteryBreakdown`**
  (`packages/core/src/analytics/mastery-breakdown.ts`). S1/S2 both require aggregation "per topic
  and per Area" — the gapId→topicId→Area join that makes that grouping possible is itself
  interesting logic (per the hard rule that interesting logic belongs in tested derivers, not
  services), so it got its own file and its own tests rather than being inlined in
  `analytics.service.ts`.
- **Retention's aggregate number is mean-of-per-gap-rates, not pooled correct/total.** Chosen so the
  aggregation shape literally matches time-to-mastery's (mean of per-item values), per S2's "the
  same way" wording. Both are defensible; this is the one taken.
- **Timestamp comparisons use `Date.parse`, never lexicographic string comparison** — every
  `createdAt`/`masteredAt`/`answeredAt` crossing the repo boundary is converted via
  `.toISOString()` first, so this is belt-and-suspenders, not a fix for an observed bug.
- **`GET /analytics/retention`'s response bundles retention AND time-to-mastery** (overall plus
  per-topic/per-Area breakdown), rather than needing a fourth route — spec.md's "Files to modify"
  only lists three routes (`/analytics/coverage`, `/analytics/retention`, `/analytics/digest`), and
  both signals share the same `gap_mastery`/`probe_session_questions` read path and the same
  Phase-1 scope, so one response shape avoids a second near-duplicate endpoint that S1's own
  "aggregated per topic and per Area" would otherwise need. `RetentionReport`
  (`packages/shared/src/analytics.ts`) is the resulting shape:
  `{ overall, timeToMasteryOverall, byTopic, byArea }`.
- **Coverage's `subjectName` per Area is the parent domain-node's name** (e.g. "React"), not
  `subjects.name` (the top-level "Web Development" subject row) — matches S8's "rows are Web
  Development's three sub-subjects" and the `web-dev-areas.yaml` seed shape, where Area nodes are
  children of `kind: 'sub_subject'` nodes.
- **A topic mapped to more than one confirmed Area** (the many-to-many
  `curriculum_domain_node_mappings` decoupling, issue #84) contributes its gap durations/retention
  to every mapped Area, not just one — same "no arbitrary tie-break" posture `domainNodeProgress`
  itself already takes for shared-ancestor topic counting.
- **No repo-layer integration tests were added** for `apps/api/src/analytics/analytics.repo.ts`.
  `todo.md`'s own item phrasing marks items 1-4 (the derivers) "+ tests" and leaves item 5 (the
  repo) without that suffix; the repo functions here are pure read/join composition with no
  concurrency-sensitive logic worth a throwaway-DB test (unlike e.g. `mergeDomainNodes`'s locking),
  matching the precedent set by the learning-path batch above. Correctness is covered by the 26
  deriver unit tests plus `npm run typecheck`.
- **`buildMasteryBreakdown` dedupes `(topicId, areaId)` pairs before bucketing** — a topic's
  contribution to an Area's aggregate must count once even if `curriculum_domain_node_mappings`
  ever has more than one confirmed row for the same pair (the table carries no unique constraint on
  `(curriculumId, domainNodeId)`; `getDomainMapForSubject`'s `curriculaByNodeId` and
  `domainNodeProgress`'s topic-id dedupe already treat this as a live defensive concern on the same
  table). One additional unit test covers it.
- **Zero schema changes, confirmed.** Every repo function reads existing columns only:
  `gap_mastery.gapId/createdAt/masteredAt`, `gaps.topicId`, `probe_session_questions.gapId/topicId/
  answeredAt/outcome`, `domain_nodes.kind/subjectId/parentId/name`,
  `curriculum_domain_node_mappings.status/domainNodeId/curriculumId`, `topics.*` (via the existing
  `toTopicForProgress` shape), `gaps.concern/state` (via unmodified `summarizeConcerns`),
  `user_streaks` (via unmodified `getStreak`). `apps/api/src/db/schema.ts` was not touched.
- **Coverage reuses `domainNodeProgress`/`domainMasteryStatus` unmodified** — `buildCoverageReport`
  (`packages/core/src/analytics/coverage-report.ts:24`) calls both exactly as
  `learning-path/path-progress.ts` already does, no second rollup.
- **The digest is not reachable from any push path, confirmed.** `apps/api/src/push/` has zero
  references to `analytics` anywhere (`grep -rl analytics apps/api/src/push/` empty). It is computed
  fresh only inside `getWeeklyDigest()`, called only from the unrouted
  `handleGetWeeklyDigest` controller — no cron, no cache, no scheduled job.
- **Exactly one line appended to each barrel**, at the end, per the hard rule:
  `packages/core/src/index.ts:19` (`export * from "./analytics/index";`),
  `packages/shared/src/index.ts:42` (`export * from "./analytics";`).
- **Router wiring left unrouted, for another agent**, per the task's explicit hard rule.
  `apps/api/src/analytics/analytics.controller.ts` exports three unrouted handlers:
  `handleGetCoverageReport` (suggested `GET /analytics/coverage`), `handleGetRetentionReport`
  (suggested `GET /analytics/retention`), `handleGetWeeklyDigest` (suggested `GET /analytics/digest`)
  — none take path/query params today.
- Test counts this batch: `packages/core` 561 -> 587 (26 new, all in
  `packages/core/src/analytics/*.test.ts`: 6 `aggregate-numbers`, 5 `gap-time-to-mastery`, 6
  `retention-rate`, 3 `coverage-report`, 4 `mastery-breakdown`, 2 `weekly-digest`). `apps/api`
  unchanged at 341/341 (already elevated by the concurrent router-wiring batch above; no apps/api
  unit-test file added by this batch — see the no-integration-tests decision). Root
  `npm run typecheck` clean before and after, verified against the concurrently-updated state of
  every workspace other agents were also editing this same night.

## Batch: module 3 (study-scheduling), todo items 3.1-3.3 — planned sessions, run loop, consistency
  (backend only; `apps/api/src/study-session/`, `packages/core/src/study-session/`,
  `packages/shared/src/study-session.ts`; schema/migration (`0034`) already landed by an earlier
  batch — nothing added or changed here)

- **The run loop performs zero new ranking logic, confirmed by construction.** `scopeSessionCandidates`
  (`packages/core/src/study-session/scope-session-candidates.ts`) only filters the existing
  `PushCandidate[]` pool — drops candidates outside the scoped curriculum set, and filters covered
  gap ids out of each remaining candidate's own `gaps` array (not the whole candidate, so a topic
  with one covered gap and one still-open gap stays eligible) — then hands the result to
  `selectDailyPush` (`packages/core/src/curriculum/daily-push.ts`) completely unimported-from/
  unmodified. `study-session.service.ts::getSessionPush` is the only caller of both, in that order.
- **No per-answer table, exclusion list is client-supplied.** There is deliberately no persisted
  "gaps covered this session" table (matches the spec's explicit decision). `alreadyCoveredGapIds`
  is a plain `string[]` the run-loop endpoint (`GET /study-sessions/:id/push`) takes as a
  comma-separated `excludeGapIds` query param, sourced from the web session-runner's own in-memory
  run-loop state (the 3.4 web agent's territory) — the deriver itself stays pure and transport-blind.
- **No reminder, cron, or second push channel exists anywhere in this module — verified, not just
  asserted.** `grep -rn "push/" apps/api/src/study-session/ packages/core/src/study-session/`
  returns exactly one hit: `study-session.service.ts`'s `import { gatherPushCandidates } from
  "../push/push.repo.js"` — a read, not a delivery call. `grep -rni "reminder|notif|cron|scheduler"`
  over both directories returns nothing.
- **`isSessionMissed` stays a pure, read-time display label, never a write.** `study-session.service
  .ts::listSessionsForSchedule` computes it fresh on every `GET /study-sessions` call and attaches
  it as a `missed: boolean` field on each returned item (`StudySessionListItem` in
  `packages/shared/src/study-session.ts`) — no `study_sessions` row is ever updated by this
  computation, no notification fires, and a session past its `scheduledFor` simply carries
  `missed: true` for the schedule list to filter out of "Upcoming" client-side.
- **Learning-path targeting is implemented for real, not stubbed "not available yet."** The spec's
  own scope boundary hedged this on whether the sibling `learning-paths` module had shipped — it
  has: `apps/api/src/learning-path/learning-path.repo.ts` already exports `getLearningPath`,
  `gatherPathProgressInputs`, and `collectDescendantNodeIds` is already a core export. Took the
  sound default (module present, working, and exactly the shape the spec's own S10 describes) over
  building a dead-end stub: `resolveScopedCurriculumIds` (`study-session.service.ts`) resolves a
  `learning_path` target by unioning `collectDescendantNodeIds` over every step's `domainNodeId`,
  same for a `domain_node` target via `getDomainNode` + `listDomainNodesForSubject`
  (`apps/api/src/domain-map/domain-map.repo.ts`, both read-only imports, neither file touched).
  Resolves the manual step in `.planning/study-scheduling/todo.md` ("verify targetType:
  'learning_path' resolves for real") by observation — logged here rather than left dangling.
- **Curriculum-id resolution for a node subtree is one small new query, not a reimplementation of
  taxonomy traversal.** `resolveCurriculumIdsForDomainNodeIds` (`study-session.repo.ts`) is a
  ~15-line `curriculum_domain_node_mappings` read filtered to `status = 'confirmed'` for a given
  node-id set — the actual subtree walk (`collectDescendantNodeIds`) is the reused core function;
  this is the same one-hop join-table lookup `learning-path.repo.ts::gatherStepPushCandidates`
  already does internally, just not exposed as a standalone export I could import instead. Chose
  not to touch `learning-path.repo.ts` to add that export, per the "never touch another module's
  folder" hard rule.
- **The candidate pool itself is fetched once, unscoped, regardless of target** —
  `getSessionPush` always calls the same `gatherPushCandidates()` `/daily-push` already uses (never
  `gatherStepPushCandidates`), in `Promise.all` alongside `resolveScopedCurriculumIds`, then narrows
  in memory via `scopeSessionCandidates`. This is what makes S11 ("Anything" behaves exactly like
  `/daily-push`) trivially true — a `null` `scopedCurriculumIds` is a no-op filter over the identical
  pool — and keeps the "one DB round trip for candidates" performance target regardless of target
  type.
- **`sessionConsistency`'s window anchor is `completedAt ?? scheduledFor`, and a session with
  neither is excluded from both the numerator and the denominator** — an ad hoc session that was
  started but never scheduled and never finished (no `completedAt`, no `scheduledFor`) does not
  count against consistency at all, rather than inflating the rate by shrinking only the
  denominator. Verified this can't invert the guilt direction: a row can only be `completed` if it
  has `completedAt`, so an anchor-less row could never have been a numerator entry either — dropping
  it cannot inflate the rate. A dedicated test names this behavior explicitly
  (`session-consistency.test.ts`: "does not count an ad hoc session that was never scheduled and
  never finished against consistency"). `windowDays` defaults to 30 (unnamed in the spec), taken as
  a parameter so it stays testable and overridable by the caller.
- **`PATCH /study-sessions/:id/end` is idempotent and duration-gated, not a blind "always end."**
  The controller reads `userRequestedEnd` from the body (default `false`) and calls the existing
  `shouldEndSession` deriver — an explicit `userRequestedEnd: true` (the "End now" tap) always ends;
  an automatic/periodic call with the default only ends once `plannedDurationMinutes` has actually
  elapsed, otherwise the session is returned unchanged. Ending a session with zero answered
  questions sets `status: "abandoned"`; one or more answered sets `"completed"` — both set
  `completedAt`, never a third "partial/failed" state, matching S5 literally.
- **Streak recording is sequential, not parallelized, and gated on the outcome.** `completeSession`
  (`study-session.service.ts`) awaits `endStudySession` first, then calls the existing
  `recordActivityToday` (`streak/streak.service.ts`, unmodified) only when the resulting status is
  `"completed"` — this is a genuine read-then-decide dependency (the streak call needs to know the
  session actually completed with answers, which the repo call itself just decided), not two
  independent writes, so `Promise.all` was deliberately not used here.
- **Repo and controller are type-checked only, no unit tests** (`study-session.repo.ts`,
  `study-session.service.ts`, `study-session.controller.ts`) — matches this task's own hard rule and
  every prior batch's precedent (analytics, note, learning-path). All business logic lives in the
  six pure derivers, each unit-tested against fixtures with an injected `now`, zero DB, zero clock.
- **Barrels**: exactly one line appended to each, at the end, per the hard rule —
  `packages/core/src/index.ts` (`export * from "./study-session/index";`),
  `packages/shared/src/index.ts` (`export * from "./study-session";`). Re-read immediately before
  editing both times; a sibling agent's `study-material` line landed after mine in both files
  between my read and this write, confirmed non-conflicting.
- **Router wiring left unrouted, for the user**, per the task's explicit hard rule.
  `apps/api/src/study-session/study-session.controller.ts` exports eight unrouted handlers:
  `handleCreateStudySession` (`POST /study-sessions`), `handleListStudySessions`
  (`GET /study-sessions`), `handleGetStudySessionConsistency` (`GET /study-sessions/consistency`,
  query param `windowDays`), `handleGetStudySession` (`GET /study-sessions/:id`),
  `handleStartStudySession` (`PATCH /study-sessions/:id/start`), `handleEndStudySession`
  (`PATCH /study-sessions/:id/end`), `handleRecordStudySessionAnswer`
  (`PATCH /study-sessions/:id/answers`), `handleGetStudySessionPush` (`GET
  /study-sessions/:id/push`, query params `excludeGapIds` comma-separated, `mode`). **Route
  ordering matters**: `resolveRoute` (`router.ts`) matches in array order, so the literal
  `/study-sessions/consistency` pattern must be registered before the `/^\/study-sessions\/([^/]+)$/`
  regex pattern, or the `:id` pattern will swallow "consistency" as an id — same collision shape
  `router.ts` already avoids elsewhere (e.g. `/notes/search` before any `/notes/:id`-shaped
  pattern, though notes has none today).
- Test counts this batch: `packages/core` 587 -> 608 (21 new, all in
  `packages/core/src/study-session/*.test.ts`: 4 `scope-session-candidates`, 4 `should-end-session`,
  2 `session-elapsed`, 2 `record-session-answer`, 4 `is-session-missed`, 5 `session-consistency`).
  `apps/api` unit suite (fast, DB-free `vitest run`) unchanged at 341 attributable to this batch —
  no unit-test file added (repo/controller are type-checked only, per the no-unit-tests-on-repos
  rule); the file's running total moved to 348 from concurrent sibling-agent work landing in
  parallel during this same run, confirmed unrelated by scoping the count to files under
  `apps/api/src/study-session/` (none exist) before and after. Root `npm run typecheck` clean across
  `@post-anki/shared`, `@post-anki/core`, and `@post-anki/api` at the end of this batch.

## Batch: module 6 (milestones), todo items 6.1-6.2 — completion criteria + award-on-read
  (backend only; `apps/api/src/milestone/`, `packages/core/src/milestone/`,
  `packages/shared/src/milestone.ts`; schema/migration already landed by an earlier batch — see
  "Batch: modules 5, 6, 7" above — nothing added or changed here)

- **`isComplete` reused verbatim for both entity types, `percent >= 100`, no special-casing.**
  Pinned by a unit test naming the one real consequence of reusing `moduleProgress`'s `Math.round`
  unmodified: a curriculum averaging 99.5 topic maturity rounds up to 100 and awards. This is a
  deliberate result of "never a second progress formula," not a bug — logged so a future reader
  doesn't "fix" it.
- **Curriculum completion candidates are scoped to `curricula.status = 'confirmed'` only** —
  `confirmed` is the terminal happy-path status (`setCurriculumStatus` never transitions a
  curriculum back out of it; verified by grepping every caller), and a draft/curating/
  shaping_structure curriculum has no stable structure to be "100% mastered" against. Matches
  Scenario 2's own wording ("every confirmed curriculum").
- **Area completion reuses `domainNodeProgress` directly, not `buildCoverageReport` or
  `apps/api/src/analytics/`'s `getCoverageInputs`.** `apps/api/src/analytics/` is a different
  module's folder, actively edited by a concurrent agent tonight — importing its repo functions
  would couple this module to files outside its own control and outside this task's remit.
  `domainNodeProgress` is the actual reused rollup either path bottoms out in, so this still
  satisfies "reuse the Area-coverage shape rather than recomputing" without the cross-module
  coupling. `milestone.repo.ts` writes its own minimal DB queries (curricula + topics + domain
  nodes + confirmed mappings), mirroring `analytics.repo.ts`'s `getCoverageInputs`/
  `toTopicForProgress` shape rather than importing it.
- **`awardIfNew` skips the app-level pre-check-then-insert step `subject-duplicate.repo.ts`'s
  `insertDuplicateSuggestionIfNew` uses** — it always attempts the insert and relies entirely on
  the DB's unique index + `23505` catch. The pre-filtering instead happens one layer up, in
  `evaluateAndAwardMilestones` (skip any ref already present in `listMilestoneKeys()`'s result) —
  cheap for the common "already awarded on an earlier read" case, but the concurrency test proves
  the DB index is the real guard by calling `awardIfNew` directly, twice, concurrently, bypassing
  that pre-filter entirely.
- **`entityLabel` is resolved fresh at read time from the curriculum/domain-node's current name,
  not stored on the `milestones` row.** This is a real gap flagged rather than fixed: Scenario 7
  says a milestone survives its curriculum being deleted, but with no label column on `milestones`
  (schema is out of this batch's scope — already landed, no further changes permitted) a deleted
  entity's milestone renders with `entityLabel: null` instead of its original name. The award
  itself is untouched either way (id/entityType/entityId/criteriaKey/achievedAt all still correct),
  only the display name degrades. A `milestones.entityLabel` snapshot column, written once at
  `awardIfNew` time, is the clean fix — logged as follow-up for whoever next touches
  `schema.ts`/generates a migration for this module.
- **`listMilestones` reads only the `milestones` table plus a current-name join — never live
  percent.** This is the module's core compliance boundary with `.product/REJECTED.md` and is
  proven by an integration test (SCENARIO 6, `apps/api/src/milestone/
  milestone.repo.integration.test.ts`, "survives its curriculum's live percent dropping below the
  threshold, with achievedAt untouched"): awards a milestone, folds a fresh 0%-maturity topic into
  the same curriculum (dropping its live percent below 100, asserted directly via
  `getCurriculumCompletionCandidates`), re-runs `evaluateAndAwardMilestones`, and asserts exactly
  one row with a byte-identical `achievedAt` survives.
- **`GET /milestones`'s handler (`handleGetMilestones`,
  `apps/api/src/milestone/milestone.controller.ts`) is the only caller of
  `evaluateAndAwardMilestones` anywhere in `apps/api/src`** — confirmed by
  `grep -rln "milestone" apps/api/src --include=*.ts | grep -v "/milestone/"`, which returns only
  `db/schema.ts` (the already-landed table definition). No cron, scheduler, answer-submission path,
  or `push/` reference exists anywhere near this module.
- Router wiring left unrouted, for the user, per the task's explicit hard rule:
  `apps/api/src/milestone/milestone.controller.ts` exports one handler, `handleGetMilestones`
  (`GET /milestones`, no params, no query string) — suggested route-table entry
  `{ method: "GET", pattern: "/milestones", name: "listMilestones" }`.
- **Barrels**: exactly one line appended to each, at the end, per the hard rule —
  `packages/core/src/index.ts` (`export * from "./milestone/index";`), `packages/shared/src/index.ts`
  (`export * from "./milestone";`). Re-read immediately before editing both times; two sibling
  agents' `content-library`/`source-duplicate` lines landed after mine in both files between my
  read and the final typecheck, confirmed non-conflicting.
- Test counts this batch: `packages/core` 587 -> 591 (4 new, `packages/core/src/milestone/
  is-complete.test.ts`) at the moment this batch's tests were added; concurrent sibling-agent work
  moved the file's running total to 649 by the time of the final full-suite run (confirmed
  unrelated — no other file under `packages/core/src/milestone/` exists). `apps/api` unit suite
  (fast, DB-free `vitest run`) unchanged at 341 attributable to this batch, running total 348 at
  the end from concurrent work (repo/controller are integration-tested only, per the
  no-unit-tests-on-repos rule). New DB-backed coverage: `apps/api/src/milestone/
  milestone.repo.integration.test.ts`, 16/16 passing (`npx vitest run --config
  vitest.integration.config.ts src/milestone/milestone.repo.integration.test.ts` from `apps/api`)
  against the local `postanki_e2e` Postgres instance on `localhost:5436` — not counted in either
  baseline, per this repo's existing convention. Root `npm run typecheck` clean across every
  workspace (`shared`, `core`, `api`, `web`, `bot`, `mobile`) at the end of this batch.

## Module 5 (content-library), todo items 1-8 — cross-curriculum listing, fetch state, two-tier
  duplicate detection, re-fetch (backend only; schema already landed in an earlier batch's
  0035 migration)

- **Re-fetch calls `guardedFetchText` directly, not `resolveSourceText`** — a deliberate,
  logged divergence from spec.md's literal phrasing ("delegates to resolveSourceText"), following
  the task brief's own authoritative wording instead ("Re-fetch MUST go through
  `guardedFetchText`"). `resolveSourceText` (`curriculum/source-fetch.ts`) collapses every failure
  into a placeholder STRING embedded in its return value (`"[could not fetch ...]"`), with no
  structured outcome a caller can gate a conditional write on — it was built for "assemble prompt
  text once", not "tell me if this attempt succeeded". SCENARIO 7 needs the real outcome, so
  `content-library/refetch-link.ts` calls `guardedFetchText` directly and duplicates the small
  strip-html/sanitize/truncate step `source-fetch.ts` already does, rather than exporting those
  helpers from a file two other modules also depend on mid-run. Confirmed: `refetch-link.ts:56`
  is the only call site; `grep -rn "delete(sources)\|mergeSource" apps/api/src/content-library
  apps/api/src/source-duplicate` returns nothing.
- **`too_many_redirects` (one of `guardedFetchText`'s four failure outcomes) folds into
  `network_error`** in `refetch-link.ts` — the schema's `lastFetchOutcome` column comment permits
  only `"ok"|"blocked"|"http_error"|"network_error"`, and a redirect loop is, from the caller's
  perspective, "the fetch never produced a usable response", same bucket as a network failure. A
  truncated success (`guardedFetchText`'s `truncated: true`) still writes `outcome: "ok"` — a
  capped-but-real body is a good re-fetch, per spec.md's own line 141.
- **Re-fetch is scoped to `kind === "link"` only** — a `text` or `video` source has no URL to
  re-fetch (the pasted text/description IS the source), so `POST /sources/:id/refetch` against
  either returns `{ error: "not_refetchable" }` and writes nothing, rather than silently stamping
  `lastFetchedAt` for an attempt that never happened. Proven by a dedicated integration test
  (`content-library.repo.integration.test.ts`, "returns not_refetchable for a text source and
  writes nothing").
- **A failed re-fetch never overwrites `fetchedText`** — `content-library.repo.ts::writeRefetchResult`
  only includes `fetchedText` in its `SET` clause when the caller passes a non-null value, and
  `content-library.service.ts::refetchSource` only passes one when `outcome === "ok"`.
  `lastFetchedAt`/`lastFetchOutcome` are written unconditionally, every attempt. Proven by
  `content-library.repo.integration.test.ts`, "records the failure but leaves a previously-good
  fetchedText exactly as it was" — seeds a source with `fetchedText: "good body from months ago"`,
  mocks a 404, and asserts the row's `fetched_text` is byte-identical afterward while
  `last_fetched_at` advances.
- **`GET /sources` is a pure read — no duplicate suggestion is ever persisted from it.** Scenario 3
  says the exact-URL tier "runs on every listing read (or a cheap pre-scan)"; a GET mutating state
  (writing rows on read) risks a listing 500ing on a unique-violation race and conflates a read
  endpoint with a write one. Both tiers (exact-URL, free; embedding-similarity, capped) run and
  persist together only from the explicit `POST /source-duplicate-scans` action — SCENARIO 1's own
  mermaid diagram shows both tiers hanging off one "scan for duplicates?" decision node, not off
  the listing read itself. `GET /sources` therefore carries no duplicate-signal field at all.
- **`normalizeSourceUrl` drops scheme entirely** (not just lowercases it) — spec.md names host
  lowercasing + query/fragment/trailing-slash stripping but never calls out scheme as a
  distinguishing signal, and http vs. https on the same host+path is the single most common
  "same article, different link" case in practice. Logged as a default, not re-litigated against
  the literal wording.
- **The embedding tier excludes sources with empty `fetchedText`** — found while writing the
  scenario-4 integration test: two never-fetched sources (both `fetchedText: null`) hash to the
  identical near-empty string and would embed to the identical vector, producing false-positive
  "duplicate" suggestions between two sources that share no real content, only the absence of any.
  `source-duplicate.orchestrator.ts` filters `sourceRows` to non-empty `fetchedText` before
  building `selectSubjectsForScan`'s candidate set — a source still awaiting its first fetch can
  only ever surface via the exact-URL tier until it has real content. Not spec'd explicitly;
  logged as a correctness fix discovered during implementation, mirroring this file's own
  precedent for surfacing found-and-fixed issues rather than silently patching them.
- **`insertSourceDuplicateSuggestionIfNew`'s pre-check status list is `["pending", "dismissed"]`**,
  not `subject-duplicate`'s `["pending", "rejected"]` — this table's vocabulary
  (`pending|acknowledged|dismissed`) has no `accepted`/`stale` equivalent, since resolving a
  suggestion here never merges or deletes a source and therefore never invalidates a sibling
  suggestion the way `mergeSubjects`/`deleteSubject` do for subjects. `dismissed` is the human-said-
  no analogue a rescan must never resurrect.
- **`similarity` is `z.number().nullable()`** in `packages/shared/src/source-duplicate.ts`, not a
  plain `z.number()` like `subjectDuplicateSuggestionSchema` — SCENARIO 10 requires `null` for a
  `url_match` row (no embedding computed) and a real float for `embedding_similarity`. A blind
  copy of the subject schema would have broken this at the type level.
- **`findDuplicatePairs`, `cosineSimilarity`, and `selectSubjectsForScan` imported unmodified from
  `@post-anki/core`'s existing `subject-duplicate` module**, per the task's explicit instruction —
  confirmed both by `grep` (no source-scoped reimplementation exists) and by the embedding-tier
  integration test passing against real cosine-similarity math. Only `hashSourceContent`/
  `buildSourceContentText` (`packages/core/src/source-duplicate/content-hash.ts`) are new,
  source-scoped versions — title+fetchedText is meaningfully different content than a subject's
  name+description, per spec.md's own instruction not to edit the subject-duplicate file.
- **`MAX_SOURCE_CONTENT_CHARS = 4000`**, vs. subject-duplicate's `MAX_DESCRIPTION_CHARS = 2000` —
  a source's `fetchedText` can run up to `source-fetch.ts`'s own 20,000-char cap, meaningfully more
  than a subject's name+description, so a larger (but still bounded) truncation window is used
  before hashing/embedding. Untuned starting value, same posture as the subject module's own
  constant — logged, not validated against real source content.
- **`EMBEDDING_CAP = 200`**, same default as `subject-duplicate`'s own cap — no separate volume
  signal exists yet for sources to justify a different number.
- **Router wiring left unrouted, for the user, per the task's explicit hard rule.** Five handlers
  need wiring: `handleListLibrarySources` (`GET /sources`, `content-library.controller.ts`),
  `handleRefetchSource` (`POST /sources/:id/refetch`, same file), `handleTriggerSourceDuplicateScan`
  (`POST /source-duplicate-scans`, `source-duplicate.controller.ts`),
  `handleListSourceDuplicateSuggestions` (`GET /source-duplicate-suggestions?status=`, same file),
  `handleResolveSourceDuplicateSuggestion` (`PATCH /source-duplicate-suggestions/:id`, same file).
  Note: `POST /source-duplicate-scans` is not listed in `.planning/content-library/todo.md`'s own
  router-wiring item (item 8), which only names 4 routes — added because SCENARIO 4 ("Ilya triggers
  'scan for duplicates'") has no other entry point, mirroring `subject-duplicate`'s identical
  `POST /subject-duplicate-scans` route. Flagged as an addition to the todo's own enumeration, not
  a deviation from intent.
- **Barrels**: two lines appended to each of `packages/core/src/index.ts` and
  `packages/shared/src/index.ts` (one for `content-library`, one for `source-duplicate` — this
  agent owns both folders), at the true end, re-read immediately before each edit. Confirmed via
  the milestone batch's own log entry above that both landed non-conflicting with a concurrent
  sibling agent's barrel line.
- Test counts this batch: `packages/core` +24 (11 new files: `content-library/fetch-state.ts`
  +test, `source-duplicate/normalize-url.ts` +test, `source-duplicate/content-hash.ts` +test) —
  observed baseline at run time was 649/649 (this file's own prior entries show the "587" figure
  in the task brief had already drifted well past that from concurrent sibling-agent work before
  this batch started; reporting the number actually observed, not re-asserting the stale baseline).
  `apps/api` unit suite (fast, DB-free `vitest run`) unchanged by this batch — no unit-test file
  added, since repos/controllers/orchestrator are integration-tested/type-checked only, per the
  no-unit-tests-on-repos rule; observed running total 362/362 at the end (concurrent sibling work,
  not this batch). New DB-backed coverage: `content-library/content-library.repo.integration.test.ts`
  (7/7) and `source-duplicate/source-duplicate.orchestrator.integration.test.ts` (7/7), both run via
  `npx vitest run --config vitest.integration.config.ts <path>` from `apps/api` against the local
  `postanki_e2e` Postgres instance on `localhost:5436` — not counted in either baseline, per this
  repo's existing convention. Root `npm run typecheck` clean across every workspace at the end of
  this batch.

## Module 7 (study-material-generation): 7.1 lecture grounding-order/refusal fix + 7.2 worked
  examples & analogies (full implementation this round — schema already landed by an earlier
  batch's `studyMaterials` table)

- **7.1 fix, S1 (grounding order)**: `gatherLectureSources` now calls
  `getCurriculumGroundingText(curriculumCtx.curriculumId)` (`apps/api/src/lecture/
  lecture.orchestrator.ts:67`) and gates it through the shared `hasUsableGroundingText`
  (`lecture.orchestrator.ts:70`) BEFORE `gatherLectureSourceGrounding` (web search) is ever called
  (`lecture.orchestrator.ts:80`) — confirmed by `lecture.orchestrator.test.ts`'s "checks the
  curriculum's own stored sources before running web search" test, which asserts the two repo
  calls' real invocation order via a shared `callOrder` array. Web search still always runs
  afterward regardless of the curriculum-grounding outcome (never skipped) — matches spec's "this
  fix only reorders preference, it never removes the web-search path." The curriculum's own citable
  urls are turned into deterministic candidates (`lecture-rules.ts`'s new
  `buildCurriculumSourceCandidates`) and merged ahead of the LLM-extracted web candidates
  (`mergeCandidatesPreferringCurriculum`, dedup by url, curriculum wins) — so a web-discovered
  candidate can never silently replace a curriculum one, verified by a dedicated test. Curriculum
  citable urls are filtered through `isSafeSourceUrl` (`lecture.orchestrator.ts:81`, the same
  SSRF-allowlist gate `tech-research-grounding.ts`'s `isSafeCitationUrl` already applies to
  web-discovered urls) before being offered as fetch-target candidates, since they were scraped out
  of arbitrary previously-fetched text.
- **7.1 fix, S2 (refuse, don't fabricate)**: `compileLecture` now checks
  `hasUsableGroundingText(combinedSourceText)` (`lecture.orchestrator.ts:134`) across every approved
  source's combined fetched text BEFORE calling the compiler agent; on failure it logs
  `lecture_compile_no_usable_grounding` and sets `status: "failed"`, returning without ever invoking
  `agent.generate` — confirmed by `lecture.orchestrator.test.ts`'s "refuses instead of fabricating
  when every approved source has zero usable grounding text" test, which asserts
  `expect(generate).not.toHaveBeenCalled()`. The old `"(no approved sources with usable text —
  produce your best-effort synthesis)"` prompt branch is deleted outright, and the matching sentence
  in `lecture-compiler.agent.ts`'s own instructions ("still produce your best-effort synthesis... 
  rather than refusing outright") was removed too, since it now contradicts a gate the agent will
  never actually see bypassed.
- **7.1 known deviation, logged not silently claimed**: the spec's file table names
  `lecture.repo.ts` (`setLectureStatus` reason) as part of S2. `schema.ts` is explicitly off-limits
  and out of scope for this round, and the `lectures` table has no `failureReason` column to write
  one into — so `setLectureStatus`'s signature is unchanged (status only). The "stated reason
  distinguishing this case from a genuine LLM/timeout failure" is instead carried by two distinct
  log keys, `lecture_compile_no_usable_grounding` (refusal) vs. the catch block's existing
  `lecture_compile_failed` (genuine error) — a real, greppable distinction, just not a persisted
  column. A future batch that owns schema.ts could add the column and thread a real reason string
  through; not done here.
- **7.2 grounding hierarchy is a cascading accumulate-then-gate, not a strict first-tier-wins
  short-circuit**: `gatherStudyMaterialGrounding` (`study-material.orchestrator.ts`) tries curriculum
  stored sources, then (only if still thin) appends topic/gap accumulated text
  (`gatherAccumulatedTopicText` — `topics.summary` + open gap labels for that topic), then (only if
  still thin) appends web search text, checking `hasUsableGroundingText` against the running combined
  total after each tier and stopping as soon as it passes. This reconciles two spec sentences that
  read as being in tension: S4's "curriculum → accumulated → web" as an ordered hierarchy (so a
  usable curriculum tier alone skips accumulated/web entirely — cost-aware, never calls the LLM/web
  search pointlessly) and S7's explicit "checked against the FINAL combined grounding text... not
  against any single tier in isolation — a thin combination across all three tiers still counts as
  usable if it clears the threshold in aggregate" (so two individually-thin tiers combining to clear
  the bar is a real, intended path, not a bug). Verified by two dedicated tests: a thin-curriculum
  + thin-accumulated combination proceeding without ever calling `webSearch`, and all-three-thin
  refusing with `agent.generate` never called.
- **7.2 web tier reuses `probe-grounding.ts`'s generic `webSearch` primitive directly**, not
  `tech-research-grounding.ts`'s `gatherLectureSourceGrounding` — the latter's instruction is
  purpose-built for "find sources worth citing later" (lecture candidate discovery), while
  `webSearch` is the bare OpenRouter `web_search`-tool HTTP call already documented as shared
  infrastructure ("Shared by `webGround`... and the stats module's recommendation generator").
  `study-material.orchestrator.ts`'s own `gatherWebStudyMaterialGrounding` supplies a
  study-material-specific instruction on top of it — one HTTP-call implementation, not a second
  parallel one.
- **`hasUsableGroundingText`/`capGroundingText` are the one shared gate/cap**, added to
  `packages/core/src/study-material/grounding-gate.ts` (`MIN_GROUNDING_CHARS = 200`, matching
  `probe-grounding.ts`'s existing `MIN_SOURCE_CHARS`; `MAX_GROUNDING_CHARS = 8_000`, matching its
  `MAX_CHARS`) and used by both the lecture fix and the new study-material path — no threshold or
  cap logic duplicated inline anywhere. `capGroundingText` is new this round (not in the original
  spec's Derivers table) — added after review because `getCurriculumGroundingText` joins every
  source row's `fetchedText` with no bound of its own, and pasting that raw into an LLM prompt (both
  the lecture source-selector prompt and the study-material writer prompt) would have been an
  unbounded-cost regression; spec.md's own phase table already calls out "capped grounding text" for
  phase 2, this just names the mechanism.
- **`study_materials.citations` is read back as `[]`, never `null`**, even though the DB column is
  nullable jsonb — `study-material.repo.ts`'s `rowToStudyMaterial` coalesces with `?? []`, and
  `studyMaterialSchema.citations` in `packages/shared/src/study-material.ts` is a plain
  `z.array(...)`, not `.nullable()`. Gives the future web panel (S10, out of this round's scope) one
  shape to check (`citations.length > 0`) instead of two.
- **Self-correction, caught on advisor review before landing**: the first cut of
  `gatherStudyMaterialGrounding` only fetched `getCurriculumCitableUrls` when the curriculum tier's
  text ALONE cleared `hasUsableGroundingText` — so the "thin curriculum + thin accumulated combine
  to pass" path (the exact case the cascade exists to handle) silently dropped real curriculum
  provenance and returned `citations: []` even though real curriculum source urls existed and
  contributed to the grounding. Fixed to fetch citable urls whenever the curriculum tier
  contributed any non-empty text, not only when it alone was already sufficient. Covered by
  updating the existing "thin curriculum plus thin accumulated" test to assert the curriculum
  citation survives end to end into `setStudyMaterialReady`'s call.
- **Citations the writer agent returns are filtered against the grounding step's own actual
  citation list** (`study-material.orchestrator.ts`, `validCitations = result.object.citations.filter
  (c => grounding.citations.includes(c.url))`) — mirrors `selectValidCandidates`'s existing
  anti-hallucination pattern in `lecture-rules.ts` rather than trusting the LLM's citations field
  outright.
- **Generation stays fire-and-forget from the controller, same shape as lectures**:
  `study-material.controller.ts`'s `handleRequestStudyMaterial` inserts a `"generating"` row via
  `insertGeneratingStudyMaterial`, responds `202` immediately, then calls `void
  generateStudyMaterial(...).catch(...)` — the only caller of `generateStudyMaterial` in the whole
  tree (confirmed by grep). Nothing under `apps/api/src/push/` or `apps/api/src/liveness/` exists in
  this codebase that references either `compileLecture`, `gatherLectureSources`, or
  `generateStudyMaterial` — S8 holds for both the pre-existing lecture path and the new
  study-material path, verified by grep rather than merely asserted.
- **Router wiring left for the user, as instructed**: `POST /topics/:id/study-materials` →
  `handleRequestStudyMaterial` (`apps/api/src/study-material/study-material.controller.ts`,
  reads `{kind}` via `requestStudyMaterialInput`, 404 if topic missing, 400 on bad kind) and
  `GET /topics/:id/study-materials` → `handleListStudyMaterials` (same file, 404 if topic missing,
  otherwise the full newest-first list). Both follow the exact `lecture.controller.ts` shape
  (`handleGatherLectureSources`/`handleGetLecture`) for consistency. `AGENT_KEYS.studyMaterialWriter`
  registered in `mastra.ts` alongside every other agent; no new `RouteName` conflicts.
- **Web (S9/S10) not built this round** — spec's Phase 4 is explicitly gated on Phase 3 (pull-only
  verification), and `apps/web/**` is out of this agent's scope per the task's hard rules regardless.
  `StudyMaterialPanel`/`lecture.$topicId.tsx` mounting is unmet follow-up for whichever agent next
  owns the web app.
- Test counts this batch: `apps/api` unit suite (fast, DB-free `vitest run`) 341 → 362 (+21: 7 new
  in `lecture-rules.test.ts` for the two new pure candidate-merge helpers, 7 new
  `lecture.orchestrator.test.ts` covering S1/S2 end-to-end with `@post-anki/core` left unmocked so
  the real gate runs, 7 new `study-material.orchestrator.test.ts` covering S4/S5/S7). Every
  pre-existing lecture test (the original 13 in `lecture-rules.test.ts`, now 20 after this batch's
  7 additions) still passes unmodified. Also confirmed via repo-wide grep: no `.integration.test.ts`
  file anywhere under `apps/api/src` references `compileLecture`/`gatherLectureSources`/`lecture`,
  and no file under the root `e2e/` directory references `lecture` either — so "every pre-existing
  lecture test" has zero coverage outside the fast unit suite already re-run above, and no test
  anywhere in the codebase (only this task's own planning docs) still asserts on the removed
  `"produce your best-effort synthesis"` fallback text.
  `packages/core` 636 (live-measured baseline at the start of this batch, not the task brief's
  stated 587 — matches this file's own repeated observation that concurrent sibling agents' work
  has already moved the number) → 649 (+13: 8 for `grounding-gate.test.ts`, 5 for
  `study-material-prompt.test.ts`). Root `npm run typecheck` clean across every workspace both
  before and after this batch. No migration generated or run — the `studyMaterials` table already
  existed from the earlier schema-only batch; no schema file touched this round.
- Barrels: appended exactly one line each to `packages/core/src/index.ts`
  (`export * from "./study-material/index";`) and `packages/shared/src/index.ts`
  (`export * from "./study-material";`), re-reading both files immediately before editing per this
  run's barrel-collision protocol — a sibling agent's own `milestone` line landed after mine in both
  files with no conflict.

## Router wiring for analytics (module 4), study-sessions (module 3), content-library +
  source-duplicate (module 5), milestones (module 6), study-material (module 7) — 19 new routes,
  pure wiring, no handler logic touched

- All 19 handlers were already built and tested by earlier batches tonight; this batch only adds
  `RouteName` union members, route-table entries, and `server.ts` `case` dispatches. Verified
  mechanically (not just by the test suite) that every one of the 19 new names appears exactly once
  in the `RouteName` union, the route table, and a `server.ts` case — `router.test.ts`'s dispatch
  coverage alone can't prove this, since the `route()` switch has no `default` arm: a name present
  in the table but missing its `case` would resolve successfully and then silently hang the response
  with no test failure.
- **Route ordering, the one load-bearing case**: `GET /study-sessions/consistency` (string pattern)
  is listed before `GET /study-sessions/:id` (`/^\/study-sessions\/([^/]+)$/`) in `router-table.ts`
  — otherwise the regex would swallow "consistency" as an id. Confirmed by a dedicated test
  (`router.test.ts`, "distinguishes the consistency sub-resource from the session detail route
  (specific before generic)") asserting both resolve correctly in that order. Every other new
  `:id/subresource` route (`/push`, `/start`, `/end`, `/answers`, `/refetch`,
  `/study-materials`) is `$`-anchored with an extra path segment, so `[^/]+` can't span it — no
  real collision, ordering there is cosmetic. `GET /sources`, `POST /sources/:id/refetch`, and the
  pre-existing `DELETE /sources/:id` coexist without any ordering concern at all: `resolveRoute`
  filters by method first, and all three are different methods. Confirmed by a dedicated test
  asserting all three resolve correctly side by side.
- **Route names chosen to match REST-plural-noun convention**, reviewed against every suggested
  path in the handoff notes — none needed renaming. `GET /milestones` is named `listMilestones` in
  the route table even though its handler is `handleGetMilestones` (the handoff notes' own
  suggestion, since the handler's "get" naming reflects its side effect of evaluating/awarding
  milestones as a read, not the REST verb the route itself expresses for a collection GET).
  `/sources/:id/refetch`, `/study-sessions/:id/start`, `/study-sessions/:id/end`,
  `/study-sessions/:id/answers`, `/study-sessions/:id/push` are verb-in-path but match this
  codebase's own established convention for non-CRUD actions (`/curricula/:id/reparse`,
  `/curricula/:id/confirm`, `/topics/:id/probe`, `/learning-paths/:id/steps/:id/push`) — not a
  violation, a precedent-following default.
- **`router.ts` split into `router.ts` (types + `resolveRoute`) and a new sibling file,
  `router-table.ts` (the `RouteDef` interface + the full `ROUTES` array)**, since the file was
  already at 484 lines before this batch (a pre-existing violation of the 300-line guideline
  inherited, not created, by this batch — earlier router-wiring batches added routes without ever
  extracting) and would have reached ~570 with these 19 additions on top. `router.ts` is now 171
  lines. `router-table.ts` is 403 lines — still over the 300-line guideline, logged rather than
  silently claimed compliant: it's a single flat, homogeneous data table with no branching logic,
  and splitting it further by domain would mean either duplicating `resolveRoute`'s iteration
  across multiple arrays (behavior-risk for a mechanical task) or introducing a merge step with no
  functional benefit. `RouteName` is imported into `router-table.ts` via `import type`, so the
  resulting router.ts <-> router-table.ts reference is erased at compile time and is not a runtime
  circular import — confirmed by `tsc --noEmit` passing clean.
- **`server.ts`'s dispatch switch was deliberately NOT converted to a dispatch map**, even though
  the task's own instructions named that as a welcome option. The switch has ~160 pre-existing
  `case` arms with no test coverage of the refactor itself; converting them to a signature-unifying
  map is a large, unrelated blast radius for an unattended run whose actual scope is adding 19 new
  cases, not restructuring 140+ working ones. `server.ts` is now 572 lines (up from a pre-existing
  500) — same "inherited, not created" violation as `router.ts` was before its split, logged rather
  than fixed, since fixing it safely was judged out of proportion to this batch's actual task.
- No handler signature was adapted to fit the dispatcher — every controller import and call site
  matches the handler's own existing signature exactly (`handleRefetchSource(res, id)`,
  `handleGetStudySessionPush(res, id, excludeGapIdsParam, modeParam)`, etc.), per the task's
  explicit "adapt the wiring, not the handler" rule.
- Test counts this batch: `apps/api` unit suite (fast, DB-free `vitest run`) 362 -> 370 (+8 new
  `it` blocks in `router.test.ts`, covering all 19 new routes including the two load-bearing
  ordering/coexistence assertions named above). `router.test.ts` itself: 31 -> 39 tests. `packages/
  core` unchanged at 649/649 (no core file touched by this batch). Root `npm run typecheck` clean
  across every workspace (`shared`, `core`, `api`, `web`, `bot`, `mobile`) both before and after
  this batch — no concurrent-agent breakage observed this time. Did not touch `apps/web/**`,
  `schema.ts`, or any handler's own logic; no migration generated or run.

## Web: item 1.4 (learning-paths browse/start/track) and 6.3 (milestones gallery) — web only
  (`apps/web/src/learning-path/`, `apps/web/src/milestone/`, `apps/web/src/routes/learning-paths*`,
  `apps/web/src/routes/milestones.tsx`, `apps/web/src/routes/__root.tsx` nav links,
  `apps/web/src/routeTree.gen.ts` regenerated; `apps/api/**` untouched throughout)

- **Step and milestone display names have no dedicated lookup endpoint, so both were resolved from
  data already fetched for another reason.** `learning_path_steps`/`pathStepProgressSchema` carry
  only `domainNodeId`, no name, and there is no `GET /domain-nodes/:id`. Since v1 role templates are
  the closed universe every possible step can ever come from (Web Development only, per
  `role-paths.yaml`), the detail route fetches `GET /role-templates` alongside the path and builds a
  `domainNodeId → name` map from the union of every template's targets
  (`apps/web/src/learning-path/step-name-map.ts:3`). A node absent from that map (a future taxonomy
  rename outpacing the template) degrades to "Untitled step" — logged, never a crash. Milestones
  don't need this: `milestoneSchema.entityLabel` is already resolved server-side.
- **Every step is directly clickable via an expand/collapse toggle that fetches its own push
  question on demand — never gated on being "next."** The backend's
  `GET /learning-paths/:id/steps/:stepId/push` already accepts an arbitrary `stepDomainNodeId`, not
  just the current one, which is the concrete signal the intended UX is "click any step to study it,"
  not "only the highlighted one is interactive." `LearningPathDetail`
  (`apps/web/src/learning-path/learning-path-detail.tsx:36`) auto-expands and eagerly loads only the
  recommended next step on load (mirrors S13's "single pathProgress read" language for the default
  view); any other step lazily fetches on click. No `disabled` attribute, no lock icon, exists
  anywhere in `learning-path-step-row.tsx` — verified by a dedicated test asserting the toggle button
  is never disabled regardless of `isNext`.
- **The prerequisite graph (`domain_node_prerequisites`) is never fetched by the web layer at all** —
  confirmed by grep: no web file references that table or an edges endpoint. The only inputs to step
  ordering/highlighting are the already-linear `steps` array (server-sorted by stored `order`) and
  `nextStepDomainNodeId`. `buildStepViewModels` re-sorts defensively by `order` client-side too, but
  never touches or requests edge data.
- **An empty step's CTA is the real, unmodified `CaptureForm`** from
  `apps/web/src/learning-list/capture-form.tsx`, embedded directly inside the expanded step row
  (`learning-path-step-row.tsx`'s `EmptyStepCta`) rather than a link out to `/learning-list` — this
  is what "reuses the existing capture form; no new capture surface is built" means literally, per
  spec.md's own files-by-scenario table naming `capture-form.tsx` for S3. `CaptureForm` has no
  domain-node-targeting prop today (it hardcodes `subSubjectNodeId: null`), so a capture made from an
  empty step is not scoped to that exact Area — it lands in the learner's general capture flow like
  any other capture. Not fixed here: adding node-scoping to `CaptureForm` would touch a file another
  concurrent agent owns tonight (`learning-list/`) and is out of this task's stated files-to-create
  list.
- **No path-level aggregate percent is shown anywhere**, because `pathProgress`'s own output
  (`{overallStatus, steps}`) has no such field — per an earlier batch's own logged decision, there is
  deliberately no second cross-step aggregate. The detail header shows only `path.status`
  (draft/active/completed/abandoned) and each step's own real percent; nothing is invented to fill
  the gap.
- **Milestones: `GET /milestones` is not fully routed yet as of this batch** — confirmed by reading
  `apps/api/src/router.ts` directly: `"listMilestones"` exists in the `RouteName` union (line ~130)
  and `apps/api/src/server.ts` has a `case "listMilestones": return handleGetMilestones(res)` (line
  543), but the `ROUTES` array itself has no `{ pattern: "/milestones", ... }` entry, so
  `resolveRoute` can never actually produce that name and the endpoint 404s today. This is
  in-progress work by a concurrent agent (mid-batch, not mine to finish per the explicit
  do-not-touch-`apps/api/**` rule). The web module was built entirely against
  `packages/shared/src/milestone.ts`'s `milestoneSchema` and will work unmodified the moment that one
  `ROUTES` entry lands — `apps/web/src/milestone/milestone.api-client.ts:34`'s `listMilestones()`
  already degrades to an empty gallery (never a crash) on any non-2xx response, so the route's
  current 404 renders as the neutral empty state, not an error page.
- **Milestones gallery renders `entityLabel ?? 'Unnamed'` and nothing else derived from live
  data** — no percent, no "next milestone," no unearned-criteria count, matching S8/S6's explicit
  compliance boundary. Verified by a dedicated test asserting the rendered card text never matches
  `/%|percent|next milestone|more to go|at risk/i`.
- **`routeTree.gen.ts` was regenerated via a standalone script invoking
  `@tanstack/router-generator`'s `Generator` class directly** (not `vite dev`/`vite build`, which
  would be slower and side-effect-heavy for this one file) — confirmed safe by diffing before/after:
  regeneration produced a real bugfix as a side effect. The route file for `/learning-list`
  (`apps/web/src/routes/learning-list.tsx`, added uncommitted by a concurrent agent earlier tonight)
  was never in the generated tree — meaning `<Link to="/learning-list">` in `__root.tsx` was
  type-unsound and the route was unreachable through the generated tree at all. Regenerating fixed
  that as a byproduct of adding the two new modules' routes; not a regression introduced by this
  batch. `apps/web/scratch-gen-routes.mjs` was written to `apps/web/` and deleted immediately after
  each use — never committed.
- Test counts this batch: `apps/web` 200 → 252 (52 new, 13 new test files: 6 pure-deriver files for
  learning-path — `step-name-map`, `step-view-model`, `path-status-label`, `role-template-preview`,
  `map-push-question`, plus component tests for `learning-path-step-row`, `role-template-browser`,
  `learning-path-list`, `abandon-path-control`, `learning-path-detail` — and 3 for milestone —
  `milestone-criteria-label`, `sort-milestones`, `milestones-gallery`). `apps/api` observed at
  370/370 (baseline 362, +8 from concurrent sibling-agent work, none of it touched by this batch).
  `packages/core` unchanged at 649/649 (exact baseline match, no core file touched). Root
  `npm run typecheck`, `npm run depcruise` (746 modules/2564 deps, zero violations),
  `node scripts/check-web-node-builtins.mjs` (also a real production build, zero Node builtins
  reached the browser bundle), and `node scripts/check-no-dynamic-imports.mjs` all clean at the end
  of this batch.
- Confirmed explicitly, per the task's definition of done: no step is ever rendered with a
  `disabled` toggle or lock affordance (test-verified); `domain_node_prerequisites`/any prerequisite
  graph is never fetched or rendered by any web file (grep-verified); the milestones gallery renders
  no progress-toward-next, no counter of unearned milestones, and no at-risk state anywhere
  (test-verified).

## Batch: 2.4 (notes/highlights web) + 7.3 (study-material web)

- **Scope confinement over spec.md's file list.** spec.md's "Files to modify" for 2.4 lists
  embedding `note-capture-box.tsx` into `apps/web/src/curriculum/topic-row.tsx`,
  `weak-strong-list.tsx`, `source-rows-editor.tsx`, `probe-room-drawer.tsx`, plus a nav link in
  `routes/__root.tsx`. The task's own hard-rule confinement (note/, study-material/, new routes,
  and "the study-room route you must modify") overrides that list — a concurrent second web agent
  was actively editing `__root.tsx`, `today.tsx`, and `probe.$topicId.tsx` (all dirty in git status
  at start) tonight. `NoteCaptureBox` was built fully reusable and tested (parameterized by
  `nodeType`/`nodeId`, works for all three node types) but is only mounted on
  `routes/lecture.$topicId.tsx` (`nodeType: "topic"`) — the one route this task explicitly
  authorized. Embedding into the gap listing, source editor, and probe room, plus a `/notes` nav
  link, is a logged follow-up, not done here. Confirmed via `git status` and `git log` that none of
  the four curriculum files or `__root.tsx` were touched by this batch.
- **`GET /notes/review` performs a write** (`markNoteSurfaced` on every call) — confirmed by reading
  `note-review.service.ts`. `NotesReviewPanel` therefore never calls it from a `useEffect`/on-mount
  path; the only call sites are the "Show me a note" and "Read another" button `onClick` handlers.
  Verified by `notes-browser.test.tsx`'s "should never fetch search results or review notes merely
  from landing on the page" and "should still not fetch a review note just from clicking into the
  review tab" (clicking the Review tab renders the inert `notes-review-start` button, nothing more)
  plus `notes-review-panel.test.tsx`'s "should never call onReview merely from rendering".
- **Review's `excludeIds` anti-repeat list is `useState`-local to `NotesReviewPanel`, never
  persisted** (no localStorage, no server-side session) — it exists only so "Read another" within
  one sitting doesn't immediately repeat the same note, and is proven to reset on remount in
  `notes-review-panel.test.tsx`'s "without persisting past unmount" case. `NotesBrowser` unmounts
  (not just hides) `NotesReviewPanel` when the Search tab is active, so switching tabs and back also
  clears it. No count, badge, or "N notes left" string exists anywhere in the review surface —
  asserted directly by a regex test scanning the rendered container's `textContent`.
- **Taxonomy filter (S6) reuses `getBoard()` (subjects) and `getDomainMapForSubject()`
  (per-subject domain tree)** rather than adding a new "list all domain nodes" backend endpoint —
  both already exist and are read-only reused from `curriculum.api.ts`/`domain-map.api.ts`. A new
  pure `flattenDomainTree`/`indentedLabel` pair in `apps/web/src/note/note-taxonomy-options.ts`
  turns the selected subject's tree into an indented flat option list for the filter `<select>`.
- **Notes browser follows the `learning-list`/`learning-path` convention** (loader + `useState` +
  callback props passed down from the route, no react-query) since those are this task's named
  closest models; `StudyMaterialPanel` follows `LecturePanel`'s convention (`useQuery`/`useMutation`
  via `@tanstack/react-query`) instead, since it is explicitly mounted as `LecturePanel`'s sibling
  in the same route and should behave identically (same polling-while-generating pattern via
  `refetchInterval`).
- **Study-material refusal is read off row state, not the transport result.**
  `handleRequestStudyMaterial` always returns `202` with a `"generating"` row; the eventual refusal
  lands later as `status: "failed"` + `failureReason`, visible only via the `GET` history list.
  `StudyMaterialItem` renders `material.failureReason` verbatim for a failed row — confirmed by
  `study-material-panel.test.tsx`'s "should show the honest refusal reason for a failed request
  rather than hiding it". The discriminated `ApiResult` client/`.model.ts` pattern was still built
  for genuine transport/validation failures (topic not found, network error), matching the
  learning-list convention the task named.
- **Citations render only when `citations.length > 0`**, matching `LectureReady`'s existing
  `lecture-panel.tsx` markup pattern exactly (same `<div className="border-t ...">` / `<ul>` shape)
  rather than a second citation component — confirmed the repo layer (`study-material.repo.ts`)
  always coalesces the nullable jsonb column to `[]`, never `null`, so the frontend check is a
  simple length guard.
- Files: `apps/web/src/note/{note.model,note.api-client,note.api,note-capture-box,
  note-capture-error,note-taxonomy-options,note-search-params,notes-search-form,
  notes-search-results,notes-review-panel,notes-browser}.ts(x)`,
  `apps/web/src/routes/notes.tsx`; `apps/web/src/study-material/{study-material.model,
  study-material.api-client,study-material.api,study-material-status,study-material-item,
  study-material-history,study-material-panel}.ts(x)`; modified
  `apps/web/src/routes/lecture.$topicId.tsx` only (mounts `NoteCaptureBox` + `StudyMaterialPanel`
  beside `LecturePanel`).
- Test counts this batch: `apps/web` +40 tests across 8 new test files (7 pure/component pairs for
  notes: `note-capture-error`, `note-taxonomy-options`, `note-search-params`, `note-capture-box`,
  `notes-review-panel`, `notes-browser`; 2 for study-material: `study-material-status`,
  `study-material-panel`). Full `apps/web` suite observed at 367 total (364 passing), the 3 failures
  confined to `study-session/schedule-form.test.tsx` and `session-timer-banner.test.tsx`
  (pre-existing/concurrent-agent-owned — `toBeDisabled` matcher missing — never touched by this
  batch). Root `npm run depcruise` (831 modules/2853 deps, zero violations),
  `node scripts/check-web-node-builtins.mjs` (real production build, zero Node built-ins reached the
  browser bundle), and `node scripts/check-no-dynamic-imports.mjs` clean. Root `npm run typecheck`
  has 5 pre-existing errors, all in files this batch never touched (`routes/__root.tsx`,
  `routes/analytics.tsx` — a concurrent agent's in-flight new route — and the same two
  `study-session` test files); every file this batch created or modified typechecks clean in
  isolation (`npm run typecheck -w @post-anki/web` shows zero errors attributable to `note/`,
  `study-material/`, or `lecture.$topicId.tsx`).
- Confirmed explicitly, per the task's definition of done: the notes review surface has no
  counter/badge/backlog state anywhere (test-verified via textContent regex), is never fetched on
  mount or on tab-switch (test-verified, both at the panel and the composed-browser level), and is
  reachable only from `/notes` — never wired into `/today` (`routes/today.tsx`), any nudge
  (`learning-list/nudge-panel.tsx` untouched), or the push module (`apps/api/src/push/*`
  grep-confirmed to carry zero `notes` references, matching S10 unchanged). Study material
  generation (`POST /topics/:id/study-materials`) is only ever called from the two request buttons'
  `onClick` handlers — `study-material-panel.test.tsx`'s "should fetch history on mount but never
  trigger generation without a click" asserts `requestStudyMaterial` is never called merely from
  mounting the panel, only `listStudyMaterials` (the history `GET`) is.

## Batch: 3.4, 4.4, 5.3 (study scheduling / analytics / content library web)

All three backends (`study-session/`, `analytics/`, `content-library/` + `source-duplicate/` under
`apps/api/`, `packages/core`, `packages/shared`) were already built, routed, and tested going into
this batch — this batch is web-only, `apps/api/**` untouched.

- **`ProbeAnswer` gained two optional, backward-compatible props**: `onAnswered?: (result:
  AttemptResult) => void` (fires after `setResult`, alongside the existing `autoInvalidate`
  branch) and `hideNextControl?: boolean` (suppresses its own "Probe the next gap"
  button/`noMore` text). Needed because a study session's "next question" must re-run the full
  `scopeSessionCandidates` → `selectDailyPush` pipeline (cross-topic), not `ProbeAnswer`'s
  built-in same-topic `nextQuestion` call — so `session-question-surface.tsx` owns advancement
  instead. Both props default to inert values; the three existing callers
  (`probe.$topicId.tsx`, `today.tsx`, `learning-path-step-row.tsx`) are unmodified and untested
  behavior is unaffected — confirmed by the full `apps/web` suite staying green.
- **Session run loop's nudge reuses the existing `/daily-push` response's `nudge` field**, the
  same one `today.tsx` already renders via `NudgePanel`/`respondToNudge` — `getSessionPush`'s own
  response (`{push, question}`) never carries a nudge, and the spec's "same `NudgePanel`, same
  `liveness/` read" is satisfied without touching `apps/api`. `study-sessions.$sessionId.tsx`'s
  loader calls `getDailyPush` only when the session is `in_progress`, purely for its `.nudge`.
- **Study session target picker (`schedule-form.tsx`) offers "Anything" / "A curriculum" / "A
  learning path" only** — no dedicated domain-node browsing UI in v1. `targetType: "domain_node"`
  is still fully reachable through the API (untouched), just not from this picker; curriculum
  targeting already covers Web Development, the only domain with real depth today. Mirrors the
  backend's own "gracefully unavailable, not blocking" posture already established for
  `learning_path` targeting before that module shipped.
- **A missed planned session is filtered out of every schedule-list group, full stop** —
  `groupScheduleSessions` drops any `missed: true` row before it reaches Upcoming, Active, or
  History; there is no fourth "missed" group, no count, no banner anywhere in `schedule-list.tsx`.
  Verified by a text-content regex test asserting `/missed/i` never appears.
  `study-session/schedule-form.tsx`'s copy states "Nothing here nags" directly.
  `study-session/session-timer-banner.tsx`'s "time's up" notice is a neutral inline label with an
  always-enabled "End now" — never a forced navigation — satisfying S5's "a question in progress
  is allowed to finish."
- **Coverage heat map colors by a 6-band sequential scale computed by a pure `coverageBand`
  deriver** (`gap` status → its own `"no-data"` band, never on the progress ramp at all;
  `progress` status bands by percent in 20-point steps) — loaded the `dataviz` skill first per
  the task's instruction. Kept dependency-free (CSS grid via a plain `<table>`, no charting
  library). Dark mode uses `dark:` Tailwind classes with the sequential ramp's lightness order
  *reversed* per band (light surface: light→dark blue as mastery rises; dark surface: dark→light
  blue as mastery rises) so each band still reads as "receding at low percent, popping at high
  percent" against its own surface — this app has no existing dark-mode usage anywhere, so this
  is the first `dark:`-variant component in the codebase (Tailwind v4's default
  `prefers-color-scheme` strategy needs no extra config, confirmed via `styles.css`). `no-data` is
  a distinct neutral gray with a dashed border in both themes, never a step on the blue ramp, so
  a Area with zero mapped curricula never reads as "0% but still measured" the way a light-blue
  `low` cell would — test-verified (`coverage-heat-map.test.tsx`'s "never visually identical"
  case asserts `no-data` and `high` bands are distinct `data-band` values). A legend
  (`coverage-heat-map-legend`) and a plain `mastery-breakdown-table.tsx` (byArea only, byTopic
  omitted from the UI as an in-bound scope cut — still reachable via `GET /analytics/retention`)
  both exist alongside the heat map, satisfying the "identity never on color alone" /
  "table view exists" accessibility rules without adding a charting dependency.
- **Weekly digest panel shows only concerns with `open > 0`** and its own copy states "a
  snapshot, opened only when you look. Nothing here is pushed or emailed" — matches the digest's
  own pull-only backend design; test-verified no "improved"/"since last week" string appears
  anywhere, since `WeeklyDigest` carries no delta field at all.
- **Content library's `library-browser.tsx` offers re-fetch only for `kind === 'link'` sources**
  (matching the backend's `not_refetchable` response for `text`/`video`) and has **no delete or
  merge control anywhere in either `library-browser.tsx` or `duplicate-suggestion-list.tsx`** —
  resolving a suggestion (`onResolve`) only ever sends `{status: 'acknowledged' | 'dismissed'}`,
  never a source id pair or a merge target. Test-verified via a `/merge|delete/i` text-content
  regex on both components — this is the hard rule the spec calls out explicitly
  (`topics.sourceId` provenance depends on the row surviving).
- **Both `url_match` and `embedding_similarity` suggestions render with a distinct badge label**
  ("Same URL" vs "Similar content") and only the latter shows a similarity percent — matches
  `SourceDuplicateMatchKind`'s own "never conflated" contract at the data layer.
- **Routes follow the existing `learning-paths`/`learning-paths.$pathId` two-file split**, not
  spec.md's literal single-file listing — `study-sessions.tsx` (schedule + list + consistency) and
  `study-sessions.$sessionId.tsx` (start prompt / runner / review, dispatched by `session.status`)
  — since the task's own hard rule says to mirror `apps/web/AGENTS.md`'s closest models over the
  plan doc's file list. `analytics.tsx` and `content-library.tsx` are each single-route pages, as
  their specs listed. Nav links for all three (`Study sessions`, `Analytics`, `Library`) added to
  `routes/__root.tsx`; `routeTree.gen.ts` regenerated via `npm run build -w @post-anki/web` (auto
  re-derived by the TanStack Router Vite plugin — not hand-edited).
- **Every `.api-client.ts` in these three modules duplicates the `request`/`requireOk`
  helper-pair and its own local `ApiResult` type**, rather than factoring a shared `lib/`
  utility — this matches the existing repeated pattern in `learning-path.api-client.ts` and
  `learning-list.api-client.ts` (verified before writing), and the task's own hard rule forbids a
  flat `lib/` for business logic.
- Files created: `apps/web/src/study-session/{study-session.model,study-session.api-client,
  study-session.api,schedule-target,session-timer,map-push-question,session-target-label,
  group-schedule-sessions,schedule-form,schedule-list,session-timer-banner,
  session-question-surface,session-runner,session-review,consistency-panel}.ts(x)`;
  `apps/web/src/analytics/{analytics.api-client,analytics.api,coverage-band,coverage-grid,
  coverage-heat-map,digest-format,digest-stat-tile,weekly-digest-panel,mastery-breakdown-table,
  analytics-dashboard}.ts(x)`; `apps/web/src/content-library/{content-library.model,
  content-library.api-client,content-library.api,fetch-state-label,fetch-state-badge,
  source-lookup,library-browser,duplicate-suggestion-list}.ts(x)`; routes
  `study-sessions.tsx`, `study-sessions.$sessionId.tsx`, `analytics.tsx`, `content-library.tsx`.
  Modified: `apps/web/src/curriculum/probe-answer.tsx` (two new optional props, see above),
  `apps/web/src/routes/__root.tsx` (three nav links), `apps/web/src/routeTree.gen.ts`
  (regenerated).
- Test counts this batch: 24 new test files, one per pure/component module across the three
  entity folders (11 in `study-session/`, 8 in `analytics/`, 5 in `content-library/`). Full
  `apps/web` suite: 367 total, 367 passing (from the 367-total/364-passing baseline this batch
  inherited — the 3 pre-existing failures noted in the batch above were this batch's own
  `toBeDisabled` matcher typo in two of its own in-flight test files, both fixed to the
  `.disabled` property-access convention `capture-form.test.tsx`/`priority-review-panel.test.tsx`
  already use). Root `npm run typecheck` clean across every workspace. Root `npm run depcruise`
  clean (850 modules/2928 deps, zero violations). `node scripts/check-web-node-builtins.mjs`
  clean (real production build, zero Node built-ins reached the browser bundle).
  `node scripts/check-no-dynamic-imports.mjs` clean.
- Confirmed explicitly, per the task's definition of done: no missed-session counter or catch-up
  queue exists anywhere in `study-session/*` (test-verified, see above); the content-library UI
  offers no merge or delete of a source anywhere in `content-library/*` (test-verified, see
  above); the coverage heat map follows the `dataviz` skill (form chosen deliberately — CSS
  table, not a charting library; sequential-by-lightness color computed by a pure, tested
  deriver; legend + table view present; dark mode via validated `dark:` variants reversing the
  ramp order per surface) and renders correctly in both light and dark themes (verified by reading
  the rendered Tailwind classes — this repo has no visual/screenshot test harness to render
  against, so verification here is source-level: every `BAND_CLASSES` entry pairs a light value
  with an explicit `dark:` override, and `styles.css`'s bare `@import "tailwindcss"` confirms
  Tailwind v4's default `prefers-color-scheme` dark strategy is active with no override needed).

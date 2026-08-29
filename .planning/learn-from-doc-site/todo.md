---
type: todo
branch: main
task: learn-from-doc-site
state: needs-changes
updated: 2026-08-21
---

# Todo: Learn from a documentation site

## Decisions to make

Nothing blocking. Two forks (question-generation timing, go-deeper visibility) were resolved via
the recommended-default rule after AskUserQuestion was denied — logged in `spec.md` §"Decisions
made autonomously". Implementation can start.

## To review / clarify (not blockers, flagged for awareness)

- Single-question calibration can elect deepest depth off one lucky guess.
- `docker-compose.yml`'s `wal_level=logical` change unexplained by any plan file.
- Archetype-rotation test's 3 other failures (AC22/AC25/AC32) not yet investigated.

## Coding tasks

- Fix `topics.sourceId` never written for docs-site topics (schema + llms.txt gap).
- Build missing S4 FE link from calibration-blocked screen to the quiz.
- Fix go-deeper re-fetch failures being silently swallowed, never shown.
- Fix depth-election race: gate opens before elected depths are written.
- Fix `archetype-rotation.integration.test.ts` broken by new calibration gate.

## Manual steps / sequencing constraints

- Task 1 lands first — tasks 3-4 consume its output.
- No migration to generate — `topics.depth`/`depthElectedAt` already exist in schema.
- Extend the existing `mock-docs-site*` verification fixtures for e2e coverage rather than
  inventing a new mock.
- Run `npx tsc --noEmit`, `npx vitest run`, and the relevant e2e scenarios before considering
  this done.

## Post-deploy checks

- Add a real docs-site URL under an existing subject: confirm the crawl finds multiple pages,
  the course lands in that subject (not a new one), and modules/topics aren't over-fragmented.
- Open a topic for the first time: confirm questions generate only then, grounded in that
  topic's source page.
- Take the calibration quiz: confirm Socratic dialogue is blocked until it's done, and that a
  topic answered wrong elects a shallower depth than one answered right.
- Trigger "go deeper" on a topic with headroom: confirm it visibly re-fetches the original
  source page before generating harder content, and requires an explicit user action.

## Resolved

- 2026-08-21 — Re-review found provenance/go-deeper/FE-gap items falsely marked shipped; reopened.
- 2026-08-19 — Reviewed and approved; all 7 coding tasks confirmed shipped (review.md).
- 2026-08-19 — `depthElectedAt` now written on calibration completion, first real writer.
- 2026-08-19 — Lazy question generation landed under new `apps/api/src/topic/`.
- 2026-08-19 — `refetchSource` called directly from topic controller, no adapter needed.
- 2026-08-19 — Initial haiku research audit missed the existing `topics.depth`/`depthElectedAt`/
  `availableDepth`/headroom-offer depth-election system entirely (searched `gap.depth`/
  `gap_archetype_state` instead). Found it during planning via direct schema read — this
  materially changed the plan from "build new adaptive-depth logic" to "wire an existing,
  fully-modeled-but-unwired mechanism."
- 2026-08-19 (implementation) — `topics.sourceId` turned out to have zero writers for the
  doc-crawl/structure-generation path too (only assumed reused per spec.md's S2 acceptance).
  `saveCurriculumPlan` never set it and the structure LLM's output schema had no per-topic source
  attribution field at all. Added `curriculum-plan.ts`'s `sourceUrl` field, a `SOURCE_URL:` marker
  in `source-text.ts`'s assembled prompt text, a prompt instruction to echo it back, and
  URL-to-source-row resolution in `saveCurriculumPlan` — otherwise S3's lazy per-topic grounding
  would have had no `sourceId` to key off for any docs-site-derived topic.
- 2026-08-19 (implementation) — `isCalibrationRequiredForSocratic`, spec.md's second listed
  deriver, had no entry in spec.md's "Files to create"/implementation order (only
  `electDepthFromCalibration` did). Implemented it anyway as a proper Layer-1 deriver with its own
  test (`packages/core/src/topic/is-calibration-required-for-socratic.ts`), per constitution
  principle 3 (derivers are unit-tested, not inlined into a controller).

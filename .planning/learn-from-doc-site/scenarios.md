---
type: scenarios
branch: learn-from-doc-site
task: learn-from-doc-site
state: shipped
updated: 2026-08-19
---

# Scenarios: Learn from a documentation site (URL → calibrated Socratic course)

## Business Scenarios

SCENARIO 1: Adding a docs URL creates a course inside an existing subject

A user pastes `https://turbopuffer.com/docs` into the "New curriculum from source" flow under an existing "Programming" subject, and the app crawls the docs site (not just the one page) to ground curriculum creation.

What to verify:
- [x] The existing doc-crawl path (`gatherDocSiteCandidates`) is used, not a single-page fetch — `apps/api/src/curriculum/source-candidates.ts:57,70` calls it directly; no new/parallel crawl path added.
- [x] The created curriculum is attached to the chosen existing subject, not a new one — `apps/api/src/curriculum/curriculum.controller.ts:88` validates `body.data.subjectId` against `getSubject` before creation; curriculum creation always requires an existing subjectId, confirmed pre-existing, unchanged.
- [~] Crawl is bounded (existing same-site-link cap) — never an unbounded site-wide spider. Cap lives in `gatherDocSiteCandidates`/`doc-link-grounding.ts`, unchanged by this plan; verifying the actual bound requires a live crawl run, not a code-shape check.

SCENARIO 2: The course splits into modules/topics at a bounded granularity

Structure generation produces modules/topics from the crawled docs, without over-fragmenting into one topic per tiny doc page.

What to verify:
- [x] The structure-generation prompt carries an explicit "don't split finer than a coherent concept" instruction — `apps/api/src/curriculum/curriculum-prompt.ts:210-211` (`buildStructureDraftPrompt`'s "Granularity:" block).
- [x] Each topic records which source page(s) it was grounded in (provenance), reusing `topics.sourceId` — this was genuinely unwired before this plan (confirmed by direct read: `saveCurriculumPlan` never set `sourceId`, and `curriculumPlanSchema`/`topicPlanSchema` had no source-attribution field at all). Wired now: `apps/api/src/curriculum/source-text.ts:14-23` embeds each link source's URL as a `SOURCE_URL:` marker in the prompt text; `apps/api/src/curriculum/curriculum-plan.ts:12-18` adds `topicPlanSchema.sourceUrl`; `apps/api/src/curriculum/curriculum-prompt.ts:212-213` instructs the model to echo the marker's URL back per topic; `apps/api/src/curriculum/curriculum.repo.ts:1236-1245,1281` resolves that URL to the matching `sources` row and writes `topics.sourceId` on insert.

SCENARIO 3: Opening a topic for the first time generates its questions lazily

A learner opens a topic for the first time; only then does the app generate that topic's page-grounded questions — not for every page at crawl time.

What to verify:
- [x] No question generation fires until a topic is actually opened (cost control — Decision, see spec.md) — `apps/api/src/topic/generate-page-questions.ts`'s `gatherPageGroundedQuestionContext` is only ever called from `apps/api/src/probe/probe.service.ts:96-98` inside `startProbe`, the topic-open entry point; nothing calls it at crawl/structure-save time.
- [x] Generated questions cite the specific source page(s) the topic came from — `apps/api/src/probe/probe.service.ts:96-99` passes the page grounding's `citations` (the source URL(s)) into `ask.citations`, which `buildQuestion` (`probe.service.ts:259`) surfaces on `ProbeQuestion.sources`.
- [~] Re-opening an already-generated topic does not regenerate — structurally true for the *page fetch*: `resolveCourseGroundingSources` (`apps/api/src/lecture/course-source-grounding.ts:75-79`) only calls `resolveSourceText`/re-fetches when `fetchedText` is still null, so a second open reuses the stored text rather than re-fetching. The question text itself is generated fresh per call by design (every `startProbe`/Socratic turn already asks the LLM anew, unchanged by this plan) — there is no separate "regenerate" path to guard against; noted as a scope clarification rather than a live-run check.

SCENARIO 4: A calibration quiz runs before Socratic dialogue starts

Once the course structure is confirmed, the learner takes a one-time 10-20 question calibration quiz spanning the course's key topics (reusing the existing curriculum-calibration-probe scope), before any Socratic session is offered for this course.

What to verify:
- [x] Socratic session start is gated: blocked until this course's calibration quiz is completed — `apps/api/src/socratic/socratic.service.ts:86-88` calls `isSocraticGatedByCalibration` before creating/resuming a session and returns `{ error: "calibration_required" }`; `apps/api/src/socratic/socratic.controller.ts:12-16` maps it to HTTP 409; `apps/web/src/curriculum/socratic-chat.tsx` renders a dedicated `data-testid="socratic-calibration-required"` state for it.
- [~] Quiz size stays within the existing `MIN_TOTAL`/`TOPIC_QUIZ_CEILING` bounds (10-20) — enforced by pre-existing `planCurriculumQuizDistribution` (`packages/core/src/probe-session/curriculum-plan.ts:12-13,40`), untouched by this plan; confirmed by reading, not re-verified by a new test since no code changed here.
- [~] A course with too few topics to reach `MIN_TOTAL` still runs a smaller quiz rather than blocking forever — same pre-existing function (`curriculum-plan.ts:34-36`, `target = Math.max(n, CURRICULUM_QUIZ_MIN_TOTAL)` still bounded by `n` topics' worth of real questions); confirmed by reading, not a live-run check.

SCENARIO 5: Calibration results elect a starting depth per topic

Each topic's quiz answers set that topic's initial depth via the existing (currently-unwired) `topics.depth`/`depthElectedAt` columns — reusing the depth-election model already used elsewhere, not inventing a second one.

What to verify:
- [x] A topic answered correctly in the quiz elects a deeper starting depth than one answered wrong — `packages/core/src/topic/elect-depth-from-calibration.ts`, unit-tested in `elect-depth-from-calibration.test.ts` (all 5 cases pass, `npx vitest run` confirmed).
- [x] `depthElectedAt` is set (currently null for every topic — this is the first real writer) — `apps/api/src/topic/topic.repo.ts:214-224`'s `electTopicDepths` (the first real writer, confirmed absent before this plan by direct grep as todo.md notes), invoked from `apps/api/src/probe-session/probe-session.service.ts:242-244,281-290`'s `electDepthsOnCalibrationCompletion`, which fires the moment a curriculum-scope session's status crosses to `"completed"` (guarded on `session.completedAt === null` so it only fires once).
- [x] Socratic question generation for that topic is capped at the elected depth, per the existing "gap generation is capped at the elected depth" rule — unchanged pre-existing mechanism: `rowDepth(topic)` (`apps/api/src/topic/topic-progress.repo.ts:20-22`) reads `topics.depth` directly, and gap generation/probing already caps against it; since `electTopicDepths` writes `topics.depth` itself, the existing cap applies automatically with no new clamping logic needed.

SCENARIO 6: Socratic dialogue only starts after calibration, capped at elected depth

Once gated open, Socratic questions for a topic are generated at (not above) that topic's elected depth.

What to verify:
- [x] No Socratic question exceeds the topic's elected depth — same pre-existing `rowDepth`/gap-cap mechanism as S5's third item; the gate (`isSocraticGatedByCalibration`) only controls whether a session may *start*, never the depth ceiling itself, so this needed no new code.
- [x] This reuses the existing gap-generation depth cap, not new depth-clamping logic — confirmed by reading `apps/api/src/socratic/socratic.service.ts`/`apps/api/src/probe/probe.service.ts`: no new depth-comparison logic was added anywhere in this plan's diff.

SCENARIO 7: Going deeper re-fetches the original source, not a fresh unrelated search

When a topic's `availableDepth` exceeds its elected depth (an existing headroom condition), the learner is offered to go deeper. Accepting re-fetches that topic's original source page(s) before generating harder content — not a generic new web search unrelated to the docs site.

What to verify:
- [x] The re-fetch targets the topic's own `sourceId` page (via existing `refetchLink()`), not a fresh unrelated query — `apps/api/src/topic/topic.controller.ts`'s `handleUpdateTopic` (the endpoint `TopicDepthGate`'s `HeadroomOffer.onAccept` already calls) now calls `refetchSource(existing.sourceId)` — the pre-existing `refetchSource`/`refetchLink` pair — whenever the update carries `learningStatus: "going_deeper"` and the topic has a `sourceId`, before writing the new depth.
- [~] The offer is user-visible and requires an explicit action — matches this app's existing button-gated generation pattern (Lecture, Cards); never auto-fires (Decision, see spec.md). `apps/web/src/learning-list/headroom-offer.tsx`'s existing "Go advanced" button and `apps/web/src/learning-list/topic-depth-gate.tsx`'s `onAccept` handler were pre-existing and unmodified — this plan only added the server-side re-fetch behind the same explicit click, so the button-gated UX itself was confirmed, not newly built.
- [~] Newly-fetched content becomes the grounding for the next depth level's questions — `refetchSource` writes the new `fetchedText` onto the `sources` row (pre-existing `writeRefetchResult`), and `resolveCourseGroundingSources`/`generate-page-questions.ts` always reads `fetchedText` fresh on the next `startProbe` call, so the next question generation naturally picks up the refreshed text. Not verified against a live re-fetch (would require a real network fetch), so left as a code-path confirmation rather than a live-run check.

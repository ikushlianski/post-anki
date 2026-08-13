---
type: spec
branch: To-Learn-List
task: AI study-material generation — grounded explainers (fixed), worked examples, analogies
complexity: complex
state: draft
updated: 2026-08-08
---

# Spec: AI study-material generation

### Summary

7.1's "grounded explainer generation per topic, citing real sources" is **not a new build — it
already exists** as the `lectures` module (`apps/api/src/lecture/`, `LecturePanel`,
`lecture.$topicId.tsx`), and this spec reuses every table, the source-candidate-review UI, and the
compile orchestrator unmodified except for two real defects its grounding order has today. First:
`gatherLectureSources` discovers candidates via web search before ever checking the curriculum's
own stored `sources.fetchedText` — inverting `.product/DECISIONS.md`'s settled grounding hierarchy
(stored sources → accumulated knowledge → web search), which `probe-grounding.ts`'s
`gatherProbeGrounding` already implements correctly elsewhere in this codebase. Second,
`compileLecture` falls back to `"(no approved sources with usable text — produce your best-effort
synthesis)"` when every approved candidate's fetched text is empty — that is raw training-data
recall dressed as grounded content, exactly what Principle 1 forbids. Both get fixed as real
scenarios (S1, S2), reusing the exact hierarchy `gatherProbeGrounding` already established rather
than inventing a second one. 7.2 is the genuinely new surface: worked examples and analogies,
requested per topic, many allowed per topic (unlike `lectures`' one-per-topic uniqueness), stored in
one new polymorphic `study_materials` table, using the same fixed grounding hierarchy and the same
"refuse rather than fabricate" rule. Every generation in this module — lecture compile, worked
example, analogy — is triggered exclusively by an explicit user action on an already-open topic;
none is ever produced by a cron, a nudge sweep, or `/daily-push`, per the task's explicit
pull-only/cost constraint.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Grounding-order fix (7.1) | S1, S2, S3 | `hasUsableGroundingText`; `gatherLectureSources` reordered to check curriculum sources first; `compileLecture` refuses on zero usable grounding | `LecturePanel`'s existing `LectureFailed` reused, no new component | None | No new LLM call added — same call count, different order/gate |
| 2 — Worked examples & analogies (7.2) | S4, S5, S6, S7 | `study_materials` table, `study-material.orchestrator.ts`, `.repo.ts`, `.controller.ts`, `study-material-writer.agent.ts` | None yet | Phase 1 (shares `hasUsableGroundingText`) | One LLM call per request, capped grounding text |
| 3 — Pull-only guarantee | S8 | Code-review-verified: no scheduler/cron references either orchestrator | None | Phase 2 | None |
| 4 — Web | S9, S10 | None | `StudyMaterialPanel` mounted beside `LecturePanel` | Phase 3 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `hasUsableGroundingText` | `text: string`, `minChars` (same `MIN_SOURCE_CHARS`-style threshold `gatherProbeGrounding` uses) | boolean — gates both "prefer curriculum sources" (S1) and "refuse, don't fabricate" (S2, S7) | S1, S2, S7 |
| `buildStudyMaterialPrompt` | `kind: "worked_example" \| "analogy"`, `topicTitle`, `groundingText`, `citations: string[]` | prompt string handed to `study-material-writer.agent.ts` — kind-branched instruction, one function, not two near-duplicate prompt builders | S4, S5 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `apps/api/src/lecture/lecture.orchestrator.ts` (`gatherLectureSources` checks `getCurriculumGroundingText`/`getCurriculumCitableUrls` before `gatherLectureSourceGrounding`); `packages/core/src/study-material/grounding-gate.ts` (`hasUsableGroundingText`, shared) | None | None |
| S2 | `lecture.orchestrator.ts` (`compileLecture` refuses instead of synthesizing); `apps/api/src/lecture/lecture.repo.ts` (`setLectureStatus` reason) | `apps/web/src/curriculum/lecture-panel.tsx` (`LectureFailed`, reused unmodified — its existing retry action already covers this path) | None |
| S3 | None — explicitly UNCHANGED; Fact only: `apps/api/src/curriculum/source-fetch.ts::resolveSourceText` (used by `compileLecture` for candidate re-fetch) already routes through `guarded-fetch.ts` | None | None |
| S4 | `apps/api/src/study-material/study-material.orchestrator.ts`, `.repo.ts`, `.controller.ts`; `apps/api/src/mastra/study-material-writer.agent.ts`; `packages/core/src/study-material/grounding-gate.ts`, `study-material-prompt.ts` | None yet | None |
| S5 | `study-material.orchestrator.ts` (kind param → `buildStudyMaterialPrompt` branch), `study-material-writer.agent.ts` (kind-aware instruction) | None yet | None |
| S6 | `apps/api/src/db/schema.ts` (`study_materials`, no unique index on `topicId`); `study-material.repo.ts` (`listStudyMaterials` returns every row for a topic, newest first) | None yet | None |
| S7 | `study-material.orchestrator.ts` (refusal path when `hasUsableGroundingText` fails for curriculum sources, topic/gap text, AND web search) | `apps/web/src/study-material/study-material-panel.tsx` (refusal message) | None |
| S8 | None (negative — verified by code review: no file under `apps/api/src/push/` or any scheduler reference imports `study-material.orchestrator.ts` or `lecture.orchestrator.ts`) | None | None |
| S9 | None (uses S4/S5 endpoints) | `apps/web/src/study-material/study-material-panel.tsx`; `apps/web/src/routes/lecture.$topicId.tsx` (mounts it beside the existing `LecturePanel`) | None |
| S10 | None (uses S4's `citations` field) | `study-material-panel.tsx` (citation list — same visual pattern as `lecture-panel.tsx`'s `LectureReady` citations block, not reinvented) | None |

### Files to create

```
packages/core/src/study-material/       — hasUsableGroundingText, buildStudyMaterialPrompt + tests
packages/shared/src/study-material.ts   — zod: studyMaterialKindSchema (worked_example|analogy), studyMaterial, requestStudyMaterialInput
apps/api/src/study-material/            — study-material.orchestrator.ts, study-material.repo.ts, study-material.controller.ts
apps/api/src/mastra/study-material-writer.agent.ts — one agent, kind-branched instruction
apps/web/src/study-material/            — study-material-panel.tsx, study-material.api.ts, study-material.model.ts
```

### Files to modify

```
apps/api/src/db/schema.ts               — study_materials table (see Data model changes); nothing existing dropped
apps/api/src/lecture/lecture.orchestrator.ts — S1 (grounding-order fix), S2 (refuse-don't-fabricate fix)
apps/api/src/mastra/mastra.ts           — register AGENT_KEYS.studyMaterialWriter + createStudyMaterialWriterAgent()
apps/api/src/router.ts                  — /topics/:id/study-materials routes (resource-named, plural)
packages/core/src/index.ts              — export ./study-material/index
packages/shared/src/index.ts            — export ./study-material
apps/web/src/routes/lecture.$topicId.tsx — mount StudyMaterialPanel beside LecturePanel
```

### Data model changes

- New: `study_materials` (`id`, `topicId`, `kind` text [`"worked_example"|"analogy"`], `status` text
  default `"generating"` [`"generating"|"ready"|"failed"`], `body` text nullable, `citations` jsonb
  `{title: string, url: string}[]` nullable, `failureReason` text nullable, `createdAt`). No
  `.references()` FK, matching this schema's dominant convention. Deliberately **no** unique index
  on `topicId` — see Decisions for why this diverges from `lectures_topic_id_unique`.
- No changes to `lectures`/`lecture_sections`/`lecture_citations`/`lecture_source_candidates` — 7.1
  is a two-line behavioral fix inside the existing orchestrator, not a schema change.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.

### Documentation changes

- Learning domain: update the (presumed, from the intake module's manual step) lecture component
  doc to record the grounding-order fix and add a section for worked examples/analogies.
- Cross-reference `.product/DECISIONS.md`'s "Principle 1 relaxed: probe-time grounding hierarchy"
  entry — this module applies that exact hierarchy (pasted/stored → accumulated → web, web only via
  the search tool, never raw recall) to the lecture and study-material paths for the first time;
  today only probe-time grounding follows it correctly.

### BAML test coverage

Not applicable — no BAML functions touched. Study-material generation goes through a Mastra Agent
on OpenRouter, same as every other agent in `apps/api/src/mastra/`.

### Decisions made autonomously

- **7.1 is a fix-in-place on the existing `lectures` module, not a rebuild.** Every table, the
  candidate-review UI, and `compileLecture`'s overall shape stay exactly as they are. Only the
  candidate-discovery order (S1) and the zero-grounding fallback (S2) change. Treating 7.1 as
  "already done, nothing to spec" was considered and rejected — the grounding-order defect is real,
  reachable today, and violates settled product memory (`.product/DECISIONS.md` Principle 1), so it
  gets two genuine scenarios rather than being waved through.
- **The grounding hierarchy is exactly `gatherProbeGrounding`'s existing order** — curriculum's own
  stored sources first (gated by the same `MIN_SOURCE_CHARS`-shaped threshold, now named
  `hasUsableGroundingText` and shared), then web search — applied identically to lecture candidate
  discovery (S1) and worked-example/analogy generation (S4, S5, S7). No second hierarchy
  implementation; `hasUsableGroundingText` is the one shared gate.
- **Worked examples and analogies are ONE polymorphic `study_materials` table with a `kind`
  column, not two tables.** Mirrors `learning_list_items.kind`/`notes.isHighlight`'s established
  single-table-multi-kind convention — one repo, one controller, one review pattern, two prompt
  branches.
- **No unique index on `study_materials.topicId`, unlike `lectures_topic_id_unique`.** "On demand"
  explicitly means re-requesting is allowed — a second worked example with a different angle is a
  new row, not an overwrite. History accumulates by design here (unlike `notes`, this content is
  AI-generated, not personal writing, so there's no `.product/REJECTED.md` tension: nothing here is
  ever pushed at the user or counted as a debt — see the pull-only decision below).
- **Refuse, never fabricate, on zero usable grounding.** Both the lecture fix (S2) and the new
  study-material path (S7) set `status: "failed"` with a stated `failureReason` instead of calling
  the agent with no real grounding text. A topic with genuinely no material anywhere in the
  curriculum, its own gaps, or the web sometimes ends up with nothing generated — that is the
  correct behavior under Principle 1, not a bug to work around with a fallback.
- **Every generation path in this module is exclusively user-triggered, with no eager or
  background variant.** No cron, no nudge sweep, no `/daily-push` entry point calls
  `compileLecture`, `gatherLectureSources`, or `study-material.orchestrator.ts`'s request function.
  This is the module's compliance boundary with both the cost-awareness constraint (no runaway
  generation loop) and the anti-accumulation principle (nothing is ever generated on the learner's
  behalf without being asked for) — verified in S8 by the absence of any scheduler reference, not
  merely asserted.
- **`study_materials.citations` is a `jsonb` array, not a separate table** (unlike
  `lectures`/`lecture_citations`' split). A worked example or analogy is a single body of text with
  a flat citation list, never multiple ordered sections the way a lecture is — the lighter shape
  matches `probe_session_questions.optionExplanations`' existing `jsonb $type<...>()` precedent for
  a small structured array that doesn't need its own table.

### Implementation order

1. `hasUsableGroundingText` — deriver, unit-tested against fixtures
2. Fix `gatherLectureSources` (S1) and `compileLecture` (S2) in `lecture.orchestrator.ts` — red-green
   against the two new scenarios, verify existing lecture tests still pass unmodified
3. `buildStudyMaterialPrompt` — deriver, unit-tested for both kinds
4. Schema: `study_materials`; generated migration
5. `study-material-writer.agent.ts`; register in `mastra.ts`
6. `study-material.repo.ts`, `study-material.orchestrator.ts` (grounding gate → prompt → agent →
   persist, or refuse)
7. `study-material.controller.ts` + router wiring (`POST /topics/:id/study-materials`,
   `GET /topics/:id/study-materials`)
8. Web: `StudyMaterialPanel`, mounted beside `LecturePanel` in `lecture.$topicId.tsx`

### Scope boundary

- No third study-material kind beyond worked example/analogy in v1 (e.g. flashcard-style recall
  drills) — `kind` stays a closed two-value enum; a third value is a new decision, not silently
  added.
- No editing or regenerating-in-place of a past worked example/analogy — a re-request always creates
  a new row; the old one stays exactly as it was, matching `notes`' "no revision log" precedent.
- No background pre-generation "while you're reading the lecture" — every request is explicit,
  even when the same topic's lecture is already open.
- No change to `lectures`' one-per-topic shape, candidate-review flow, or web UI beyond the two
  grounding-order/refusal fixes — 7.1 stays the existing module.
- No mobile/Telegram surface for study-material generation in v1 — web only, matching the
  study-room's existing web-only footprint.

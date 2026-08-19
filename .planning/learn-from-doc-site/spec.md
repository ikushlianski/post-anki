---
type: spec
branch: main
task: learn-from-doc-site
complexity: complex
state: confirmed
updated: 2026-08-19
---

# Spec: Learn from a documentation site

### Summary
A learner pastes a docs-site URL under an existing subject; the app crawls it, drafts a course split into modules/topics, then — instead of jumping straight into open-ended Socratic dialogue — runs a short calibration quiz across the course's key topics first. The quiz's per-topic results elect each topic's starting depth, using a depth-election mechanism that already exists in the schema but has never had a real writer. Socratic dialogue only unlocks once calibration is done, and stays capped at each topic's elected depth. When the learner wants to go deeper than that, the app re-fetches the topic's original source page (not a fresh unrelated search) before generating harder content. Per-page questions generate lazily, the first time a topic is opened, not eagerly for every crawled page up front.

### Implementation Phases
| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1. Structure + granularity | S1, S2 | Reuse doc-crawl; add granularity constraint to structure prompt | Reuse existing "new curriculum from source" form, target an existing subject | None | Standard curriculum-creation latency |
| 2. Calibration + depth election | S4, S5 | Wire curriculum-scope calibration quiz completion to elect `topics.depth`/`depthElectedAt` | Show calibration quiz before Socratic entry point | Phase 1 | Quiz generation within existing probe-session latency |
| 3. Lazy page questions | S3 | New: per-topic-open question generation grounded in `topics.sourceId` page | Trigger on first topic open | Phase 1 | One generation call per topic, not per crawl |
| 4. Socratic gate + go-deeper refetch | S6, S7 | Gate Socratic start on calibration completion; wire headroom-offer accept to `refetchLink()` on `topics.sourceId` | Show calibration-required state; show go-deeper confirm button | Phases 2, 3 | Re-fetch only on explicit user action |

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `electDepthFromCalibration` | per-topic quiz answers (correct/incorrect) for a course's calibration session | elected `DepthLevel` per topic | S5 |
| `isCalibrationRequiredForSocratic` | course's calibration-session completion state | boolean gate | S4, S6 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| S1 | `apps/api/src/curriculum/curriculum.controller.ts` (confirm subjectId-scoped creation path already used) | `apps/web/src/curriculum/create-curriculum-form.tsx` or equivalent existing source-creation form — confirm it targets an existing subject | None |
| S2 | `apps/api/src/curriculum/curriculum-prompt.ts` — add granularity instruction | None | None |
| S3 | New: `apps/api/src/lecture/` or `apps/api/src/topic/` — lazy per-topic-open question generation grounded in `topics.sourceId` | `apps/web/src/routes/probe.$topicId.tsx` — trigger generation on first open if absent | None |
| S4 | `apps/api/src/probe-session/probe-session.service.ts` — confirm/extend curriculum-scope calibration path from `.planning/newcomer-onboarding-and-cards/` | Course view: show calibration entry before Socratic | None |
| S5 | New: `packages/core/src/topic/elect-depth-from-calibration.ts` (deriver), `apps/api/src/topic/topic.repo.ts` — write `depth`/`depthElectedAt` | None | None |
| S6 | `apps/api/src/probe/probe.service.ts` — Socratic gate check | Socratic entry point UI — show "calibration required" state | None |
| S7 | `apps/api/src/content-library/refetch-link.ts` (reuse), wire to headroom-offer accept handler | `apps/web/src/learning-list/headroom-offer.tsx` or topic-scoped equivalent — go-deeper confirm button | None |

### Files to create
```
packages/core/src/topic/
  elect-depth-from-calibration.ts   — deriver: per-topic quiz result → DepthLevel
  elect-depth-from-calibration.test.ts
apps/api/src/topic/ (or nearest existing home for per-topic question generation)
  generate-page-questions.ts        — lazy, per-topic-open, grounded in topics.sourceId
```

### Files to modify
```
apps/api/src/curriculum/curriculum-prompt.ts    — granularity constraint
apps/api/src/probe-session/probe-session.service.ts  — confirm/extend calibration completion signal
apps/api/src/topic/topic.repo.ts                — write depth/depthElectedAt from calibration
apps/api/src/probe/probe.service.ts             — Socratic gate on calibration completion
apps/api/src/content-library/refetch-link.ts    — reuse for go-deeper (confirm signature fits topic-sourceId re-fetch)
apps/web/src/learning-list/headroom-offer.tsx (or topic-scoped equivalent) — wire accept to go-deeper re-fetch
```

### Data model changes
`topics.depth`/`topics.depthElectedAt` get their first real writer. No migration — columns already exist.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| S1-S7 | A real docs site to crawl against in local dev (turbopuffer.com/docs itself, or a project's existing `mock-docs-site` verification fixture for e2e) | Existing `verification-repo/projects/post-anki/post-anki/mock-docs-site*` fixtures — extend, don't invent a new one |

### Documentation changes
This repo has no `docs/architecture/README.md` domain taxonomy yet (confirmed absent this session). No new taxonomy is established here — out of scope for this feature; the plan folder itself is the durable record.

### Decisions made autonomously
- Per-page question generation is lazy (on first topic open), not eager at crawl time — cost control; a 40-page docs site shouldn't pay for the 30 pages a learner never reaches. (AskUserQuestion was denied; this was the recommended option.)
- Go-deeper re-fetch is user-visible and explicitly triggered, matching this app's existing button-gated generation pattern (Lecture, Cards never auto-fire). (AskUserQuestion was denied; this was the recommended option.)
- Depth election reuses the existing `topics.depth`/`depthElectedAt`/`availableDepth`/headroom-offer mechanism rather than inventing a second depth concept — it already exists, fully modeled, just unwired to any automatic elector.
- Granularity control is a prompt-level instruction addition, not a new post-processing merge step — cheapest fix matching the existing structure-generation architecture.
- Go-deeper re-fetches the topic's own `sourceId` page via existing `refetchLink()`, not a fresh web search — matches the user's explicit requirement ("fetch from the web again", meaning the same source, not a new one).

### Implementation order
1. `electDepthFromCalibration` deriver — covers S5
2. `curriculum-prompt.ts` granularity constraint — covers S2
3. `topic.repo.ts` depth/depthElectedAt writer, wired to calibration completion — covers S4, S5
4. `probe.service.ts` Socratic gate — covers S6
5. Lazy per-topic-open question generation — covers S3
6. `refetch-link.ts` wiring to headroom-offer accept — covers S7
7. FE: calibration-required state, go-deeper confirm button, course-creation form confirms subject-scoping — covers S1, S4, S6, S7

### Scope boundary
- Not building a new crawler — reuses `gatherDocSiteCandidates` as-is.
- Not building a new depth model — reuses existing `topics.depth` ladder.
- Not auto-triggering re-fetch — always an explicit user action.
- Not covering non-docs-site sources (a single blog post, a PDF) — URL-as-docs-site is the only shape this plan covers.

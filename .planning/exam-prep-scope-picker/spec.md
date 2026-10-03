---
type: spec
direction: exam-prep-from-sources
task: "Let the learner pick which subject or tag a mock exam draws from"
updated: 2026-10-03
---

# Spec: mock-exam scope picker

## Facts
- `probeScopeSchema` (`packages/shared/src/probe-session.ts:3`) is `["module", "topic", "tag", "curriculum"]` — the server already accepts any of these for `prepareProbeSession`/`answerProbeSession` with `mode: "exam"` (architecture.md of the mock-exam-session unit: "Client calls prepareProbeSession with scope, scopeId, mode: exam").
- There is a separate `Subject` entity (`apps/web/src/subject/`) that organizes curricula, but it has no probe-session scope of its own and no existing `ProbeSessionQuiz`/exam usage — it is not what the todo item's "subject" refers to.
- `curriculumDetailQuery` (`apps/web/src/curriculum/curriculum.queries.ts:7`) already returns `modules[]` (each with `topics[]` and optional `tags`) for the current curriculum — no new query needed to list candidates.
- `MockExamSession` (`apps/web/src/exam/mock-exam-session.tsx`) hardcodes `scope: 'curriculum'` in 5 places: the query key, `getActiveProbeSession`, both `prepareProbeSession` calls, and the `ProbeSessionQuiz` props.
- The existing tag-practice room (`apps/web/src/routes/probe.tag.$tagId.tsx`) already renders `<ProbeSessionQuiz scope="tag" scopeId={tag.id} />` — proof the quiz component itself is scope-agnostic.

## Decision made autonomously
"Subject" maps to this curriculum's own **modules** (one exam scope per module), not the separate Subject entity and not individual topics — modules are the nearest thing to a "subject" a learner picks from inside one curriculum, and going to topic-level granularity isn't asked for by the todo line. Logged as a default judgment call (`/autonomous`) — a follow-up "topic-level mock exam scope" item can be added later if wanted.

## Scope
- A scope picker on the mock-exam start screen (`MockExamStart`): "This whole curriculum" (today's only option, stays the default) + one entry per module in this curriculum + one entry per tag attached to any of this curriculum's modules/topics.
- The chosen scope/scopeId is carried in the route's own URL search params (`/curriculum/$curriculumId/exam`), the same pattern the tag room already uses for its `view` param — so a reload resumes the right in-progress exam instead of silently falling back to curriculum scope.
- Starting, retaking, resuming, and answering an exam must all operate against the picked scope/scopeId, not a hardcoded curriculum one.

## Out of scope
- Topic-level picker granularity — module and tag only.
- Any change to the Subject entity or its routes.
- Cross-curriculum tag exams spanning more than one curriculum's content — a tag option here still filters to tags present on this curriculum's own modules/topics (`listTags` is global; this unit only surfaces the subset relevant to the curriculum the learner is already in).

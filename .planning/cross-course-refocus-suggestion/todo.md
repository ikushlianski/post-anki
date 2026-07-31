---
type: todo
branch: cross-course-refocus-suggestion
task: Cross-course "refocus" suggestion when priorities shift — GitHub issue #70
state: done
updated: 2026-07-31
---
# Todo: Cross-course refocus suggestion

## Open questions
Nothing to decide.

## Coding tasks
- [x] `packages/shared/src/curriculum.ts` — add `courseRefocusReasonSchema`,
      `courseRefocusSuggestionSchema` (no dismiss-input schema — path params
      only)
- [x] `/tdd computeCourseRefocusCandidatesForSubject` +
      `/tdd isRefocusSuppressedByDismissal` in
      `packages/core/src/curriculum/course-refocus.ts`
  - [x] Cover Scenarios 1, 2, 3, 6, 8, 12, 13 in
        `computeCourseRefocusCandidatesForSubject` — including the eligible-
        count-only `topBandSize` rule and the `lastStudiedAt ?? createdAt`
        fallback
  - [x] Cover Scenario 4 (cooldown boundary at day 7 vs 8) in
        `isRefocusSuppressedByDismissal`
- [x] `apps/api/src/db/schema.ts` — add `courseRefocusDismissals` table +
      composite index on `topics(curriculum_id, progress_last_interacted_at)`;
      generate + run migration (0028_normal_the_fury.sql, applied to local
      Docker Postgres and verified via psql)
- [x] `apps/api/src/curriculum/course-refocus.repo.ts` —
      `listCourseRefocusSuggestions()` + `dismissCourseRefocusSuggestion()`
  - [x] Language-practice subjects excluded from candidates via a deny-list
        filter (`kind === 'language-practice'`), but their phrase-bank
        activity still feeds the global "still active" gate (Scenarios 7, 14)
  - [x] Upsert on `(curriculum_id, reason)`, compound target (Scenario 11)
- [x] `apps/api/src/curriculum/course-refocus.controller.ts` — the two handlers
- [x] `apps/api/src/router.ts` + `apps/api/src/server.ts` — wire
      `GET /course-refocus-suggestions` and
      `PUT /curricula/:curriculumId/refocus-dismissals/:reason`
- [x] `apps/web/src/curriculum/curriculum.api.ts` + `api-client.ts` — server
      fns + fetch calls
- [x] `apps/web/src/curriculum/model.ts` — FE-side `CourseRefocusSuggestion` type
- [x] `apps/web/src/curriculum/course-refocus-banner.tsx` + test — dismissible
      cards (including multiple from one subject, Scenario 12), empty/failed
      state renders nothing
- [x] `apps/web/src/routes/index.tsx` — loader `Promise.all` alongside
      `getBoard()`; render `<CourseRefocusBanner />` above the subjects list
- [x] Manual verification pass (Scenarios 1, 2, 4, 5) — proven end-to-end via
      psql fixture manipulation + curl against the running local dev API
      (localhost:8030, postanki_dev on :5437): backdated a course's
      `created_at` to 30 days ago with no topics rows (stale via the
      `createdAt` fallback), confirmed the suggestion was ABSENT until a
      recent topic activity row was inserted on a different curriculum (the
      "learner active elsewhere" gate), then confirmed it appeared with the
      exact expected `reason`/`daysSinceActivity`; dismissed via PUT and
      confirmed it disappeared; aged `dismissed_at` to 8 days via psql and
      confirmed it reappeared (cooldown expiry); inserted a fresh topic
      activity row on the SAME curriculum and confirmed the suggestion
      disappeared with no dismiss call (self-heal, Scenario 5). All test
      fixtures cleaned up afterward — the persistent local dev DB was left
      as found.

## Manual work
- [ ] Run `npm run db:migrate -w @post-anki/api` locally to apply the new
      `course_refocus_dismissals` migration + the new `topics` composite index
- [ ] Accepted, not a bug: a page reload landing between a dismiss request
      firing and it committing could briefly still show the just-dismissed
      banner once — a single-user eventual-consistency blip that
      self-corrects on the next load; not worth added client complexity
- [ ] Follow-up (not required for this ticket's Definition of Done): track
      `orderChangedAt` so a pre-existing course dragged to rank 1 (not just a
      genuinely new one) can also trigger `new_high_priority_ignored`
- [ ] Follow-up (not required for this ticket's Definition of Done): add a
      scroll-to-subject anchor so the banner can deep-link instead of naming
      the subject in plain text only
- [ ] Follow-up (not required for this ticket's Definition of Done): author
      a real Playwright e2e test in `verification-repo` for this feature

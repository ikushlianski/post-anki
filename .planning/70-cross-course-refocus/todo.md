# TODO: Cross-course refocus suggestion (#70)

## Planning & Pre-Implementation

- [ ] **Verify reference branch alignment** — Manually review commit 75f0e35's implementation against current `main` (as of 2026-08-14) for:
  - Migration numbering scheme (current: what's the next migration number?)
  - Electric sync patterns (unchanged, or new Electric client API?)
  - Curriculum schema (order column position, any new columns)
  - Shared schema exports (courseRefocusReasonSchema, courseRefocusSuggestionSchema location)
  - API route naming and patterns (are handlers still in single files or split?)

- [ ] **Confirm file structure matches current conventions** — Check:
  - `apps/api/src/curriculum/` file size (still ~1600 lines for curriculum.repo.ts? Any recent splits?)
  - `apps/web/src/curriculum/` naming and component co-location
  - Migration naming pattern (still `drizzle-kit generate` + `db:migrate`?)

## Implementation Phase

### 1. Shared Types
- [ ] Add `courseRefocusReasonSchema` (enum: "stale_top_priority" | "new_high_priority_ignored")
- [ ] Add `courseRefocusSuggestionSchema` (object with curriculumId, subjectId, reason, daysSinceActivity, etc.)
- [ ] Location: `packages/shared/src/curriculum.ts`

### 2. Core Logic — Pure Derivers (TDD)
- [ ] Create `packages/core/src/curriculum/course-refocus.ts`
  - [ ] `computeCourseRefocusCandidatesForSubject(courses, now, mostRecentActivityAnywhere, thresholds)` — returns `CourseRefocusCandidate[]`
  - [ ] `isRefocusSuppressedByDismissal(dismissedAt, now, cooldownDays)` — returns `boolean`
  - [ ] Named constants: STALE_DAYS=14, RECENT_DAYS=7, ACTIVE_WINDOW_DAYS=3, topBandSize formula
  - [ ] All logic for: filtering eligible, computing topBandSize, checking stale trigger, checking new trigger, excluding language-practice subjects early

- [ ] Create `packages/core/src/curriculum/course-refocus.test.ts` — vitest unit tests covering all scenarios 1-2, 3, 6, 8, 12, 13, 17-19, plus dismissal suppression boundary

### 3. Database Schema & Migration
- [ ] Update `apps/api/src/db/schema.ts`:
  - [ ] Add `courseRefocusDismissals` table definition with correct column types and unique index
  - [ ] Verify `curricula` table still has `order` column (should be there from #69)
  - [ ] Note: composite index on `topics(curriculum_id, progress_last_interacted_at)` — check if it already exists; if not, add to migration

- [ ] Generate migration: `npm run db:generate -w @post-anki/api`
- [ ] Verify generated SQL creates the table and index
- [ ] **Manual check:** Run `npm run db:migrate -w @post-anki/api` against local Docker Postgres, confirm table exists and index is correct

### 4. Repository Layer
- [ ] Create `apps/api/src/curriculum/course-refocus.repo.ts`:
  - [ ] `listCourseRefocusSuggestions()` — fetches all data needed (subjects, curricula with order, topics aggregate per curriculum, phrase-bank aggregate per subject, dismissals), filters language-practice, groups by subject, calls deriver per subject, joins dismissal state, returns merged suggestions
  - [ ] `dismissCourseRefocusSuggestion(curriculumId, reason)` — compound upsert on (curriculum_id, reason)

- [ ] Create `apps/api/src/curriculum/course-refocus.repo.test.ts` — vitest integration tests covering scenarios 7, 11, 14, plus the "4 fixed queries" claim via code review

### 5. API Routes & Controllers
- [ ] Create `apps/api/src/curriculum/course-refocus.controller.ts`:
  - [ ] `handleListCourseRefocusSuggestions()` — GET handler, returns 200 with array
  - [ ] `handleDismissCourseRefocusSuggestion(curriculumId, reason)` — PUT handler, returns 200

- [ ] Update `apps/api/src/router.ts`:
  - [ ] Add `router.get('/course-refocus-suggestions', handleListCourseRefocusSuggestions)`
  - [ ] Add `router.put('/curricula/:curriculumId/refocus-dismissals/:reason', handleDismissCourseRefocusSuggestion)`

- [ ] Update `apps/api/src/server.ts`:
  - [ ] Wire both routes through the standard middleware chain

### 6. Web API Layer
- [ ] Update `apps/web/src/curriculum/curriculum.api.ts`:
  - [ ] Add server functions for list and dismiss calls

- [ ] Update `apps/web/src/curriculum/api-client.ts`:
  - [ ] Add `listCourseRefocusSuggestions()` fetch wrapper
  - [ ] Add `dismissCourseRefocusSuggestion(curriculumId, reason)` fetch wrapper

### 7. Web Models
- [ ] Update `apps/web/src/curriculum/model.ts`:
  - [ ] Add `CourseRefocusSuggestion` type (matches schema)

### 8. Web Component
- [ ] Create `apps/web/src/curriculum/course-refocus-banner.tsx`:
  - [ ] Accepts `suggestions: CourseRefocusSuggestion[]` as prop
  - [ ] For each suggestion, render a card with: course name, subject name, reason copy (stale or new), dismiss button
  - [ ] Dismiss button calls API mutation, removes card from local state on success
  - [ ] Empty state (no suggestions) renders nothing
  - [ ] Error state (fetch failed) renders nothing

- [ ] Create `apps/web/src/curriculum/course-refocus-banner.test.tsx` — RTL tests covering scenarios 4, 9, 12 (multiple cards)

### 9. Home Page Integration
- [ ] Update `apps/web/src/routes/index.tsx`:
  - [ ] Add `listCourseRefocusSuggestions()` to loader's `Promise.all()`
  - [ ] Pass suggestions to `HomeView` component
  - [ ] Render `CourseRefocusBanner` above the subject board (or at appropriate location per design)

- [ ] Verify loader error handling: if `listCourseRefocusSuggestions()` rejects, should not break entire page (degrade silently)

### 10. Testing & Verification

#### Unit Tests (automated)
- [ ] `npm run tsc --noEmit -w @post-anki/core` — types check
- [ ] `npm run tsc --noEmit -w @post-anki/api` — types check
- [ ] `npm run tsc --noEmit -w @post-anki/web` — types check
- [ ] `npx vitest run packages/core/src/curriculum/course-refocus.test.ts` — pure deriver tests
- [ ] `npx vitest run apps/api/src/curriculum/course-refocus.repo.test.ts` — repo layer tests
- [ ] `npx vitest run apps/web/src/curriculum/course-refocus-banner.test.tsx` — component RTL tests
- [ ] Full suite: `npm run test` (all workspaces)

#### Integration & Manual Verification

**Backend HTTP routes:**
- [ ] Start API: `npm run dev -w @post-anki/api` against local Docker Postgres and Redis
- [ ] `curl http://localhost:8030/course-refocus-suggestions` — should return 200 with `[]` or suggestions depending on seed data
- [ ] `curl -X PUT http://localhost:8030/curricula/<test-curriculum-id>/refocus-dismissals/stale_top_priority` — should return 200

**Web UI verification (manual, requires psql manipulation):**
- [ ] Start dev server: `npm run dev -w @post-anki/web`
- [ ] Set up test scenario via psql:
  ```sql
  -- Create test subject and curriculum if not exists
  INSERT INTO subjects (id, name, kind) VALUES ('test-subj-1', 'Test Subject', 'architecture-mentor') ON CONFLICT DO NOTHING;
  INSERT INTO curricula (id, subject_id, name, status, order) VALUES ('test-course-1', 'test-subj-1', 'Test Course', 'draft', 1) ON CONFLICT DO NOTHING;
  
  -- Backdate last_interacted_at on topics to trigger staleness
  UPDATE topics SET progress_last_interacted_at = now() - interval '15 days' WHERE curriculum_id = 'test-course-1';
  
  -- Ensure at least one other activity is recent (any subject/any topic)
  UPDATE topics SET progress_last_interacted_at = now() - interval '1 day' LIMIT 1;
  ```
- [ ] Open home page in browser, confirm banner appears with test course
- [ ] Click dismiss, confirm banner disappears
- [ ] Update dismissal row: `UPDATE course_refocus_dismissals SET dismissed_at = now() - interval '8 days' WHERE curriculum_id = 'test-course-1'`
- [ ] Reload page, confirm banner resurfaces
- [ ] Update course's `progress_last_interacted_at` to now via psql
- [ ] Reload page, confirm banner disappears (self-heal)

**Electric live-sync (if available in test setup):**
- [ ] Confirm dismissal changes propagate to frontend in real-time via Electric

## Known Gaps & Follow-ups

1. **No `orderChangedAt` tracking** — If a pre-existing course is dragged to rank 1 today, it won't trigger the new_high_priority_ignored suggestion (only newly-created rank-1 courses do). Documented scope-out; a future enhancement could add `orderChangedAt` column and use that instead of/alongside `createdAt`.

2. **No scroll-to-subject deep-link** — Banner doesn't jump to the course on the page. Lightweight follow-up: add `id` to `SubjectSection` component and have banner link to it.

3. **No e2e Playwright test** — This feature is verified by unit + manual tests in this pass. E2e coverage is a `verification-repo` follow-up (separate registered project).

4. **Phrase-bank activity aggregation** — Current implementation assumes `topics` table tracks phrase-bank activity via `progress_last_interacted_at`. If that's changed or decoupled, update aggregation query in `course-refocus.repo.ts`.

5. **Dismissal cooldown hardcoded to 7 days** — If business needs change (e.g., 3-day cooldown for more aggressive resurfacing), update `RECENT_DAYS` constant in `course-refocus.ts`.

## Deployment Notes

- No feature flags needed — suggests non-breaking, additive feature
- No config/env changes required
- Migration must run before API starts serving requests (standard pattern)
- Electric sync must be configured for the new `course_refocus_dismissals` table if not explicitly allowlisted

## Rollback Plan

If issues arise:
1. Revert commits
2. `npm run db:migrate:down -w @post-anki/api` (or manual `DROP TABLE course_refocus_dismissals; DROP INDEX topics_curriculum_progress_idx;`)
3. Restart API
4. Home page no longer renders banner (graceful no-op)

---

## Sign-Off

- [ ] All scenarios pass (unit + integration tests)
- [ ] All file size conventions met (no file >300 lines)
- [ ] TypeScript compiles cleanly (`npm run tsc --noEmit` all workspaces)
- [ ] Manual verification pass completed
- [ ] PR created against main (if implementation proceeds)


# Scenarios: Cross-course refocus suggestion (#70)

## Scenario 1: Stale top-priority course, learner active elsewhere

**Setup:**
- Subject A has 6 courses; Course A1 has `order=1`, `lastStudiedAt=20 days ago`
- Subject B has a topic studied 2 days ago
- `mostRecentActivityAnywhere = 2 days ago` (recent enough)

**Expected:** Suggestion surfaces with reason "stale_top_priority"

**Test:** `computeCourseRefocusCandidatesForSubject` returns `[{ curriculumId: A1.id, reason: 'stale_top_priority', ... }]`

---

## Scenario 2: New high-priority course, unattended

**Setup:**
- Subject A has Course A1 with `order=1`, `createdAt=5 days ago`, `lastStudiedAt=null`
- At least one topic studied within 3 days (global activity gate passes)

**Expected:** Suggestion surfaces with reason "new_high_priority_ignored"

**Test:** `computeCourseRefocusCandidatesForSubject` returns `[{ curriculumId: A1.id, reason: 'new_high_priority_ignored', ... }]`

---

## Scenario 3: No suggestion when quiet everywhere

**Setup:**
- Course A1 is rank 1 and stale (14+ days), but `mostRecentActivityAnywhere = null` (no activity in 3 days)
- OR `mostRecentActivityAnywhere > 3 days ago`

**Expected:** No suggestion (global activity gate suppresses it)

**Test:** `computeCourseRefocusCandidatesForSubject` returns `[]`

---

## Scenario 4: Dismiss hides, cooldown expires, resurfaces

**Setup:**
- Suggestion for Course A1 exists
- User dismisses it at time T

**Expected:**
- At T+4 days: `isRefocusSuppressedByDismissal(dismissedAt=T, now=T+4d, cooldown=7d)` returns `true` (still suppressed)
- At T+8 days: same with `now=T+8d` returns `false` (cooldown expired, resurfaces)

**Test:**
- `isRefocusSuppressedByDismissal` with exact boundary checks at day 6 vs 7 vs 8
- `listCourseRefocusSuggestions()` with seeded dismissals: old suggestion appears in output when cooldown expires

---

## Scenario 5: Real study activity self-heals, no resolve step

**Setup:**
- Stale course suggestion exists
- Learner studies a topic in that course

**Expected:**
- Learner gets no "yes/accept/resolve" prompt
- Next call to `listCourseRefocusSuggestions()` drops the suggestion (because `lastStudiedAt` is now recent)

**Test:**
- Fixture: seeded stale suggestion
- Update topic's `progress_last_interacted_at` to now
- Verify that `listCourseRefocusSuggestions()` no longer returns it (deriver filters it out)

---

## Scenario 6: Done/skipping courses excluded

**Setup:**
- Two courses in Subject A: A1 with `order=1`, `state=skipped`; A2 with `order=2`, `state=open`
- A1 is stale, A2 is recent

**Expected:** No suggestion for A1, even though it's rank 1 and stale (state filters it first)

**Test:** `computeCourseRefocusCandidatesForSubject` excludes A1 entirely, only returns candidates for open/not-done courses

---

## Scenario 7: Language-practice subjects excluded

**Setup:**
- Subject X has `kind='language-practice'` with Course X1 at `order=1`, stale 14+ days
- Subject Y has `kind='architecture-mentor'` with Course Y1 at `order=1`, stale 14+ days

**Expected:** `listCourseRefocusSuggestions()` returns only Y1, not X1

**Test:** Repo-level test with both subject kinds; language-practice subject's courses never appear in output

---

## Scenario 8: Single-course subject is its own top priority

**Setup:**
- Subject A has exactly 1 course: A1, with `order=1`, stale 14+ days

**Expected:** A1 is treated as top-band (topBandSize=1) and triggers stale suggestion

**Test:** `computeCourseRefocusCandidatesForSubject` with 1 eligible course: topBandSize=max(1, ceil(1/3))=1, so A1 is checked for stale trigger

---

## Scenario 9: Banner is non-blocking, failed fetch degrades silently

**Setup:**
- Home page loader calls `listCourseRefocusSuggestions()`
- Request fails (network error, 500, timeout, etc.)

**Expected:** Page renders without banner, no error message, no stuck spinner

**Test:** Component receives `error` state, renders nothing; loader in HomeView handles error gracefully (Promise.all doesn't throw)

---

## Scenario 10: Fixed small number of reads, no fan-out, no LLM

**Setup:**
- App running normally with 10+ subjects, 100+ courses

**Expected:** `listCourseRefocusSuggestions()` makes ~4 database queries total (subjects, curricula, topics aggregate, dismissals), regardless of scale

**Test:** Code review of implementation (verified, not runtime-instrumented, due to test-only tooling cost)

---

## Scenario 11: Dismiss write is idempotent

**Setup:**
- Call `dismissCourseRefocusSuggestion(curriculumId='C1', reason='stale_top_priority')` twice at different times (T and T+2h)

**Expected:** One row in `course_refocus_dismissals` with `dismissed_at=T+2h` (latest)

**Test:** Upsert on `(curriculum_id, reason)` with `onConflictDoUpdate` — second call updates the timestamp only

---

## Scenario 12: Multiple simultaneous stale courses in one subject's top band

**Setup:**
- Subject A has 12 courses (topBandSize = ceil(12/3) = 4)
- Both A1 and A2 are in top band and stale 14+ days
- A3 is in top band but recent
- A5 is outside top band and stale

**Expected:** Suggestions for both A1 and A2, but not A3 or A5

**Test:** `computeCourseRefocusCandidatesForSubject` returns both A1 and A2 in output

---

## Scenario 13: Subject with zero eligible courses produces zero candidates

**Setup:**
- Subject A has 3 courses, all with `state=done` or `state=skipped`

**Expected:** `computeCourseRefocusCandidatesForSubject` returns empty array (topBandSize computed over 0, which is valid)

**Test:** Deriver with all-done subject: returns [], no exception

---

## Scenario 14: Phrase-bank activity counts toward the global "still active" gate

**Setup:**
- Subject A's courses are stale 14+ days; `mostRecentActivityAnywhere` is null from topics alone
- Subject B is language-practice with a phrase-bank practice session 2 days ago

**Expected:** `mostRecentActivityAnywhere` includes Subject B's phrase-bank activity, so gate passes and A's stale course surfaces

**Test:** `listCourseRefocusSuggestions()` fixture: language-practice subject with recent phrase-bank activity, architecture-mentor subject with stale courses — stale course appears in output because the global gate saw the phrase-bank activity

---

## Scenario 15: Dismissing a suggestion with no corresponding row creates new row

**Setup:**
- No row in `course_refocus_dismissals` for `(curriculum_id='C1', reason='stale_top_priority')`
- Call `dismissCourseRefocusSuggestion('C1', 'stale_top_priority')` at time T

**Expected:** One new row inserted with `dismissed_at=T`

**Test:** Upsert handles insert path — row appears in table

---

## Scenario 16: Live-sync propagates dismissals to web in real-time

**Setup:**
- Banner mounted on page with suggestions [S1, S2, S3]
- User dismisses S1 via API call
- Electric sync triggers

**Expected:** Frontend re-queries via Electric, dismissal row appears, suggestion is removed from banner's local state

**Test:** Integration with Electric — not a unit test, verified during manual verification pass

---

## Scenario 17: Dead zone — course created 10 days ago, never studied

**Setup:**
- Course with `createdAt=10 days ago`, `lastStudiedAt=null`, `order=1`
- User has had activity within 3 days

**Expected:** No "new high priority" suggestion (7-day threshold not met)

**Test:** `computeCourseRefocusCandidatesForSubject` with 10-day-old never-studied course: returns []

---

## Scenario 18: Course studied 13 days ago still doesn't trigger (stale threshold is 14)

**Setup:**
- Course with `order=1`, `lastStudiedAt=13 days ago`
- User active within 3 days

**Expected:** No suggestion (below 14-day threshold)

**Test:** `computeCourseRefocusCandidatesForSubject` with 13-day activity: returns []

---

## Scenario 19: Rank-4 course in 12-course subject doesn't trigger even if stale

**Setup:**
- Subject with 12 courses (topBandSize=4); rank-4 course is stale 14+ days, user active within 3 days

**Expected:** No suggestion (rank 4 is on the boundary; triggering only ranks 1-3)

**Test:** Top-band size computation: only ranks ≤3 checked for stale

---

## Scenario 20: Dismissal row persists across re-index and reload

**Setup:**
- User dismisses a suggestion at time T
- Server restarts or re-index runs (no data loss)
- User reloads page at T+2 days

**Expected:** Suggestion still suppressed (dismissal row persists in database)

**Test:** Not a unit test — verified during integration verification pass with real database


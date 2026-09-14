# Visible load errors

Dispatch API-timed-out before writing its own report/mark-done, but the actual code change
landed complete and correct — verified independently (tsc clean, 505/505 vitest, diff read
in full) rather than trusting the failed exit code.

## What shipped

- New `apps/web/src/shared/load-result.ts`: `LoadResult<T> = {ok:true,data:T}|{ok:false}`,
  `settle`/`settleNullable` helpers — a real reusable pattern, not per-site patches.
- `apps/web/src/routes/index.tsx`: course-refocus suggestions, study sessions, learning
  paths, and streak all go through `settle`/`settleNullable`; each renders a visible
  `role="alert"` message on failure instead of silently rendering empty.
- `apps/web/src/routes/curriculum.$curriculumId.tsx`: subjects list same treatment
  (`subjectsFailed` flag → visible alert). Also opportunistically fixed an unguarded
  `href={source.value}` to use the existing `safeHref` guard (unrelated bonus fix, same
  safe-address convention already applied elsewhere this session).
- `CourseRefocusBanner`/`StreakBanner`/`course-refocus-banner.test.tsx` updated to match the
  new `LoadResult` prop shape.

## Verified

`npx tsc --noEmit` clean, `npx vitest run` 505/505 passing (apps/web), diff read in full.
Not yet verified in a real browser (forcing one of the five calls to actually reject and
confirming the message renders) — same caveat every dispatch tonight has carried for
visual/live behavior.

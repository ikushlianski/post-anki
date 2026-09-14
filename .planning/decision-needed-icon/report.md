# Decision-needed icon on curricula

## What shipped

A small attention icon now appears next to the status badge of any curriculum
whose status requires the learner to make a decision before the course can
proceed. The icon uses `lucide-react`'s `CircleAlert` (the codebase already
depends on `lucide-react`, and `subject-section.tsx` already imports `GripVertical`
from it), rendered inline inside the existing `StatusBadge` pill at 14px so it
shares the badge's color and stays visually attached to the label.

Change: `apps/web/src/subject/subject-section.tsx`

- `NEEDS_DECISION` set (`apps/web/src/subject/subject-section.tsx:540`) lists the
  three decision statuses.
- `StatusBadge` renders the icon only when the status is in that set
  (`apps/web/src/subject/subject-section.tsx:553-559`), with
  `data-testid="needs-decision-icon"`.

## Statuses covered and why

Shown (learner decision required):

- `awaiting_source_approval` — approve or reject a found source.
- `failed` — retry or re-parse.
- `ready` — confirm the curated structure before studying starts.

Not shown (no learner decision, or the course is already usable):

- `draft`, `curating`, `shaping_structure` — background/automated stages the
  learner can't act on yet.
- `confirmed` — the course is already studyable; nothing is waiting.

## Detail page header

`apps/web/src/routes/curriculum.$curriculumId.tsx:128` shows
`Overall progress · {curriculum.status}`. The icon was deliberately **not** added
there: that line is a single-curriculum detail view already dominated by a
status-specific banner (`SourceApprovalPanel`, `FailedBanner`, `ConfirmBar`), so a
second icon on the small progress line would be redundant clutter. The
subject-section list is the only "everywhere it's listed" surface in the app.

## What was verified

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 96 files / 502 tests pass, including 7 new cases in
  `apps/web/src/subject/subject-section.test.tsx`:
  - icon present for `awaiting_source_approval`, `failed`, `ready`;
  - icon absent for `draft`, `curating`, `shaping_structure`, `confirmed`.

## Caveat

Not yet viewed in a real browser. The icon's size, alignment, and color need a
visual pass before this is trusted as the "noticeable at a glance" signal the
ticket calls for.

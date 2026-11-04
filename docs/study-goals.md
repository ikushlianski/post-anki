# Study goals and priorities

Optional, per-user goals. Nothing changes for a learner who sets none. No model calls are involved.

## What the learner can set

- Priorities per subject for the current year, month or ISO week: a short title, an optional numeric target counted in reviews, new cards or notes, and a manual done tick.
- One daily review goal. Home and the review page show "Today: done of target"; the count restarts at the learner's local midnight. The streak is unaffected.
- Add-knowledge goals: hot subjects with a notes target per day or per week, shown on the add-knowledge page with a nudge when nothing has been added yet.

## How progress is computed

- Computed on read, nothing is stored. Reviews are non-undone rows of `knowledge_bit_reviews`; a card belongs to its curriculum's subject, otherwise its source's subject. "Notes" are `knowledge_sources` rows by `created_at`.
- A subject's numbers include its whole subtree. Moving a subject changes the numbers retroactively.
- Periods and "today" use the browser time zone sent as `tz`; week and month boundaries are calendar days in that zone (`packages/shared/src/study-goal-periods.ts`).
- Deleting or merging away a subject removes its priorities and add-knowledge goal.

## Endpoints

- `GET/POST /subjects/:id/priorities`, `GET /priorities` (current period across subjects), `PATCH/DELETE /priorities/:id`
- `GET/PUT /study-goal/daily`, `GET /study-goal/daily/progress`
- `GET/PUT /add-knowledge-goals`, `GET /add-knowledge-goals/progress`, `DELETE /add-knowledge-goals/:id`

Tables: `subject_priorities`, `study_goals` (singleton row), `add_knowledge_goals`.

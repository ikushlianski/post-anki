---
type: scenarios
branch: cross-course-refocus-suggestion
task: Cross-course "refocus" suggestion when priorities shift — GitHub issue #70
state: confirmed
updated: 2026-07-31
---
# Scenarios: Cross-course refocus suggestion

## Business Scenarios

SCENARIO 1: A top-priority course goes quiet while the learner keeps studying elsewhere

The learner has three courses in "Backend Engineering," ranked 1–3 by drag order.
Course A (rank 1) hasn't had any topic interaction in 20 days, but the learner
has been actively studying a course in a different subject ("Spanish") within
the last 3 days. Loading the home page shows a dismissible banner naming
Course A as stale.

What to verify:
- The trigger fires per-subject on `order` rank (top third of that subject's
  *eligible* — non-`done`, non-`skipping` — courses, minimum rank 1), not on
  a cross-subject rank, and not counting `done`/`skipping` courses toward
  the band size (see Scenario 13).
- `daysSinceActivity` is computed as `now - (lastStudiedAt ?? createdAt)` —
  a course that has literally never been studied uses its creation date, so
  an old, never-touched, rank-1 course is still flagged stale, not silently
  skipped for lacking a `lastStudiedAt`.
- The "learner is still around" gate is computed globally (across every
  subject's courses, AND across phrase-bank activity in language-practice
  subjects — see Scenario 14), not just within Course A's subject — that's
  what lets Course A's neglect surface even though nothing in *its own*
  subject was touched recently.
- The banner names the specific course and subject, and states roughly how
  long it's been idle.
- Rank is read directly off `curricula.order`'s stored value — ties or gaps
  inherited from #69's own accepted (not fixed) tie-breaking behavior are
  not re-validated or re-normalized here.

SCENARIO 2: A newly added course sits at the top and has never been opened

The learner adds a new course to a subject; it's the only course, or gets
manually dragged to rank 1. Five days pass with zero topic interaction on it,
while the learner keeps studying other things. The home page shows a banner
calling out this course as newly high-priority and unattended.

What to verify:
- Trigger requires: `order === 1` in its subject, `createdAt` within the
  configured recent window, zero recorded topic interaction, and the same
  "learner still active elsewhere" gate as Scenario 1.
- A course created 10 days ago (past the "recent" window but not yet past the
  "stale" window) triggers neither reason — a deliberate dead zone, not a bug.

SCENARIO 3: No suggestion when the learner has gone quiet everywhere

The learner hasn't studied anything, in any subject, for 10 days. Course A
(rank 1, "Backend Engineering") hasn't been touched in that time either. No
refocus banner appears for Course A.

What to verify:
- The global "still active" gate suppresses every candidate when nothing has
  been studied anywhere recently — this is "come back to the app," a
  different problem than "you're studying but ignoring this."

SCENARIO 12: Two courses in the same subject's top band are stale at once

A subject has 6 eligible (non-`done`/`skipping`) courses, so `topBandSize`
(`ceil(6/3)=2`) covers ranks 1 and 2. Both are idle past 14 days while the
learner is active elsewhere. Loading the home page shows two banners, one
per course — not just the single top-ranked one.

What to verify:
- The deriver's plural return type actually produces multiple candidates
  per subject when more than one qualifies, not just the single best match.

SCENARIO 13: A subject where every course is done or skipping produces no banner

A subject has 4 courses, all `learningStatus: "done"` or `"skipping"`. No
refocus suggestion is ever computed for this subject, and the computation
does not error on an empty eligible list.

What to verify:
- `topBandSize` is computed over the *eligible* course count for that
  subject (here, 0), not the raw course count (4) — an empty eligible list
  yields zero candidates, cleanly, not a crash or a false positive from
  `max(1, ceil(0/3)) = 1` being applied to a list with nothing left to rank.

SCENARIO 14: Phrase-bank drilling counts as "still active" for the global gate

The learner has spent the last 2 days exclusively drilling phrases in a
`language-practice` subject (no `architecture-mentor` topic interaction at
all in that window). A rank-1 course in a different, `architecture-mentor`
subject has been idle for 20 days. The stale banner for that course still
appears — the learner reads as "still active," just not on that course.

What to verify:
- The global "still active" signal is `MAX` across BOTH
  `topics.progressLastInteractedAt` (architecture-mentor study) AND
  `phraseBankEntries.lastCorrectDate`/`updatedAt` (language-practice
  drilling) — not topics alone. A learner who studies only via phrase
  practice must not read as globally inactive and suppress every banner in
  every other subject.

SCENARIO 4: Dismissing a suggestion hides it, but not forever

The learner dismisses the Course A banner from Scenario 1. Reloading the home
page immediately shows no banner for Course A. Four days later, Course A is
still untouched — no banner yet (within cooldown). Eight days after the
dismissal, Course A is still untouched — the banner reappears.

What to verify:
- Dismissal is recorded per (curriculum, reason) pair, not per curriculum —
  a course could independently be dismissed for "stale" while a later,
  different reason still surfaces.
- The suggestion is never permanently silenced by one dismissal — continued
  neglect past the cooldown window resurfaces it.
- Re-dismissing resets the cooldown clock.
- Accepted, not fixed: a reload that lands between the dismiss write firing
  and it committing could theoretically still show the just-dismissed
  banner once more — a single-user, eventual-consistency blip that
  self-corrects on the next load, not worth added client-side complexity
  (tracked as a note, not a bug, in `todo.md`).

SCENARIO 5: Studying the course makes its own suggestion disappear, with no explicit resolution step

Course A has an active "stale" suggestion. The learner opens Course A and
answers a question (any real study interaction that updates
`topics.progressLastInteractedAt`). The next home page load shows no banner
for Course A — nobody had to accept/reject/resolve anything.

What to verify:
- There is no "accepted"/"resolved" write path at all for this feature —
  unlike `domain_priority_suggestions`, the suggestion is recomputed fresh on
  every read from current data, so real study activity alone makes a stale
  suggestion stop matching. Self-healing, same posture as this codebase's
  other tie-breaking/self-correcting states.

SCENARIO 6: Completed or explicitly-skipped courses never nag

Course A (rank 1, stale by every timestamp) has `learningStatus: "done"`.
No banner appears for it, ever, regardless of staleness. Same for a course
whose `learningStatus` is `"skipping"`.

What to verify:
- Both trigger conditions exclude `done` and `skipping` courses before rank
  or timestamp checks run at all.

SCENARIO 7: Language-practice subjects are never scanned

A subject has `kind: "language-practice"`. No refocus suggestion is ever
computed for any course under it, matching #69's own exclusion of this
subject kind from course-level ordering UI entirely.

What to verify:
- The subject-level filter is a deny-list on `kind === "language-practice"`,
  not an allow-list on `kind === "architecture-mentor"` — a future third
  `kind` value must default to included, not silently excluded, so the
  filter is written as "exclude the one kind known not to use `order`," not
  "include the one kind known to."

SCENARIO 8: A single-course subject can still be "top priority"

A subject has exactly one course, at `order = 1`. The top-band-rank
computation (`ceil(count / 3)`, minimum 1) still classifies it as
high-priority — a lone course is definitionally the subject's top priority.

What to verify:
- `topBandSize` never evaluates to 0 or a value that excludes rank 1, even
  when a subject has only one course.

SCENARIO 9: The banner is non-blocking

The refocus banner never prevents any other action on the home page — course
creation, drag reorder, tag actions all work identically whether zero, one,
or several suggestions are showing.

What to verify:
- Banner renders above or alongside existing home page content, never as a
  modal or anything that traps focus/interaction.
- A failed fetch of suggestions (network error) degrades to "no banner
  shown," never a page-level error state — this is an enhancement layer, not
  a load-bearing part of the home page.

## Technical/Architectural Scenarios

SCENARIO 10: Suggestion computation stays a small, fixed number of reads, no per-subject fan-out queries

Loading the home page computes refocus suggestions via one query for all
subjects/curricula, one aggregate query for last-studied-at per curriculum
(topics), one aggregate query for last-activity-at per language-practice
subject (phrase bank, for the global gate — Scenario 14), and one for active
dismissals — never N+1 across subjects or courses.

What to verify:
- `listCourseRefocusSuggestions()` issues a small, fixed number of queries
  (four, per above) regardless of how many subjects or courses exist.
- No LLM/agent call anywhere in this path — pure arithmetic over timestamps
  already in the data model.

SCENARIO 11: Dismissal write is idempotent and scoped correctly

Dismissing the same (curriculumId, reason) pair twice in a row never creates
two rows — the second dismiss just refreshes `dismissedAt`.

What to verify:
- `course_refocus_dismissals` has a unique constraint on
  (curriculum_id, reason); the repo write is an upsert
  (`onConflictDoUpdate`), not a blind insert.

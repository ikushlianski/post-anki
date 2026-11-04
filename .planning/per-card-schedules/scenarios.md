# Scenarios: per-card schedules

Notation: note N has cloze gaps c1, c2, c3 (keys `cloze:1..3`); list note L has `list_overview:0`, `list_step:1..4`, `list_next:1..3`. "Tomorrow" = next local day start in the grade's time zone.

## A. Migration and backfill
1. Legacy basic note with schedule row (review 5, due in 10d): after migration still one row, key `''`, identical values; queue and counts unchanged.
2. Cloze note N reviewed 3 times, interval 6d, ease 2.3, phase review, due Friday: gets three rows (`cloze:1..3`) each with those values; the `''` row remains; queue shows 3 cards for Friday, burial then serves one.
3. Cloze note never reviewed (no row): no rows; three new cards.
4. Cloze note suspended at note level: all three card rows suspended.
5. Cloze note buried until tomorrow (manual bury): all three rows inherit it.
6. Cloze note with a superseded variant: rows only for active variants.
7. Historical reviews of cloze cards get `card_key = cloze:<order>`; reviews of basic cards keep `''`.
8. Running the backfill statement twice adds nothing.
9. Preflight finds a note mixing `fill_in_the_blank` and `cloze`: reported; legacy variant keeps the `''` row live, cloze cards get copies.
10. Dormant `''` row on a cloze-only note never appears in counts, forecast, mastery totals, browser (join rule).

## B. Independent schedules
1. Grade c1 "good" on a new note: c1 row created (learning step 1, due +10m); c2 and c3 unaffected (no rows other than burial).
2. c1 graduates to review (+1d) and c2 later graded "easy" (+4d): the two have different due dates, intervals and ease.
3. c2 graded "again" 3 times: lapses on c2 only; leech suspension suspends c2 only; c1 and c3 stay active.
4. List note: `list_step:2` due in 12 days while `list_step:3` is due today; queue shows step 3 only.
5. Interval preview on c2's card uses c2's state, not the note's old state.
6. Learning steps from subject plan options apply per card (steps resolved by subject, state by card).

## C. Sibling burial
1. Grade c1 on a note with c2, c3 new: c2 and c3 get ungraded rows with `buried_until = tomorrow`; response lists their variant ids in `buriedVariantIds`; queue no longer contains them; new count drops by 2.
2. Same grade where c2 is in review due today: c2 buried until tomorrow, still counted in forecast for tomorrow.
3. Grade c1 "again" (1m step): c1 returns in a minute; c2, c3 stay buried.
4. c2 suspended: not touched (stays suspended, not buried).
5. c3 already due in 5 days: not buried (no row change).
6. c3 already manually buried until tomorrow: unchanged (no overwrite, not listed in buried list).
7. Tomorrow arrives: buried cards re-enter the queue; the first one answered buries the others again.
8. Grading in a scoped session with `burySiblings:false`: no burial, all gaps available back-to-back.
9. Time zone: grade at 23:50 local with `tz=Europe/Warsaw`: buried until 00:00 local (10 minutes), not 24 h.
10. No `tz` sent: motivation-settings zone used.
11. Basic/wh/fill-in notes: no burial rows are ever written; rotation behaviour unchanged.
12. Queue invariant: never two cards of the same note in one fetched queue while burial is active (property test over random states).

## D. Undo per card
1. Grade c1, undo: c1 row restored to its previous snapshot (new again: reviewCount 0, phase new); points voided; review marked undone; c2 and c3 unburied (buried_until null) and their rows created by the burial removed.
2. Grade c1, then (scoped, no burial) grade c2, undo c1: allowed (different card); c2 untouched. Previously "not latest".
3. Grade c1 twice (second after learning step), undo the first: refused 409 `not_latest`; undo the second: allowed.
4. Grade c1, user manually unburies c2 and grades c2, undo c1: c1 restored; c2 stays unburied and keeps its review (buried_until no longer equals what grade c1 wrote, and a live review exists).
5. Grade c1 caused leech auto-suspend of c1, undo: suspension reverted for c1 only.
6. Grade c1, c2 was already buried by manual bury, undo: c2 remains buried (not in `buried_siblings`).
7. Replaying the grade with the same `requestId`: no second schedule change, no second burial, same `buriedVariantIds`.
8. Undo of a pre-migration review of a cloze card: review has backfilled key; the card row's `last_reviewed_at` equals the review time only if it was copied from the note row; otherwise 409 `not_latest`. Documented.
9. Undo of a review whose slot was later deleted by an edit: 409 `not_latest`.
10. Suspend c2 manually then undo: only c2 unsuspended; bury likewise.
11. Undo is atomic: failure in sibling release rolls back the whole undo.

## E. Queue, counts, forecast
1. Home/subject/topic counts: a subject with 5 cloze notes x 3 gaps all new: new count 15 before burial; after answering one gap of one note, 15 - 1 (answered) - 2 (buried) = 12.
2. New-card cap 10/day: cap counts per first-time card review; with burial at most one new gap per note per day.
3. Forecast for a note whose three gaps are due today, tomorrow, +5d: three entries in three buckets; after grading today's, buried siblings forecast tomorrow at the earliest.
4. Mastery totals: a subject with one cloze note (3 gaps) and one basic note counts 4 cards, mastered counts per card interval.
5. Scoped by `knowledgeBitId`: returns all unburied gaps of the note; scoped by topic keeps due-first ordering by min card due.
6. `nextDueAt` unaffected by burial of siblings (unchanged semantics).
7. Skipped topics (`learningStatus = skipping`) and unapproved notes still excluded for all cards.
8. Legacy rotation: a basic note with 3 variants still shows one card per day cycle with least-recently-shown variant.

## F. Statistics, goals, streak
1. Streak/day activity: reviewing any single gap counts the day as active.
2. Daily goal of N cards: counts review rows; two gaps of two different notes count 2; two gaps of the same note on one day cannot occur unless unscoped burial is bypassed; if scoped, they count 2.
3. Retention (older-card recall): classifies by that card's `prev_schedule.intervalDays`.
4. Points: one event per review; undo voids only that review's event.
5. "Solid" counter: counted once per note per window even when two gaps cross mastery.
6. Review history chart counts reviews per day, cards not notes.

## G. Suspend and bury controls
1. Suspend from the review screen on c2: only c2 suspended; c1 and c3 remain; browser shows note state "partly suspended" via aggregate (not all suspended).
2. Suspend whole note from the browser: all card rows suspended; unsuspend restores all.
3. Bury c2 manually: only c2 buried until local day end; siblings unaffected.
4. Old iOS build sends control without `variantId`: acts on the whole note.
5. Suspended list shows c2 individually and can unsuspend it.

## H. Edits
1. Edit gap text of c2 (variant replaced, same slot): c2 keeps ease, interval, due.
2. Remove gap c3 from the note: c3 row deleted; history rows kept; counts drop by one card.
3. Add gap c4: new card, new count +1; if c1..c3 all suspended, c4 starts suspended.
4. List edit: insert a step in the middle: later positions inherit earlier schedules (documented); steps beyond new length lose rows; added positions are new.
5. Edit while c1 is buried: burial untouched.
6. Rejected/unapproved note: no cards served, no rows.

## I. Clients
Web:
1. Grade c1: session `front` loses c2, c3 (ids from response), keeps cards of other notes; tally counts one card.
2. Undo c1: c1 returns to the front and is shown unrevealed; c2/c3 appear after the next refetch.
3. Suspend action sends `variantId`; undo of suspend sends `suspended:false` with the same `variantId`.
4. Scoped note session sends `burySiblings:false`; both gaps can be graded in a row.
5. Response missing `buriedVariantIds` (old server): falls back to dropping same-note cards.
iOS:
1. Decoding queue JSON with and without `cardKey` succeeds.
2. After grading c1, queue loses exactly the ids in `buriedVariantIds`; with an old server it falls back to removing same-note cards.
3. Pending (offline) grades for c1 then c2 of one note replay in order, each with its own `requestId`; second replay gets 201 without duplicate.
4. `pendingBits` filtering no longer hides a different gap card of a note that has a pending grade only when that gap is a different `variantId` and burial is not in effect (scoped); with burial the server hides it anyway.
5. Undo from the grade toast restores the card in the queue and the counts.

## J. Concurrency and failure
1. Two grades for c1 and c2 concurrently: serialized by the per-note lock; second sees c2 buried if first buried it, but still accepts the grade (explicit grade of a buried card is allowed; it does not re-bury already-buried siblings differently).
2. Grade with a stale variant id (superseded): applies to the slot's schedule.
3. DB error mid-burial: whole grade rolls back (no schedule change without matching review row).
4. Same `requestId` from two devices: second returns the stored result.

## K. Regression gate
All existing tests for queue, counts, grade, undo, suspension, forecast, statistics, goals, browser filters and iOS/web review pass unchanged for legacy kinds; new tests cover the above. A repo-wide check fails if a file outside the allowed helpers joins `knowledgeBitSchedules` on `knowledgeBitId` alone.

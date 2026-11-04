---
type: scenarios
branch: learn-from-doc-site
task: knowledge-retention (exam vs long-term study intent)
state: confirmed
updated: 2026-10-26
---
# Scenarios: knowledge retention with two study intents

## Business Scenarios

SCENARIO 1: Choose Exam with a date — asked

A learner opens a subject, picks "Exam", enters the exam date, and the subject now studies toward that date.

What to verify:
- The choice and date are saved and shown again after a reload.
- Exam without a date is refused with a plain message; a date in the past is refused.
- Switching back to Long-term (or to "same as parent") clears the date.

SCENARIO 2: Every card comes back before the exam — asked

While a subject is in Exam mode, no review gap is allowed to run past the day before the exam, so each card is seen again at least once before it.

What to verify:
- A card answered "Easy" with 40 days left is next due no later than the day before the exam.
- The gap limit shrinks as the exam gets closer (5 days left gives at most 4 days).
- The preview under each answer button shows the same gap the answer then produces.

SCENARIO 3: New cards are spread to finish three quarters of the way to the exam — asked

With no number typed by the learner, the daily new-card count is worked out from how many new cards remain and how many days are left before the "new material done" point (three quarters of the way from when the exam was set to the exam date).

What to verify:
- 450 new cards, exam set today 60 days out: about 10 new cards a day, new material finishing around day 45.
- The daily number does not drop during the day as cards are learned.
- Past the three-quarter point with new cards still left, the rest are spread over the days up to the day before the exam.

SCENARIO 4: The learner can still set new cards per day — asked

A learner who types a new-cards-per-day number on the exam subject (or a sub-subject under it) gets exactly that number instead of the worked-out pace.

What to verify:
- A typed value on the exam subject wins over the pace.
- A value inherited from above the exam subject, or the app default, does not override the pace.
- Clearing the value returns to the worked-out pace.

SCENARIO 5: New cards pause while reviews pile up — asked

In Exam mode, when the reviews already waiting for a subject reach twenty times its daily new-card count (at least 100), new cards for that subject stop for now and come back once the pile is worked down.

What to verify:
- 420 waiting reviews at 20 new a day: no new cards are served; 380 waiting: new cards are served.
- The subject page says new cards are paused and why.
- Long-term subjects are never paused by this rule.

SCENARIO 6: Desired retention changes how often cards come back — asked

Raising desired retention makes review gaps shorter (more reviews); lowering it makes them longer, in both intents. 90% keeps today's gaps exactly.

What to verify:
- At 95% a "Good" answer gives about half the gap it gives at 90%; at 85% about one and a half times.
- At high retention a "Good" gap still grows by at least one day.
- Values above 95% or below 80% have no further effect, and the page says so.
- Changing retention never moves cards that are already scheduled.

SCENARIO 7: Long-term behaves as today by default — asked

A subject nobody has touched is Long-term with 90% retention, and its scheduling, new-card limit and longest gap (365 days) are unchanged.

What to verify:
- Gaps, previews and daily new-card counts are identical to before for default subjects.
- Existing subjects and app settings are untouched by the upgrade.

SCENARIO 8: Sub-subjects follow their parent's intent — asked

A sub-subject with no intent of its own follows the nearest parent's intent and exam date; the page says where the value comes from.

What to verify:
- A child of an Exam parent shows "Exam on <date>, from <parent>" and studies toward that date.
- Each sub-subject paces its own new cards toward the shared date.
- A child can set its own intent, which wins for it and its own children.

SCENARIO 9: The exam date has passed — added (kept: Exam mode cannot work without a defined after-date behaviour)

After the exam date, the subject studies as Long-term until the learner sets a new date or switches.

What to verify:
- No gap limit or pacing applies after the date; normal long-term limits return.
- The page says the exam date has passed and offers to set a new date or switch to Long-term.

SCENARIO 10: Plain forecast on the subject page — asked

The subject page shows, in a few plain lines, about how many reviews a day to expect, how many are due today, how many days are left, and when new material will be finished.

What to verify:
- "About N reviews a day over the next M days (busiest: P on <day>)" matches the simulated days.
- "New material done around <date>", flagged when that is on or after the exam date, or "not at the current pace" when new cards are zero.
- A subject with no cards shows a short empty message instead of numbers.

SCENARIO 11: Only four settings in sight — asked

The study options show intent, exam date (only for Exam), desired retention and new cards per day; learning and relearning steps sit behind a closed "More options" control.

What to verify:
- The four settings are visible without opening anything.
- Steps still work and save from inside "More options".

SCENARIO 12: Same settings on iPhone — asked

On iPhone, a subject has a "Study plan" screen with the same four settings, the same inheritance hints and the same rules.

What to verify:
- Changes made on iPhone show on the web and the other way round.
- Refused input (Exam without date, past date) shows the server's plain message.
- Without a connection the screen says it cannot save; nothing is queued.

SCENARIO 13: Short stats on iPhone — asked

The same iPhone screen shows days left, reviews due today, expected reviews a day for the coming days, recent retention against the target, and when new material finishes.

What to verify:
- Numbers match the web subject page for the same subject and day.
- Recent retention shows "no reviews yet" when there is no history.

## Technical/Architectural Scenarios

SCENARIO 14: Upgrade is additive and safe on live data — asked

The upgrade adds three empty subject fields and nothing else; every existing subject reads as "same as parent" and the app default stays Long-term.

What to verify:
- Every existing subject row keeps its values; new fields are empty.
- Subjects that already store a retention other than 90% are listed before release, because their next gaps will change.

---
type: scenarios
branch: phrase-bank-mastery
task: Port phrase-bank spaced repetition with mastery tracking to the English subject
state: confirmed
updated: 2026-07-25
---
# Scenarios: Phrase-bank spaced repetition with mastery tracking

## Business Scenarios

SCENARIO 1: A new target phrase enters the bank on its first correct use

A generated sentence is tagged by the generation model as teaching a specific expression (e.g.
"get to the bottom of"); the learner translates it correctly on the first try.

What to verify:
- If the tagged phrase text exactly matches (case-insensitive, trimmed) an existing *active*
  (non-mastered) bank entry for that subject/level/pack, `matchExistingPhraseBankEntry` reuses that
  entry — no duplicate is created. Otherwise a new `phraseBankEntries` row is created with
  `status = new`.
- On the correct grade, the entry moves to `status = practicing`, `masteryStage = 1`.
- It is scheduled for recycling roughly 3 generated sentences later for that subject/level/pack.
- An appearance record is written capturing the phrase's `sequenceNumber` and the correct result.

SCENARIO 2: A struggling phrase gets recycled and rescued back to practicing

A phrase the learner previously got wrong (`status = struggling`, isolation mode) is intentionally
re-included in a later batch; the learner answers it correctly this time.

What to verify:
- The struggling phrase is selected for a later batch's generation prompt because it was due.
- On a correct answer, its status moves out of `struggling` back toward `practicing`, without
  wiping its lifetime attempt/correct counters — only the in-cycle mastery counters change.
- The phrase card in the UI is visibly marked as a recycled phrase-bank item, not a request for
  the learner to guess this is special.

SCENARIO 3: Three non-adjacent correct uses archive a phrase as mastered

A phrase accumulates 3 correct, non-back-to-back appearances across separate batches/attempts.

What to verify:
- On the 3rd qualifying correct appearance, the entry's status flips to `mastered` and a
  `masteredAt` timestamp is set.
- A mastered phrase is no longer selected as "due" for future recycling.
- The learner sees a "mastered" indicator in the grading result for that attempt, and the phrase
  bank summary view lists it under mastered rather than active.

SCENARIO 4: Two correct answers in immediate succession don't double-count toward mastery

The learner answers the same phrase correctly twice back-to-back (e.g. it reappears in the very
next generated sentence position for that subject/level/pack) before any other sentence about that
phrase intervenes.

What to verify:
- Only one of the two adjacent correct appearances advances the non-adjacent mastery counter; the
  other is recorded in appearance history but does not count toward the 3-correct threshold.
- The phrase does not incorrectly reach `mastered` status from two adjacent correct answers plus
  one more.

SCENARIO 5: A new batch actively recycles due phrases alongside novel content

The learner requests (or auto-triggers, via prefetch) a new 10-item batch while the phrase bank has
struggling/practicing entries due for review.

What to verify:
- The generation prompt for that batch includes the due phrases (bounded to a small number, not
  the whole bank) and asks the model to weave each into exactly one natural sentence.
- Generated items that target a due phrase are linked back to that phrase-bank entry once
  persisted; items with no tracked target remain ordinary novel content.
- A batch with no due phrases behaves exactly as today — no recycling attempted, no errors.

SCENARIO 6: The learner discovers recycling and mastery without reading the database

While practicing, the learner can tell which phrase-bank phrases are currently active (and their
struggling/practicing state) and which have been mastered, without leaving the practice flow.

What to verify:
- A recycled phrase card is visibly marked as such during practice.
- A phrase bank summary (active vs. mastered) is reachable from the practice page.
- A phrase that just got mastered is called out at the moment its grading result appears.

SCENARIO 7: Switching level or pack scopes the phrase bank separately

The learner changes practice level (e.g. B1_B2 to C1_C2) or pack (e.g. General to CodeReview),
then switches back to the original level/pack later.

What to verify:
- Phrase-bank entries and due-phrase selection are scoped to the active subject+level+pack
  combination, matching how batch generation already avoids repeats per level/pack: an entry
  created under B1_B2/General is never selected as due while C1_C2/General is active.
- After switching back to B1_B2/General, a struggling entry's `status`, `masteryStage`,
  `correctCountInCycle`, `incorrectCountInCycle`, and `scheduledForSentenceCount` are byte-for-byte
  unchanged from what they were immediately before the switch away — the intervening C1_C2/General
  activity writes zero rows that reference the B1_B2/General entry.

SCENARIO 8: The very first batch for a subject/level/pack has nothing to recycle

A learner's first-ever batch for a given subject/level/pack combination is generated.

What to verify:
- The due-phrase selection returns an empty set (no due entries exist yet) and generation proceeds
  exactly as it does today, with every item eligible to seed new phrase-bank entries.

SCENARIO 11: A practicing phrase fails and rolls back to isolation, not to zero

A phrase already in `practicing` (or mid-way through recycling as `struggling`) gets an incorrect
grade.

What to verify:
- `status` moves to `struggling`, `mode` to isolation, `masteryStage` and `correctCountInCycle`
  reset to 0 for the current cycle — but the entry's lifetime `incorrectCountInCycle` increments
  rather than any history being deleted, and its full `appearanceHistory` (in
  `phrase_bank_appearances`) is untouched.
- It is rescheduled for recycling roughly 3 generated sentences later, same as any other transition.
- This is "rollback to isolation," explicitly not a reset back to `new` — a phrase that has already
  been introduced once never goes back to looking untaught.

SCENARIO 14: A brand-new phrase's very first attempt is wrong

A phrase enters the bank as `status = new` (never attempted before) and the learner's very first
attempt at it is graded incorrect — this is how most of the source app's real struggling entries
actually arose (`fell-on-deaf-ears`, `jump-ship`, `dodge-question` in the source data all show
`attempts: 1, correct: 0`, `mode: isolation`, empty `appearanceHistory`), so it's a distinct path
from SCENARIO 11's "already-practicing phrase fails."

What to verify:
- The entry goes directly to `status = struggling`, `mode` isolation — it never passes through
  `practicing` first.
- `masteryStage` and `correctCountInCycle` stay at 0 (there was nothing to roll back from);
  `incorrectCountInCycle` becomes 1.
- It is scheduled for recycling roughly 3 generated sentences later, identical scheduling to any
  other transition into `struggling`.

## Technical/Architectural Scenarios

SCENARIO 9: Generation and grading stay resilient when the model tags no target phrase

Not every generated sentence needs to be phrase-bank-worthy — a plain sentence with no notable
idiom/expression should not force a phrase-bank entry into existence.

What to verify:
- `phrases.target_phrase_bank_entry_id` stays `null` for untagged sentences.
- Grading such an attempt performs no phrase-bank writes at all — it behaves exactly like today's
  flow.

SCENARIO 10: Due-phrase selection and mastery-stage transitions are pure, unit-tested logic

The scheduling/non-adjacency/mastery-transition rules are deterministic business logic, not buried
in the orchestrator or a database query.

What to verify:
- `selectDuePhrases`, `applyAttemptToPhraseBankEntry`, and `matchExistingPhraseBankEntry` live in
  `packages/core` as pure functions with no DB or LLM dependency, each covered by co-located
  Vitest cases in business language.
- `applyAttemptToPhraseBankEntry` takes the raw grading `verdict`, not a pre-computed
  correct/incorrect boolean — the verdict→correct mapping is itself a tested rule inside the
  deriver, not a conditional living in `grade-attempts.orchestrator.ts`.
- The orchestrators (`generate-phrase-batch.orchestrator.ts`, `grade-attempts.orchestrator.ts`)
  only wire these derivers to persistence — no independent copy of the mastery rules exists there.

SCENARIO 12: A hallucinated or duplicate id-echo never crashes batch generation

The generation model echoes a `targetPhraseBankEntryId` that either doesn't match any due entry
actually sent in the prompt, or matches a due entry a different item in the same batch already
claimed.

What to verify:
- An echoed id not present in the due-entry set sent to the model is treated exactly like a `null`
  echo — the sentence is inserted as untracked content, and the `phrases.targetPhraseBankEntryId`
  foreign key is never violated.
- Only the first item (generation order) that echoes a given due-entry id is linked to it; any
  later item echoing the same id in the same batch is treated as untracked, not as a second
  appearance recorded against that entry.
- `generatePhraseBatch` completes successfully and inserts all 10 rows in both cases — a bad echo
  degrades one item's tracking, never the whole batch.

SCENARIO 13: A phrase's real sentence position is exact, not approximated

Grading happens per chunk (5 or 10 items) out of a 10-item generated batch, and batches accumulate
over many sessions for the same subject/level/pack.

What to verify:
- Every `phrases` row gets a distinct, monotonically increasing `sequenceNumber` for its
  subject/level/pack, assigned once at generation time — two items in the same batch never share a
  `sequenceNumber`, and the last item of one batch is exactly one less than the first item of the
  next batch generated for the same subject/level/pack.
- `phrase_bank_appearances.sentenceCount` stores that same `sequenceNumber`, so adjacency between
  two appearances of the same phrase (including ones that straddle a batch boundary) is computed
  from an exact position, never from a value that could collapse multiple items in one batch to the
  same number.

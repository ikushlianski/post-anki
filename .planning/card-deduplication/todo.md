# Card deduplication during triage
## card-dedup

### Scope
- Before the owner triages an AI-generated card, find cards already in the database that say the same thing.
- Cheap similarity first, a small model only for close calls, so cost stays low.
- Out of scope: Duplicate subjects (a separate plan) and merging cards already approved long ago.

### Goal
- A new card that duplicates an existing one is flagged in Triage with the match shown, and the owner resolves it in one swipe or tap.

### Coding tasks
- [ ] In swipe Triage, show a flagged card with its closest existing match beside it and let the owner keep both, reject the new one, or replace the old one, with reject-the-new-one as the quick default.
  - Decision: Which default action a swipe takes on a flagged card.
  - Default: Swipe left rejects the new card as a duplicate, swipe right keeps both.
- [ ] For borderline similarity only, ask a cheap model whether the two cards really ask the same thing, so exact copies are caught for free and unrelated cards never reach the model.
- [ ] When AI cards are created, compare each against existing cards by embedding similarity and mark near-duplicates with a link to the closest existing card.

### Notes



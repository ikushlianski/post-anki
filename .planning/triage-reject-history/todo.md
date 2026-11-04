# Triage reject without a reason, with a week of history
## reject-history

### Scope
- Rejecting a card in triage never asks why
- The owner can browse, search and edit the last week of triage decisions and their reasons
- Out of scope: Changing how reasons are used in statistics

### Coding tasks
- [x] Let the owner search that history by words and by meaning, using the existing card embeddings for meaning search, with the API returning matching decisions.
  - Why: Finding an old rejection by what the card was about should work even when the wording differs.
- [x] Add a triage history view on web, iPhone and Mac listing the last seven days of triage decisions, each with its card, decision and reason, where the owner can set or change a reason after the fact.
  - Why: Reasons are no longer collected at reject time, so they need a place to be added or corrected later.
- [x] Make rejecting a card in triage on web, iPhone and Mac save the rejection at once without showing the reason popup, leaving the reason empty.
  - Why: The owner wants to move through triage quickly and fill in reasons later.

### Notes



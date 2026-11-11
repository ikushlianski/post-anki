# List-aware card writing
## list-aware-card-writing

### Scope
- The card writer turns list-shaped material into one-item, situation and discrimination cards instead of a card whose answer is the whole list.
- Out of scope: Converting Anki cloze markup in imported notes, which the anki-cloze-import plan owns.

### Goal
- List notes become small single-item cards, never a card whose answer is the whole list.

### Criteria
- [x] Both card writers share one rule block forbidding whole-list answers.
- [x] Situation cards sharing a one-word answer are all stored.
- [x] A business list chunk can yield up to eight cards.
- [x] A real step-by-step process still yields one ordered-list card.
- [ ] The avoidance example yields situation and single-risk cards only.

### Coding tasks
- [x] Treat each paragraph and standalone fact sentence as its own card source, skipping only filler or ads.
- [x] Add one shared list-card rule block, and drop the whole-list mnemonic card.
- [x] Raise the business per-chunk card limit to 8 and make list prompt version 8 active.
- [x] Fold the question into the statement of short-answer business cards so situation cards are not deduplicated away.
- [x] Add mocked-model unit and integration tests for list chapters, plus one list-cards line in the pipeline doc.

### Notes
- Owns the card-writer prompt rules, the business prompt file and the general card writer in apps/api/src/mastra.
- Depends on anki-cloze-import, which also edits apps/api/src/mastra/knowledge-bit-business-cards.agent.ts, so this builds after it.



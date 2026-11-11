# Anki cloze notes
## cloze-notes

### Scope
- Notes in Anki cloze format from any entry point become cards; inbox titles read as plain text.
- Out of scope: List-aware card writing.

### Goal
- A note in Anki cloze format, from any entry point, becomes cards instead of being judged empty or failing.

### Criteria
- [x] A pasted note with cloze blanks yields at least one card.
- [x] A plain prose note is processed exactly as before.
- [x] Inbox note titles show the hidden answer, not cloze markers.
- [ ] Stuck production cloze notes yield cards when retried after deploy.

### Coding tasks
- [x] Read any note with cloze markup like an Anki import, always asking for at least one card.
- [x] Move the cloze marker stripper into the shared package and use it for inbox note titles.
- [x] Update the ingestion pipeline doc to cover cloze notes from any entry point.

### Notes
- Owns apps/api/src/knowledge-bit extraction steps and packages/shared/src cloze and extraction-failure helpers.



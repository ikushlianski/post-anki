# Scenarios: create or edit a knowledge item from per-item chat

- [ ] Draft in edit mode returns proposed body text grounded on the bit and transcript, no db write
- [ ] Draft in create mode returns proposed new-item text, no db write
- [ ] Draft endpoint returns not_found for a missing knowledge bit
- [ ] Draft agent has no tools reachable, regardless of any earlier allowWebSearch/allowGeneralKnowledge flag
- [ ] Edit endpoint updates the body and resets embedding/tag/placement markers, keeps topicId
- [ ] Edit endpoint resets wh-question and fill-blank generation/claim state
- [ ] Edit endpoint deletes stale generated question/fill-blank variant rows for the bit
- [ ] Edit endpoint returns not_found for a missing knowledge bit
- [ ] Edit endpoint rejects an empty body with a 400
- [ ] Creating a new item from a draft reuses POST /knowledge-sources unchanged

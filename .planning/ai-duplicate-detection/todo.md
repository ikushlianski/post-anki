---
type: todo
branch: ai-duplicate-detection
task: AI-assisted duplicate detection: surface likely-duplicate subjects (issue #63)
state: open
updated: 2026-08-09
---
# Todo: AI-assisted duplicate detection

## Decisions to make
- Nothing to decide.

## To review / clarify
- [ ] Verify the embedding service actually works before building duplicate detection on top of it, and fail clearly if it doesn't
- [ ] Verify that comparing many subjects at once returns results in the same order they were submitted, or process them one at a time instead
- [ ] Check whether the embedding service limits how many subjects can be compared in a single batch

## Manual steps
- No manual steps required; the embedding model has a sensible default and needs no new secret.

## Post-deploy checks
- [ ] After launching, run a real duplicate scan against production data and confirm it completes successfully end to end

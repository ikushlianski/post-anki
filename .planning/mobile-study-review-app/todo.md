---
type: todo
branch: mobile-study-review-app
task: React Native mobile app for Post Anki, reusing apps/api, starting with core study/review flow
state: open
updated: 2026-08-09
---
# Todo: React Native mobile app (core study/review flow)

## Decisions to make
Nothing to decide — the one real fork, using an access token instead of a login screen, is resolved and documented.

## To review / clarify
Nothing to review.

## Manual steps
- After building, a human manually generates the first access token; this is intentionally not automated.
- To point the mobile app at the live backend instead of a local one, update its configured server address.

## Notes
- Historical build record kept in build-log.md.

## Post-deploy checks
Not applicable; this slice has no deploy step of its own beyond the standard database update process.

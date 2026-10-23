## Goal
Open the app on a phone any time and start learning post-anki facts in one tap, with weak or no connection.

## Architecture
- Home owns the entry point: a "Study now" button that opens the existing `ExerciseScreen(topics:)` for the last-studied course (`LastStudied`, `CurriculumDetail.modules[].topics[]`). No new screen.
- A new on-device cache module (`VariantCache`) owns stored `NextQuestionVariant` lists keyed by topic id, as JSON files in the app's caches directory. No new dependency (decision from `.planning/local-first-sync-investigation/spec.md`: plain local cache, not a sync engine).
- `APIClient.nextQuestionVariants` stays the network call. `ExerciseScreenModel` reads the cache first when the network call fails, and refreshes the cache after every successful fetch.
- A new `PendingAnswerQueue` module owns answers given while grading fails: stored on device, replayed through `APIClient.gradeAnswer` when the app next loads an exercise or returns to the foreground. While queued the screen says "Saved, will be graded when you're back online" and never shows a fake grade.
- No backend change, no new endpoint, no change to auth.

## Decisions
- JSON files over SwiftData: the payload is a small list per topic and needs no queries.
- Replay trigger is the next exercise load and scene-active, not a background task: no extra entitlement or runtime.
- Offline answers are not graded locally; grading needs the server.

## Check
Real `xcodebuild` for the iOS simulator passes. Live data cannot be verified (prod API not deployed); say so.

## The ask
Tapping a topic inside a course/deck starts an exercise: answer question-variants generated for
that topic's knowledge items, one at a time, same grading loop the Ingest tab already has.

## Real API contract (source, not live — prod isn't deployed yet)
- `GET /subjects`, `GET /curricula`, `GET /curricula/:id` — already wired (APIClient.swift).
- `GET /knowledge-bits/question-variants/next?limit=&topicId=&tagId=` — takes an optional
  `topicId` filter (post-anki apps/api/src/knowledge-bit/list-next-knowledge-bit-question-variants.controller.ts:14-17).
  Currently `APIClient.nextQuestionVariants` calls it with no `topicId` — add the parameter.
- `POST /knowledge-bits/question-variants/:id/answers` — already wired (`gradeAnswer`).
- No single "exercise for a whole curriculum" endpoint exists — loop the curriculum's own
  topic list (already in `CurriculumDetail.modules[].topics[]`) client-side, one topicId's queue
  at a time, advancing to the next topic when a topic's queue empties. Don't invent a bulk
  endpoint; this is a client-side loop over an existing, real endpoint.

## What to do
1. `APIClient.nextQuestionVariants(topicId:limit:)` — add the `topicId` param, keep it optional.
2. New `ExerciseScreen(topics: [Topic])` — reuses `IngestScreenModel`'s load/submit/next pattern
   but scoped: pulls the next variant for `topics[currentTopicIndex]`, advances `currentTopicIndex`
   when a topic's queue is empty, ends when all topics are exhausted ("Nothing left to practice").
3. `CurriculumDetailScreen` (CoursesScreen.swift): make each topic row (or a "Practice" button at
   the top of the module list) a `NavigationLink` to `ExerciseScreen(topics:)`.

## Files by scenario
| Scenario | Files |
|---|---|
| Tap a topic, get its next question variant | CoursesScreen.swift (nav), new ExerciseScreen.swift, APIClient.swift |
| Answer correctly/incorrectly, see feedback | ExerciseScreen.swift (reuses gradeAnswer) |
| Finish one topic's queue, auto-advance to next | ExerciseScreen.swift |
| All topics exhausted | ExerciseScreen.swift (empty state) |

## Done when
Builds clean (`xcodebuild`, real, not swiftc-only — Swift 6 strict concurrency broke the build
once already, don't regress it), installs and launches in the simulator, and a screenshot shows
the exercise screen reachable from a topic tap. Cannot verify real data end-to-end — prod API
isn't deployed; note that explicitly rather than claiming it was tested live.

## Guardrails for whoever implements this
- Do NOT `git checkout`/`git restore` anything in `Sources/` — the four `@MainActor` annotations
  on `HomeScreenModel`/`CoursesScreenModel`/`CurriculumDetailScreenModel`/`IngestScreenModel` are
  real, uncommitted fixes for a Swift 6 concurrency build failure. Reverting them breaks the build.
- New model classes follow the same `@Observable @MainActor` pattern as the existing three.

## The ask
A dictation-friendly screen to bulk-ingest knowledge while reading/listening to something —
opened from a course/topic, big text field, Wispr-Flow-friendly (dictation fills a plain text
field, no per-sentence structure required from the user).

## Real API contract (source, not live — prod isn't deployed yet)
- `POST /knowledge-sources { text: string }` → creates a knowledge source
  (post-anki apps/api/src/knowledge-source/knowledge-source.controller.ts:6-29). No topic/module
  param exists — the source is unscoped at creation time.
- `POST /knowledge-sources/detect-bits` — a global async scan over ALL pending sources, not a
  per-source synchronous call (detect-knowledge-bits.controller.ts:19-31). No immediate
  "here are your knowledge bits" response to a single dictation.
- `GET /knowledge-bits/placement-suggestions` / `PATCH /knowledge-bits/:id/placement-suggestion`
  — the review/inbox pair; accept requires a `moduleId` + `title`, reject takes nothing
  (packages/shared/src/knowledge-bit.ts:10-17). This is where scoping actually happens — after
  detection, not at ingestion.

## Assumption — updates the earlier "local, immediate inference" note in the root todo.md
The real backend is scan-based, not per-utterance-immediate: submitting text does not return
generated knowledge items synchronously. "Auto-detect knowledge items from dictated text with a
fast, cheap model" (root todo) means triggering `detect-bits` after submission and polling/
surfacing results later via the placement-suggestions inbox — not a live preview while dictating.
Revise that root item's scope to match once this ships.

## Assumption — "scoped to one course/topic/module"
Since `POST /knowledge-sources` takes no topic/module param, the screen scopes by *entry point*
only (opened from `CurriculumDetailScreen`, topic pre-selected in the UI for the user's own
navigation/mental model) — it does not send that scope to the server. Real placement is decided
later by the AI + the learner in the KI inbox (a separate todo item). Flagged to post-anki-c7 as
a possible future request-param addition; not blocking this screen.

## What to do
1. `APIClient.createKnowledgeSource(text:)` — `POST /knowledge-sources`, returns the created
   source (decode loosely; only need success/id, not full shape).
2. `APIClient.detectKnowledgeBits()` — `POST /knowledge-sources/detect-bits`, fire-and-forget
   trigger after a successful submit (best-effort; ignore its result besides success/failure).
3. New `IngestionDictationScreen(topic: Topic)` — large multiline `TextEditor` bound to a
   `@Observable @MainActor IngestionDictationScreenModel`, a visible "Topic: <name>" label, a
   Submit button that calls `createKnowledgeSource` then `detectKnowledgeBits`, clears the field
   and shows a toast/banner ("Sent for review") on success so the learner can immediately keep
   dictating the next item — never a blocking spinner between dictated chunks.
4. Wire a "Add knowledge" (mic/pencil icon) entry point on `CurriculumDetailScreen`'s topic rows,
   next to the existing practice link, opening `IngestionDictationScreen(topic:)`.

## Files by scenario
| Scenario | Files |
|---|---|
| Open ingestion screen from a topic | CoursesScreen.swift (nav), new IngestionDictationScreen.swift |
| Submit dictated text, see confirmation, field clears | IngestionDictationScreen.swift, APIClient.swift |
| Submit failure shows an inline error, text is preserved | IngestionDictationScreen.swift |
| Submitting doesn't block further dictation (async, non-modal) | IngestionDictationScreen.swift |

## Done when
Builds clean via real `xcodebuild` (Swift 6 strict concurrency — don't regress), installs and
launches in the simulator, screenshot shows the ingestion screen reachable from a topic row with
a working text field and submit button. Cannot verify a real submit round-trip — prod API isn't
deployed; state that explicitly rather than claiming it was tested live.

## Guardrails for whoever implements this
- Do NOT `git checkout`/`git restore` anything in `Sources/` — the four `@MainActor` annotations
  already in place are real, uncommitted fixes for a Swift 6 concurrency build failure.
- New model class follows the same `@Observable @MainActor` pattern as the existing ones.
- Don't invent a topicId/moduleId param on `createKnowledgeSource` — the real endpoint doesn't
  accept one; keep the topic context purely client-side (screen title, navigation), per the
  Assumption above.

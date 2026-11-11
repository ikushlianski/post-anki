# Notes written in Anki cloze format

## Behaviour
- Any note that contains Anki cloze markup (`{{c1::answer}}`, `{{c1::answer::hint}}`, several numbers) is read the way an Anki import is read today: the markers are removed, so the model sees plain fact text.
- This applies to pasted, typed, file and chat notes too, not only notes whose import key starts with `anki:`.
- The blanks show what the learner wants to learn, so such a note never ends as "nothing worth a card". It always runs with the existing "return at least one card" override, the one Retry anyway uses.
- Cards are written by the model from the facts (direct questions by default). No verbatim cloze copies; this follows the existing decision in commit e81b130b ("Build cards from imported facts, not cloze copies").
- Text with no blank keeps going through the normal path, so trailing ads can still be dropped by the model.
- Triage, the duplicate gate and subject routing are unchanged.
- Inbox titles (web, Mac, iOS) show readable text: the hidden answer instead of `{{c1::…}}`. They are built on the server, so the clients need no change.

## Architecture
- One rule, "this note is cloze-shaped" = an Anki import or `hasClozeMarkup(rawText)`. It is decided in the extraction step that loads the source text, and both pipelines use it: the durable steps (`loadSourceText`, `writeOptionsFor`) and the legacy orchestrator (`generateItemsForSource`).
- Move the marker-stripping helper (`importedFactText`) into `packages/shared` next to `parseCloze`, so `attentionFirstWords` can reuse it. The API's `knowledge-bit-import-facts.ts` re-exports it, so existing imports keep working.
- No schema change and no new endpoint.
- Re-running the stuck notes uses the existing Retry anyway path (regeneration with "at least one"), which already lists both failed and nothing-extracted notes. The 14 production notes are retried by the user from the inbox after deploy, or by the existing regeneration endpoint, and only with the user's go-ahead.

## Files
- `apps/api/src/knowledge-bit/durable-extraction.steps.ts`: cloze-shaped check in `loadSourceText`, plus the `ankiImport` and `forceAtLeastOne` flags in `writeOptionsFor`.
- `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts`: the same rule.
- `apps/api/src/knowledge-bit/knowledge-bit-import-facts.ts`: re-export from shared.
- `packages/shared/src/cloze.ts` (or a new `cloze-fact-text.ts`) and `packages/shared/src/extraction-failure.ts`: `attentionFirstWords` strips the markers.
- `apps/api/src/knowledge-bit/ingestion-pipeline.md`: describe the rule as current state.

## Tests (business guarantees)
- `durable-extraction.steps.test.ts`: should strip cloze markers from a pasted note that is not an Anki import. Should ask for at least one card when the note contains a blank. Should leave a plain prose note's text and options unchanged.
- `detect-knowledge-bits.orchestrator.test.ts`: the same for the legacy path.
- `packages/shared` `extraction-failure.test.ts`: the inbox title should show the hidden answer instead of the cloze marker.
- Moved helper tests keep passing in shared.

## Manual test
1. Paste `РСЯ - это {{c1::рекламная сеть Яндекса}}, которая размещает контекстную рекламу` into a subject: cards appear (triage off: in the subject).
2. The inbox shows no `{{c1::` text in note titles.
3. After deploy, tap Retry anyway on one of the stuck Russian cloze notes: it yields cards.

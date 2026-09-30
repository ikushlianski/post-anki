---
type: scenarios
task: bit-background-text
---

## Detection

- [x] A bit whose meaning depends on nearby source context gets a non-null `background` from the detector.
- [x] A bit that's fully self-contained gets a null/omitted `background` — not every bit is forced to have one.
- [x] The detector still accepts between 1 and 20 bits per scan, unchanged from before.
- [x] A malformed detector response (missing `text` on a bit) is rejected by the zod schema, same as before.

## Persistence

- [x] `insertKnowledgeBits`/`insertKnowledgeBitsAndMarkDetected` persist each bit's `background` (or null) alongside its `body`.
- [x] Re-running detection on the same source still can't duplicate rows — ordinal/source idempotency unchanged.

## Retrieval

- [x] `listNextQuestionVariantsToAnswer` returns each row's `background` field (null when the bit has none).
- [x] `GET` next-batch endpoint's JSON response includes `background` with no route/controller change needed.

## Migration

- [x] The generated migration adds a nullable `background` column with no default — existing rows read back `null`, not an error.

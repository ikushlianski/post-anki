---
type: scenarios
task: bit-background-text
---

## Detection

- [ ] A bit whose meaning depends on nearby source context gets a non-null `background` from the detector.
- [ ] A bit that's fully self-contained gets a null/omitted `background` — not every bit is forced to have one.
- [ ] The detector still accepts between 1 and 20 bits per scan, unchanged from before.
- [ ] A malformed detector response (missing `text` on a bit) is rejected by the zod schema, same as before.

## Persistence

- [ ] `insertKnowledgeBits`/`insertKnowledgeBitsAndMarkDetected` persist each bit's `background` (or null) alongside its `body`.
- [ ] Re-running detection on the same source still can't duplicate rows — ordinal/source idempotency unchanged.

## Retrieval

- [ ] `listNextQuestionVariantsToAnswer` returns each row's `background` field (null when the bit has none).
- [ ] `GET` next-batch endpoint's JSON response includes `background` with no route/controller change needed.

## Migration

- [ ] The generated migration adds a nullable `background` column with no default — existing rows read back `null`, not an error.

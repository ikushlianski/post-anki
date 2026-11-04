# One bad text never blocks an embedding batch

## The ask

A single oversized (or otherwise rejected) text must not stop every other item in its embedding
batch from being indexed for search and chat grounding.

## What to do

Every embedding scan (knowledge bits, question variants, cards, facts, subjects) sends up to 200
texts in one request through the shared embeddings client. When the provider rejects the request
with a non-transient 4xx, which is what happens when one input is over the model's token limit,
the whole call throws, nothing in the batch is saved, and the next scan picks up the same 200 rows
and fails the same way, every time. Fix it inside the shared client so all callers benefit:

1. Cap each input text at a fixed character length before sending, sized to stay well under the
   embedding model's input token limit for both English and Russian text. Callers keep hashing
   the full original text, so a capped text is not re-embedded on every scan.
2. If a multi-item request still fails with a non-transient 4xx, retry each item on its own once
   and return results only for the items that succeed. Log each skipped item's id with the
   provider's message, and record the failure through the existing call-event path. A batch where
   every item fails, or a transient/5xx failure, still throws as today.

Callers already save only the ids they get back, so a partial result needs no caller change.
Check each caller to confirm that.

## Files to touch

`apps/api/src/shared/embeddings-client.ts` and its co-located test. Callers are in
`knowledge-bit/`, `cards/`, `facts/` and `subject-duplicate/`; read them, change them only if one
assumes a result for every input.

## Done when

Tests show an oversized text is capped before sending, a batch with one rejected item still returns
the other items' embeddings, an all-rejected batch and a 5xx still throw, and the retry budget for
transient failures is unchanged.

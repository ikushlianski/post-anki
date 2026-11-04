# Embedding scans report what they actually saved

## The ask

An embedding scan's "embedded" count matches the number of items it really saved, so the admin
view and the scan responses don't show items as indexed when they were skipped.

## What to do

The shared embeddings client can now return results for only some of a batch (it skips an item the
provider rejects). Several scans still report `embeddedCount` as the number of items they *sent*,
so a skipped item is counted as embedded and never shows up as a problem. Each scan that calls
`embedTexts` and reports an embedded count should count the results it got back and saved. If any
were skipped, it should also report how many, as an additive `skippedCount`-style field in its
shared result type when that type is an open object the web client tolerates. Otherwise just
correct `embeddedCount`.

## Files to touch

The embedding orchestrators in `apps/api/src/{knowledge-bit,cards,facts,subject-duplicate,source-duplicate}/`,
their result types in `packages/shared/src/` if a field is added, and co-located tests. Leave
`apps/api/src/shared/embeddings-client.ts` unchanged.

## Done when

Tests show a scan whose embeddings call returns fewer results than it sent reports the smaller
saved count, plus the skipped count where one was added.

---
type: scenarios
branch: ai-duplicate-detection
task: AI-assisted duplicate detection: surface likely-duplicate subjects (issue #63)
state: confirmed
updated: 2026-07-31
---
# Scenarios: AI-assisted duplicate detection

## Business Scenarios

SCENARIO 1: A human clicks "Scan for duplicates" and gets suggestions

A user on the home board clicks the scan button. The system embeds every `architecture-mentor` subject's name+description that doesn't already have a fresh cached embedding, compares all pairs by cosine similarity, and shows any pair above the similarity threshold as a pending suggestion ("Webdev" / "Programming — Web Development" style case).

What to verify:
- Only `architecture-mentor` subjects are compared — `language-practice` subjects (e.g. flashcard decks) are never proposed, matching `mergeSubjects`' own `kind_mismatch` rejection.
- A pair that already has a `pending` OR `rejected` row is never re-inserted — a rejected pair is a human judgment ("not a duplicate") and must not be re-surfaced by a later scan just because the embeddings still look similar.
- Zero subjects or one subject → scan completes with an empty result, no error.
- The suggestion is clearly presented as a suggestion (a reason/score), never phrased as already-true.

SCENARIO 2: Nothing changed since the last scan — a rescan costs nothing

A user clicks the scan button a second time with no subjects created, edited, or deleted since the last scan. No subject's `name + description` text has changed since it was last embedded.

What to verify:
- Zero embedding API calls are made — every subject's cached embedding (keyed by a hash of its current name+description) is reused.
- The comparison still runs (cosine similarity is free, pure computation) and returns the same pending suggestions as before (no duplicate rows).

SCENARIO 3: A subject's name or description changes — only that subject gets re-embedded

A user edits subject "Webdev"'s description, then clicks scan. Nine other unrelated subjects are untouched since the last scan.

What to verify:
- Only the changed subject is re-embedded (the hash of its name+description no longer matches the cached hash); the other nine are reused from cache.
- Any pending suggestion pair involving the changed subject that no longer clears the similarity threshold is left as-is (pending rows are never silently deleted just because a rescan's fresh comparison would no longer produce them — see Scope boundary) — the human still resolves it explicitly.

SCENARIO 4: A human accepts a suggestion and picks which subject survives

A user sees a pending pair ("Webdev" / "Programming — Web Development") and clicks Accept. The UI asks (or defaults, per Decisions) which of the two survives, then calls the existing `mergeSubjects` action.

What to verify:
- The human — not the AI — chooses which subject is the merge target and which is absorbed; the AI's output never encodes an implied direction.
- `targetSubjectId` in the accept request must equal one of the suggestion's own `subjectAId`/`subjectBId` — a mismatched id is rejected with a 400, never silently merged against an unrelated third subject.
- On accept, `mergeSubjects(targetId, sourceId, resolvingSuggestionId)` runs exactly as it already does for a manual merge (curricula + domain nodes reassigned, source subject deleted, audit log row written) — plus, in that same transaction, marks this specific suggestion `accepted`.
- The suggestion row is marked `accepted` and removed from the pending list — atomically with the merge itself, never as a separate write that could leave the row stuck at `stale` if something fails in between.
- Every other pending duplicate-suggestion pair referencing the now-deleted source subject is invalidated (resolved as `stale`, not shown) in the same transaction as the merge — it can never point at a subject row that no longer exists.
- Resolving a suggestion that is no longer `pending` (already accepted or rejected, e.g. a duplicate/late-arriving request) returns a clear "already resolved" response rather than flipping its status again.

SCENARIO 5: A human rejects a suggestion

A user sees a pending pair and clicks Reject — the two subjects really are unrelated (e.g. "Rust" and "Ruby", a real near-neighbor false positive from embedding similarity).

What to verify:
- The pair is marked `rejected`, resolvedAt is set, and it disappears from the pending list — both subjects are untouched.
- The rejected row is never deleted (kept as history), matching `resolvePrioritySuggestion`'s own precedent.

SCENARIO 5b: A human deletes a subject that has a pending duplicate suggestion

A user deletes a subject (via the pre-existing "Delete subject" control, unrelated to this feature) that is one side of a still-pending duplicate suggestion.

What to verify:
- The pending suggestion row is invalidated to `stale` in the same transaction as the delete — never left pointing at a subject id that no longer exists.
- The suggestions panel never renders a card it can't resolve a name for.

SCENARIO 6: The embedding API call fails

The scan button is clicked but the OpenRouter embeddings endpoint returns an error, times out (bounded at 45s via `AbortController`, matching `tech-research-grounding.ts`'s precedent), or hangs (network issue, quota, bad model id) after the bounded retry budget is exhausted.

What to verify:
- The failure is bounded on both axes — at most 2 retries (`p-retry`) AND a 45s per-request timeout, never an unbounded loop and never an indefinitely busy button.
- The failure propagates as a clear error to the human (mirrors `triggerDomainPriorityReview`'s no-silent-fallback posture) — the button shows a failure state, not a silent no-op and not a false "no duplicates found."
- No partial/corrupt embedding cache write — a subject's cached embedding+hash is only updated after a successful call for that subject.

SCENARIO 7: More subjects need a fresh embedding than the per-scan embedding cap allows

A user has grown their subject list past the cap the scan enforces on the *embedding* call per invocation (cost bound — see Decisions).

What to verify:
- The scan does not silently make an unbounded number of embedding calls in one invocation — it embeds at most the capped number of subjects needing a fresh embedding this run, never-yet-embedded subjects prioritized first, and the response/UI makes it visible that the embedding step was partial ("embedded 200 of 340 subjects needing a refresh").
- The comparison step is NOT capped — every subject with any cached embedding (fresh or reused) is compared, so a real duplicate pair among older, already-cached subjects is never permanently excluded just because newer subjects are still backlogged for embedding (corrected after red-team review — see architecture.md's "Cap bounds the embedding call only, never the comparison").
- No pairwise LLM comparison is ever introduced regardless of subject count (Decision #2 from the wishlist entry) — the cap bounds only the embedding call, it never triggers a fallback to a different, more expensive comparison mechanism.

## Technical/Architectural Scenarios

SCENARIO 8: Concurrent scan and merge

One browser tab triggers a scan while, moments later, a subject involved in one of its new suggestions gets merged away through the pre-existing manual "Merge into…" control (unrelated to this feature) before the human resolves the suggestion.

What to verify:
- Resolving (`accept`/`reject`) a suggestion whose subject id no longer exists returns a clean `not_found`-style error, not a crash or a silent wrong write — mirrors `mergeSubjects`' own `not_found` handling for a stale id.

SCENARIO 8b: Double-clicked scan button, or two browser tabs, race on the same pair

A human double-clicks "Scan for duplicates" (or has it open in two tabs) such that two scans run close enough together that both read "no pending row yet" for the same subject pair before either has inserted its suggestion.

What to verify:
- Only one pending suggestion row ever exists for a given pair at a time — the second concurrent insert hits the DB-level partial unique index (`subjectAId`, `subjectBId` WHERE `status = 'pending'`) and is treated as a no-op, not a duplicate card in the panel and not an unhandled error surfaced to the human.

SCENARIO 9: Scan invocation is traced

A scan runs (success or failure).

What to verify:
- A tracing span records subject count considered, embedded count, cache-reused count, and pairs surfaced — visible in Langfuse the same way `startTracingSpan` is already used elsewhere, even though this call bypasses Mastra's own agent tracing (it's a raw HTTP call, not `agent.generate()`).

---
type: debrief
branch: main
feature: ai-duplicate-detection
updated: 2026-07-31
verdict: sound
diagram-format: ascii
---

# Architecture Review: AI-assisted subject duplicate detection (issue #63)

## What was reviewed

An on-demand "Scan for duplicates" button on the home page that embeds every
`architecture-mentor`-kind subject's name+description via OpenRouter, compares them by cosine
similarity, and persists near-duplicate pairs as suggestions a human accepts (triggering the
existing `mergeSubjects`) or rejects. Already merged into `main` (commit `463b5a5`, plus a
follow-up fix at `365b058`) — this review runs directly against the main checkout.

## Documentation found

Same unusually complete pattern as the prior three items this run: `.planning/
ai-duplicate-detection/` (spec.md, scenarios.md, architecture.md, todo.md, all `state: confirmed`
except todo.md which stays `open` by its own template). The plan went through a `grill-plan-ie`
red-team pass that caught and fixed four real design problems before build — a comparison-set cap
bug, a check-then-act race, a non-atomic accept, and a dangling-reference gap on plain delete. Read
in full and cross-checked against the shipped code below — no drift found; every one of the four
fixes is actually present as written.

## As-built architecture

```
 apps/web/src/routes/index.tsx
 "Scan for duplicates" button
             │
             ▼ POST /subject-duplicate-scans
 subject-duplicate.controller.ts
             │
             ▼
 subject-duplicate.orchestrator.ts — triggerSubjectDuplicateScan()
   1. list all architecture-mentor subjects
   2. selectSubjectsForScan(cap=200) → { toEmbed, reused }  (cap bounds the
      PAID CALL only — comparison always runs over every subject with any
      cached embedding, fresh or reused, never just this run's toEmbed ✚)
             │
             ▼ (only if toEmbed.length > 0)
 embeddings-client.ts → real fetch to OpenRouter /embeddings
   p-retry(2), 45s AbortController timeout, maps results by response
   `index` field (not array position) — an enforced invariant, not
   a trusted assumption
             │
             ▼
 updateSubjectEmbedding() — writes embedding+hash back onto subjects table
             │
             ▼
 findDuplicatePairs() (packages/core, pure) — cosine similarity ≥ 0.86
             │
             ▼
 subject-duplicate.repo.ts: insertDuplicateSuggestionIfNew()
   DB partial unique index on (subjectAId, subjectBId) WHERE status='pending'
   — closes the concurrent-double-scan race a plain app-level check couldn't ⚠(closed)
             │
             ▼
 duplicate-scan-panel.tsx — pending cards, Accept (inline "keep: [ ▾]"
 picker) / Reject
             │
             ▼ Accept                                    ▼ Reject
 mergeSubjects(target, source,                subject-duplicate.controller.ts
   resolvingSuggestionId)                      sets status -> "rejected"
   — ONE transaction: reassign curricula/
   domain-nodes, delete source, stale-sweep
   every OTHER pending suggestion referencing
   source, then overwrite THIS ONE row to
   "accepted" — atomic, not two sequential
   writes ✚ (closes the crash-window gap
   grill-plan-ie found)
```

Entry point is a single button; the only recurring cost is the embedding call, and it only fires
on an explicit click — no cron, no per-create trigger, matching the fixed cost-awareness
constraint this item was scoped under.

## Verdict

**Sound, and unusually well-defended for a first cut of an AI feature.** This is the first item
in this run's queue that carries genuine recurring-cost risk (an LLM-adjacent embedding call), and
the design treats that correctly: the cap is a real ceiling on the paid call only, retries are
bounded (2, not unbounded), there's a hard 45s timeout, and a failure propagates as a visible error
rather than retrying silently forever. The suggestion is always a suggestion — nothing in this
codepath can merge or delete a subject without an explicit human Accept, which is the correct
non-negotiable boundary for AI output feeding a destructive action.

I verified the four grill-plan-ie fixes are actually in the shipped code, not just documented as
intended:
1. **Cap bounds the embedding call only.** Confirmed in `subject-duplicate.orchestrator.ts:82-90` —
   the comparison set is built by re-deriving from the original subject read merged with this run's
   fresh results, not from `toEmbed` alone. A subject cut off by the cap still contributes its old,
   cached embedding to the comparison.
2. **DB-level race guard, not app-level check-then-act.** Confirmed the partial unique index on
   `(subjectAId, subjectBId) WHERE status = 'pending'` in `schema.ts`, mirroring the codebase's own
   existing precedent (`curriculum_structure_turns_pending_assistant_unique`) rather than inventing
   a new mechanism.
3. **Atomic accept.** Confirmed in `subject.repo.ts`'s `mergeSubjects` — the stale-sweep and the
   accepted-row overwrite both happen inside the same transaction as the merge itself, closing the
   crash window a two-sequential-writes design would have left open.
4. **Plain delete also invalidates.** Confirmed `deleteSubject()` runs its own delete and the
   stale-invalidation sweep inside one transaction, not just `mergeSubjects`.

**One real regression was caught and fixed during this review cycle, not a silent gap:**
`content-hash.ts` originally used `node:crypto`'s `createHash`, which broke every page across the
app importing `packages/core`'s root barrel (curriculum, domain-map, lecture, probe, practice) via
Vite bundling a Node-only import into the browser. This was found by `/review-playwright`, fixed
immediately (swapped to a dependency-free FNV-1a hash — this is a cache-invalidation fingerprint,
not a security hash, so no cryptographic strength was actually needed), and independently
re-verified: a clean production `vite build` with zero externalization warnings, the full 84-test
regression sweep back to its known-good baseline, and the previously-broken pages confirmed working
via real browser navigation, not just a successful build.

**The one real tradeoff, named plainly:** the similarity threshold (0.86) is an untuned constant,
and real embeddings on the plan's own canonical example ("Webdev" vs. "Programming — Web
Development") score 0.812 — just below it, confirmed during e2e verification. This isn't a design
flaw so much as an unresolved calibration question the plan explicitly flagged as unvalidated; it
means the feature's headline motivating case doesn't yet clear its own bar with real data, which is
worth knowing before anyone judges the feature "not working" from that one example.

**Unresolved, not blocking:** whether the `startTracingSpan` call in the orchestrator actually
produces a Langfuse trace could not be empirically confirmed (real scans ran, no trace appeared
after polling) — but the code matches the one existing raw-fetch tracing precedent exactly
(`probe-grounding.ts`), so this reads as a pre-existing tracing gap possibly affecting that code
path too, not something this feature introduced.

## Questions a reviewer would ask

1. Given the real 0.812 similarity score on the plan's own canonical duplicate example, is 0.86
   too high a bar for this embedding model on short name+description text, and is there a cheap way
   to validate a better threshold against a handful of the app's real subjects before shipping this
   more broadly?
2. The embedding cap is 200 subjects per scan — at what subject count does the *comparison* step
   (O(n²) in-process cosine similarity, deliberately chosen over pgvector per Decision #8) start to
   matter for scan latency, and is there a plan to notice that before it becomes a real problem?
3. `embedSubjectTexts` throws after its retry budget is exhausted and the orchestrator doesn't
   catch it — what does the user actually see when a scan fails mid-flight, and does the panel
   distinguish "no duplicates found" from "the scan itself failed"?
4. The Langfuse tracing gap — is it worth a small, dedicated investigation (a minimal repro script
   outside this feature) given it may silently affect the one other raw-fetch tracing precedent
   this codebase has (`probe-grounding.ts`), which predates this session?
5. `subject_duplicate_suggestions` has no cap on how many pending rows can accumulate if a human
   never resolves them — does the panel handle dozens of unresolved suggestions gracefully, or was
   this only tested with a handful?
6. The `node:crypto` bundling bug shipped once already in this same feature — is there a
   lint rule or CI check (e.g. a build step that asserts `apps/web`'s bundle has no Node built-ins)
   that would catch a repeat of this specific failure mode before it reaches `main` again?


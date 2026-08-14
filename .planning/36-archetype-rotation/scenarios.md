---
type: scenarios
branch: 36-archetype-rotation
task: "Same concept is always probed from a fresh angle — LRU archetype rotation (#36)"
state: planned
updated: 2026-08-14
---

# Scenarios: LRU archetype rotation per concept (#36)

**37 acceptance criteria.** A new pure module (fully unit-tested), one sidecar table, one new
column, two new repo files' worth of query/write functions, and wiring through three call sites
that converge on one existing function — not padded, this is the real shape given three
independent surfaces (push, `startProbe`, Socratic sessions) share one generation choke point but
have different session semantics.

No Playwright plan — this is entirely server-side generation/selection logic with no new UI
surface; the observable difference (which framing a question takes) is not something a browser
test is positioned to assert better than a vitest/integration test reading the actual archetype
value.

## Master acceptance criteria list (34 items, each independently walkable)

**`archetype.ts` (packages/shared) — the enum**

1. `archetypeSchema` is a 5-value zod enum in canonical order:
   `scenario_based, compare_contrast, design_challenge, cross_cutting, debug_challenge`.
2. `ARCHETYPE_CANONICAL_ORDER` is derived from `archetypeSchema.options` — not a second
   hand-written array — so the enum declaration is the single source of truth for tiebreak order.

**`archetype-rotation.ts` (packages/core) — the pure selector**

3. `zeroArchetypeLastUsedAt()` returns all 5 archetype keys mapped to `null`.
4. `normalizeApplicableArchetypes([])` returns the full canonical 5-item set (least-restrictive
   fallback for a failed/empty classification).
5. `normalizeApplicableArchetypes([a, a, b])` dedupes to `[a, b]`.
6. `selectArchetype([x], anyLastUsedAt)` always returns `x` — the single-applicable-archetype edge
   case suspends exclusion entirely, regardless of `x`'s own `lastUsedAt` value.
7. `selectArchetype(applicable, allNull)` (first session — nothing ever used) returns the
   applicable candidate earliest in canonical order — e.g. given
   `[compare_contrast, design_challenge, cross_cutting]` (Scenario-based and Debug challenge
   filtered out), returns `compare_contrast` (canonical position 2, earliest of the three present).
   This is the issue's own worked first-session example.
8. `selectArchetype` with one candidate having a real timestamp and the rest `null`: the
   non-null one is excluded (it's the most recent), one of the `null` ones is selected — verified
   with a 3+ candidate set so "excluded" and "selected" are provably different candidates.
9. `selectArchetype` with all 5 candidates having distinct real timestamps: the one with the
   MAXIMUM timestamp is excluded; among the remaining 4, the one with the MINIMUM timestamp is
   selected.
10. `selectArchetype` tiebreak on an exact-timestamp collision between two non-excluded
    candidates: canonical order decides, earliest wins — proven with a case where the
    canonical-earlier candidate is NOT the array-earlier one (order-independence of the input
    array itself).
11. `selectArchetype` uses full timestamp comparison, not date-truncation: two candidates on the
    same calendar date but different times are NOT treated as tied — the chronologically older one
    is selected over canonical order, proven with a case where canonical order would pick the
    wrong one if dates were truncated.
12. `selectArchetype` never mutates its `lastUsedAt` input (pure function, asserted via
    reference/deep-equality check before and after the call).

**Schema — `apps/api/src/db/schema.ts`**

13. New table `gap_archetype_state`: `id`, `gap_id` (unique index), `applicable_archetypes`
    (nullable jsonb array), `archetype_last_used_at` (not-null jsonb map), `created_at`,
    `updated_at`. One migration covers this table plus AC 14.
14. `socratic_turns` gains one new nullable `archetype` text column, in the same migration as
    AC 13 — proven by one migration file touching both.
15. No other existing table or column changes shape. `gaps`, `gap_mastery`,
    `probe_session_questions` appear in no diff.

**`mentor.agent.ts` / `probe-question.ts` — classification and framing instructions**

16. `generatedQuestionSchema` gains one new optional field, `applicableArchetypes: Archetype[]`.
    Existing fields (`prompt`, `options`, `correctAnswerIndex`) are unchanged.
17. `ASK_INSTRUCTIONS` gains the archetype reference block (5 archetypes + the 3 filtering rules,
    verbatim from the issue body) as static, always-present instruction text — it does not vary
    per call.
18. For `mode === "quick_test"`, no archetype-related prompt line is ever added and
    `applicableArchetypes` is never requested — proven by the quick_test branch of the per-call
    prompt builder appearing unchanged.

**`probe.service.ts` — selection wiring, the shared choke point**

19. `generateQuestion` only enters archetype logic when `mode === "socratic" && gap !== null` — the
    opening question (`gap === null`) and `quick_test` mode are both unaffected, proven by two
    dedicated no-op test cases.
20. **First-ever socratic question for a gap** (no `gap_archetype_state` row): the prompt instructs
    classification AND forces the Scenario-based framing for this one question. On success,
    `recordArchetypeClassification` is called with the normalized applicable set.
21. Within AC 20, when the normalized applicable set actually includes `scenario_based`,
    `archetypeLastUsedAt.scenario_based` is stamped to `now` in the same insert.
22. Within AC 20, when the normalized applicable set does NOT include `scenario_based` (rare —
    classified as inapplicable to this concept), the row is still inserted with the real
    applicable set, but `archetypeLastUsedAt` stays all-null — no false stamp for an archetype
    that was used but isn't actually in rotation for this concept.
23. **Row exists, already classified:** no classification instruction appears in the prompt at
    all; `selectArchetype` runs in-process (no LLM call) against the cached applicable set and
    `archetypeLastUsedAt`; the prompt gains the "Framing archetype for this question: `{Name}`"
    line naming the chosen one.
24. On a successful generation in the "already classified" case, `recordArchetypeUsage` updates
    only the chosen archetype's timestamp — the other 4 keys in `archetypeLastUsedAt` are
    unchanged, proven by asserting the full map before/after.
25. On agent failure (the existing `fallbackQuestion` degraded path, `probe.service.ts:299-303`),
    NEITHER `recordArchetypeClassification` NOR `recordArchetypeUsage` is called — no state is
    written for a question that was never actually shown with archetype framing.
26. `ProbeQuestion.archetype` carries the chosen archetype (or `null`) back to the caller;
    for `quick_test` mode and the opening question, it is always `null`.

**Same-session continuation — `socratic.service.ts` + `socratic.repo.ts`**

27. `makeTurnForGap` always passes `session.id` into `buildProbeQuestionForGap` as
    `socraticSessionId`; `push.controller.ts`'s call and `startProbe`'s direct
    `buildQuestion` call never pass one — proven by a diff-shape check on both call sites.
28. `getMostRecentTurnArchetype(sessionId, gapId)` returns the archetype of the most recent turn
    for that exact (session, gap) pair, or `null` if this is the first turn for that gap in that
    session.
29. When `getMostRecentTurnArchetype` returns non-null (the retry-branch case — same gap, same
    still-active session), `generateQuestion` reuses that archetype verbatim: no `selectArchetype`
    call, no `recordArchetypeUsage` write, no classification instruction even if somehow
    unclassified.
30. The newly-inserted `socratic_turns` row always carries the archetype that framed its own
    question (from either the fresh-selection or the continuation path) in its `archetype` column,
    so a LATER retry turn on the same (session, gap) can find it via AC 28.
31. `startProbe` calling `nextGapToProbe` and resurfacing the SAME still-open gap across two
    independent (no session id) calls gets a freshly LRU-selected archetype each time — proven as
    documented, intentional behavior (not a bug), matching push's own always-fresh selection.

**Context block — `socratic.repo.ts`**

32. `getRecentSessionExchangesForGap(gapId, excludeSessionId, 3)` returns at most 3 distinct
    sessions' worth of turns for that gap, most-recent-session-first, excluding
    `excludeSessionId`, and excludes a gap that has zero prior Socratic-session turns (returns
    `[]`) — including one that has only ever been probed via push/`startProbe`.
33. `getRecentSessionExchangesForGap` genuinely resolves 3 distinct SESSIONS, not 3 turns —
    proven with a gap that has 5+ turns all within a single session plus 2 turns in an older
    session: the result has exactly 2 session groups (not one group truncated to 3 turns), and the
    older session's turns are still present in full.
34. When the returned exchange list is non-empty, `generateQuestion`'s prompt includes the labeled
    "Prior sessions discussing this concept" block; when empty, no such block appears — proven with
    both a gap that has Socratic history and one that has only push history.

**Cascade delete — `gap-archetype.repo.ts`**

35. `deleteGapArchetypeStateForGapIds(gapIds, tx)` deletes every `gap_archetype_state` row for the
    given gap ids, mirroring `deleteGapMasteryForGapIds`'s exact shape.
36. It is called alongside the existing `deleteGapMasteryForGapIds` call, in the same transaction,
    at all three reachable call sites: `curriculum.repo.ts:445`, `curriculum.repo.ts:645`,
    `module.repo.ts:121` — proven by a diff touching exactly those three sites plus the new file.
    `topic.repo.ts:198`'s equivalent call is explicitly NOT added (fenced file) — proven by that
    file appearing in no diff, and logged as a disclosed follow-up rather than silently skipped.

**Cross-cutting no-diff proof**

37. `apps/api/src/probe-session/probe-session.generate.ts` (the MCQ batch generator) and
    `push.controller.ts`'s own body appear in no diff beyond typechecking against the additive
    `ProbeQuestion.archetype` field — no logic in either file changes.

---

## SCENARIO 1 — A concept's very first probing question classifies itself and starts the rotation

**Given** a gap with no `gap_archetype_state` row, probed for the first time via a Socratic session
**When** `generateQuestion` runs
**Then** the prompt asks the AI to both classify applicable archetypes AND write this question in
the Scenario-based framing
**And** on success, a new `gap_archetype_state` row is inserted with the classified applicable set
and `archetypeLastUsedAt` stamped for `scenario_based` only if it's actually in that set.

Covers AC 20, 21, 22.
Proof: `probe.service.test.ts` (new/extended), mocking the agent's structured output.

## SCENARIO 2 — A concept's second question rotates to a different archetype with no extra LLM call

**Given** the gap from Scenario 1, now with a cached applicable set of
`[scenario_based, design_challenge, cross_cutting]` (Compare/contrast and Debug challenge filtered
out) and `archetypeLastUsedAt.scenario_based` set from last time
**When** the concept is probed again in a NEW session (no continuation match)
**Then** `selectArchetype` excludes `scenario_based` (most recently used) and picks
`design_challenge` (canonical position 3, earliest of the two remaining) with zero classification
instruction in the prompt
**And** after success, only `archetypeLastUsedAt.design_challenge` changes.

Covers AC 7, 23, 24.
Proof: `archetype-rotation.test.ts` (the pure selection) + `probe.service.test.ts` (the wiring not
re-classifying).

## SCENARIO 3 — A learner's retry on the same gap, same session, keeps the same framing

**Given** an active Socratic session where the learner just got gap G wrong on a Scenario-based
question
**When** `answerSocraticSession`'s retry branch calls `makeTurnForGap` again for the same gap G in
the same session
**Then** `getMostRecentTurnArchetype` finds the just-used `scenario_based` archetype and it's reused
verbatim — no re-roll, no LRU write
**And** the conversation reads as one continuous framing, not a jarring mid-conversation angle
switch.

Covers AC 28, 29, 30.
Proof: `socratic.service.test.ts`, and the paired integration test (SCENARIO 6).

## SCENARIO 4 — Daily push and `startProbe` share the same rotation state as Socratic sessions, but with no memory of exchange text

**Given** a gap that has been probed twice via Socratic sessions (rotating through 2 of its 3
applicable archetypes) and is now selected as today's daily push
**When** `handleDailyPush` calls `buildProbeQuestionForGap` with no `socraticSessionId`
**Then** the LRU selection correctly excludes the most-recently-used archetype from those two prior
Socratic sessions and picks the third
**And** the prompt carries NO "prior sessions" context block, since `getRecentSessionExchangesForGap`
only reads `socratic_turns` and this push answer, once submitted via `submitProbe`, persists no
exchange text of its own either — a disclosed, not hidden, limitation.

Covers AC 27, 31, 32 (the push-only-history empty case), 34.
Proof: integration test seeding real `socratic_turns` rows then calling the push path.

## SCENARIO 5 — A single-applicable-archetype concept never rotates, but the failure path never fakes progress

**Given** a gap classified with exactly one applicable archetype (`design_challenge`) — e.g. a
narrow conceptual topic where the model judged the other 4 don't fit
**When** the concept is probed across 5 consecutive sessions
**Then** every one of the 5 questions uses `design_challenge`, `archetypeLastUsedAt.design_challenge`
updates each time, and no exclusion logic ever runs
**And** separately, on a session where the `mentorAsk` agent call throws/returns no object, the
`fallbackQuestion` path fires and neither the classification nor usage write happens — the next
real attempt starts clean.

Covers AC 6, 25.
Proof: `archetype-rotation.test.ts` (the single-item case) + `probe.service.test.ts` (the failure
no-write case).

## SCENARIO 6 — Integration: cross-surface LRU sharing and same-session continuation against real Postgres

**Given** a real topic with one gap, no `gap_archetype_state` row
**When**, in sequence: (1) a Socratic session opens and probes the gap (classify + Scenario-based),
(2) the learner answers wrong and retries within the same session (continuation), (3) that session
ends, (4) a NEW Socratic session probes the same gap again, (5) `startProbe` is called directly for
the same topic and resurfaces the same still-open gap
**Then** step 2's archetype exactly matches step 1's (continuation, no LRU write in between); step 4
excludes step 1's archetype and picks the next in canonical order among the applicable set; step 5,
having no session id, freshly LRU-selects again from whatever `archetypeLastUsedAt` looks like after
step 4 — proving state is shared across all three surfaces via the one `gapId`-keyed table.

Covers AC 27, 28, 29, 31 end-to-end; the real no-regression proof for cross-surface sharing.
Proof: new `apps/api/src/probe/archetype-rotation.integration.test.ts`, mirroring
`gap-mastery-concurrency.integration.test.ts`'s harness (real Postgres, mocked Mastra agent).

## SCENARIO 7 — MCQ paths are provably untouched

**Given** a topic-scope probe-session quiz batch generation (`probe-session.generate.ts`) and a
`quick_test`-mode single question (`probe.service.ts`)
**When** each runs
**Then** neither reads nor writes `gap_archetype_state`, neither ever sees an archetype-related
prompt line, and `probe-session.generate.ts` appears in no diff at all.

Covers AC 18, 37.
Proof: code-review-time no-diff check (mirrors #96's own AC 6/16 precedent) plus the existing
`quick_test` test coverage continuing to pass unmodified.

## SCENARIO 8 — Deleting a topic/module/curriculum doesn't leak archetype state (with one disclosed exception)

**Given** a topic with gaps that each have a `gap_archetype_state` row
**When** that topic's parent module or curriculum is deleted (`curriculum.repo.ts`'s two cascade
paths, or `module.repo.ts`'s own delete)
**Then** `deleteGapArchetypeStateForGapIds` runs in the same transaction as
`deleteGapMasteryForGapIds` and the `gaps` delete itself, leaving no orphaned
`gap_archetype_state` rows
**And** deleting a topic DIRECTLY (`topic.repo.ts`'s `deleteTopic`, a fenced file for this task)
does NOT get the equivalent call — its `gap_archetype_state` rows are left orphaned, matching
exactly the class of leak `.planning/gap-mastery-cascade-delete` once documented for `gap_mastery`
itself, disclosed here as a follow-up rather than silently accepted as solved.

Covers AC 35, 36.
Proof: integration test asserting zero remaining `gap_archetype_state` rows after the
module/curriculum cascade paths, and a companion assertion that a row DOES survive a direct
`deleteTopic` call — proving the gap is real and understood, not accidentally already closed.

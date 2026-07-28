---
type: discussion
branch: phrase-bank-concurrency-fix
task: phrase-bank-concurrency-fix
state: n/a — this is a log, not a gated plan artifact; the 5 gated files are spec.md, scenarios.md,
  architecture.md, playwright.md, state-fixtures.md (all state: confirmed)
updated: 2026-07-28
---

# Discussion log — Phrase-bank concurrency and data-integrity fix

Unattended planning run. No human interview happened; every fork below was resolved against the
project's recommended-default rule and is also recorded in `spec.md`'s "Decisions made
autonomously." This file is the self-grill pass (`/grill-me` discipline) an independent reviewer
would normally run against the drafted plan, done here by re-examining the plan critically before
confirming it.

## Self-grill questions and answers

**Q1 — Does holding the advisory lock across `linkOrCreateTargetPhrases`'s sequential (not
`Promise.all`, deliberately) DB round-trips meaningfully lengthen the lock's hold time under real
contention?**
Yes, proportionally to how many *new* target phrases a batch introduces (bounded by `BATCH_SIZE =
10`, and typically far fewer — most items either echo a due entry or introduce no new phrase at
all). Given this app's actual traffic profile (single owner, occasional two-tab overlap, not
concurrent multi-user load — confirmed via `project.json`'s "single-owner local app" description),
this is an acceptable, low-risk cost. Not escalated; recorded as an accepted tradeoff in
`architecture.md`.

**Q2 — If `agent.generate` throws or returns no structured output, do we still attempt to open the
locked transaction?**
No — the existing `if (!result.object) throw ...` check happens before any of the new
transaction/lock code, unchanged from today. The lock is only ever acquired once there's real work
to write.

**Q3 — Does switching `getPhraseBankEntriesByIds` to a `FOR UPDATE` read change the existing
"entry not found → log and skip" behavior in `applyPhraseBankAttempts`?**
No — a row absent from the result set behaves identically whether the query used `FOR UPDATE` or
not; `entriesById.get(...)` still misses the same way, and the existing `log.warn(...,
"phrase_bank_entry_not_found")` path is untouched. Confirmed by reading
`grade-attempts.orchestrator.ts` lines 111-117 — this logic is unconditional on how the entries map
was populated.

**Q4 — Does transactionalizing grading's phrase-bank write loop interact with the separate,
explicitly out-of-scope issue `review.md` named (phrase-bank bookkeeping not wrapped in its own
error handling, `insertAttempts` can commit before a later throw)?**
`insertAttempts` still runs before and outside the new transaction, exactly as today — its commit is
unaffected by whatever happens in the phrase-bank transaction that follows. One small, not-load-
bearing side effect: the phrase-bank writes for one grading call are now atomic as a *group*
(all-or-nothing within their own transaction) where before they were a bare sequence of independent
statements that could partially apply if one threw mid-loop. This is a strict improvement, not a
regression, but it does not fix the named issue (a throw anywhere in `applyPhraseBankUpdates` still
produces a 500 on an already-graded, already-saved-`attempts` request) — left correctly out of
scope, not silently half-fixed.

**Q5 — Could the generate-path's advisory lock and the grade-path's row-level `FOR UPDATE` lock ever
deadlock against each other if a generate and a grade happen concurrently?**
No — Postgres advisory locks and row-level locks are different lock objects/namespaces entirely; a
transaction holding `pg_advisory_xact_lock(hashtext(...))` and a transaction holding a `FOR UPDATE`
row lock on `phrase_bank_entries` cannot block each other unless they also contend for the same kind
of lock, which they don't (generate never takes a row lock, grade never takes an advisory lock).
Confirmed by reasoning through the two write paths in `architecture.md`; no code change needed as a
result of this question, it's a design property already true of the chosen approach.

**Q6 — `hashtext(subjectId || level || pack)` returns a 32-bit int; could two different
subject/level/pack tuples collide and serialize against each other unnecessarily?**
Yes, in principle — a hash collision would make two *unrelated* scopes take turns unnecessarily.
This is always safe (over-serialization, never incorrect data) and matches `review.md`'s own
proposed mechanism verbatim; not escalated, since the failure mode is "occasionally a hair slower,"
never "wrong data."

## Second-pass red-team findings (post-draft review, before final confirmation)

A second, more adversarial pass over the drafted `scenarios.md`/`spec.md` surfaced four issues, two
of which would have let a green test pass without actually proving its claim. All four are folded
into `scenarios.md`, `spec.md`, and `architecture.md` before confirmation — recorded here rather
than silently overwritten, since a wrong-then-corrected draft is useful history (matching this
project's own established convention from `phrase-bank-mastery/spec.md`).

**Finding 1 (blocking, fixed) — S2/S3 as originally drafted could pass vacuously.** The original
Acceptance text asserted "20 phrases rows total" and "no duplicate sequence numbers," which does
technically require both concurrent calls to have succeeded — but nothing stopped a careless
implementation from firing the two calls via `Promise.allSettled` (or swallowing one rejection) and
then asserting "no duplicates" over whatever subset actually landed, which is vacuously true if only
one of the two calls succeeded. **Fixed:** `scenarios.md` and `spec.md`'s DoD now explicitly require
asserting both `generatePhraseBatch` calls resolve successfully (`Promise.all`, not
`Promise.allSettled`; no rejection swallowed) as its own named assertion, before the row-count/no-
duplicates SELECT even runs. A rejection from either call is itself a test failure, not something to
route around.

**Finding 2 (design integrity, added to architecture.md/spec.md) — every DB call inside the locked
transaction must take the transaction executor explicitly.** The connection pool caps at 4
(`apps/api/src/db/client.ts`). If any function called from inside `getDb().transaction(async (tx) =>
{...})` accidentally falls back to its default `getDb()` parameter instead of the passed `tx`, that
call would try to check out a *second* pooled connection while the first transaction still holds the
advisory lock and its own connection — under real concurrency this is a pool-starvation risk, not
just a correctness bug. Added as an explicit implementation-time requirement: every DB call inside
the transaction body takes `tx` explicitly; a default-parameter fallback inside the locked path is a
bug to catch in review, not an acceptable convenience.

**Finding 3 (minor, added to architecture.md) — exact `pg_advisory_xact_lock` call form.**
`hashtext(text)` returns `int4`; `pg_advisory_xact_lock` has both a `(bigint)` and an `(int4, int4)`
overload. Implicit widening to `bigint` works, but the exact call form
(`pg_advisory_xact_lock(hashtext($1 || $2 || $3)::bigint)`) is now named explicitly in
`architecture.md` so this resolves unambiguously in the generated SQL rather than surfacing as a
runtime surprise during implementation.

**Finding 4 (blocking, verified, fixed) — S4's seeded sequence numbers were asserted without reading
the deriver.** The original draft chose `sequenceNumber` 1 and 9 for the two concurrent attempts "to
satisfy the non-adjacency rule" without having actually read
`packages/core/src/phrase-bank/phrase-bank.ts`. Read on this pass: adjacency is
`attempt.sequenceNumber === entry.lastCorrectAtSentenceCount + 1` (line 104); `masteryStage`/
`correctCountInCycle` only increment when *not* adjacent (lines 106-107); `MASTERY_THRESHOLD = 3`
(line 6). Traced both possible race orderings by hand against a seed of `status: "practicing"`,
`masteryStage: 0`, `correctCountInCycle: 0`, `incorrectCountInCycle: 0`,
`lastCorrectAtSentenceCount: null`, `scheduledForSentenceCount: null`:
  - Whichever of the two concurrent attempts (sequence 1 or sequence 9) is processed first sees
    `lastCorrectAtSentenceCount: null`, which is never adjacent (`null !== priorSeq + 1`) — so it
    always increments to `masteryStage: 1, correctCountInCycle: 1`.
  - The second-processed attempt then sees the *first* attempt's `lastCorrectAtSentenceCount`
    (either 1 or 9, depending on which order the `FOR UPDATE` lock resolved). Adjacency would
    require its own `sequenceNumber` to equal that value `+ 1` — i.e. sequence 1 would need
    `lastCorrectAtSentenceCount === 0` to be "adjacent" to it (never true, since the only possible
    prior value here is 9), and sequence 9 would need `lastCorrectAtSentenceCount === 8` (never
    true, since the only possible prior value is 1). **Neither ordering ever produces an adjacent
    second attempt** — the pair is safely non-adjacent regardless of which of the two concurrent
    transactions' lock the database grants first, confirming the test is deterministic.
  - Result either way: `correctCountInCycle: 2`, `masteryStage: 2`, `status` stays `"practicing"`
    (`2 < 3`) — matching the DoD's claim.
  - The follow-up third, sequential attempt must use a `sequenceNumber` that is non-adjacent to
    *either* possible final `lastCorrectAtSentenceCount` (1 or 9, order-dependent) — i.e. not equal
    to 2 and not equal to 10. **Fixed to `sequenceNumber: 20`** (was vaguely "a further non-adjacent
    sequenceNumber" in the original draft) — 20 is non-adjacent to both 2 and 10, so the third
    attempt deterministically reaches `masteryStage: 3` → `status: "mastered"` regardless of which
    concurrent call committed first. `scenarios.md` and `spec.md` updated with this exact value and
    the reasoning above.

## Consistency gate run (all 9 checks, 2026-07-28)

1. Scenario → Acceptance — PASS. Every `SCENARIO` in `scenarios.md` has an `Acceptance:` block with
   BE/FE/Infra explicitly stated (populated or `None`).
2. Scenario → e2e box — PASS. S5 carries the required unchecked `[ ] @phrase-bank-concurrency-
   fix.S5 — e2e test written` line. S1-S4 carry an unchecked integration-test box instead, with the
   substitution explicitly justified in `playwright.md`'s "Not e2e" section per this plan's own
   task framing (concurrency proof requires direct, deterministic concurrent function calls against
   a real DB — not reproducible through a browser).
3. Scenario → state contract — PASS. `state-fixtures.md` covers all 5 scenarios with concrete state,
   state source, isolation/reseed strategy, and subject/scenery split.
4. Scenario → action map — PASS. S5 maps to 3 existing actions, no gaps. S1-S4 are explicitly out of
   the action-map's scope with reasoning (no UI surface).
5. Diagram → scenario/architecture — PASS. Both Mermaid sequence diagrams in `architecture.md` map
   directly to the as-built (current) and proposed (after this plan) write-path shapes — neither is
   decorative.
6. Deriver census — N/A/PASS. No new derivers; `spec.md` states this explicitly rather than leaving
   the Derivers section silently empty.
7. Documentation — PASS. `architecture.md` was written (this is an architectural shift — first
   transaction/lock usage in the codebase); `spec.md`'s Documentation changes section names the
   existing doc being updated (`docs/architecture/phrase-bank-mastery/as-built.mmd`/`.png`).
8. Constitution + framework safety — PASS. No scenario seeds its own subject (S1-S4 need none, since
   no FK to `subjects` exists on the touched tables — a genuine finding, not a shortcut); no scenario
   targets a forbidden/shared DB (both S5's e2e run and S1-S4's integration tests are guarded to
   local-only Postgres, the latter via a new lightweight host-allowlist check this plan adds);
   nothing is parked as a future `test.skip`; migrations are generated then applied, never
   hand-pushed.
9. Open questions carried — PASS. Both `playwright.md` and `state-fixtures.md` explicitly say "None
   carried forward" — the one genuine fork (lock scope vs. LLM-call timing) was resolved with a
   documented, reversible default rather than left open.

**Result: PASS — 0 gaps.** `spec.md`, `scenarios.md`, `architecture.md`, `playwright.md`, and
`state-fixtures.md` promoted from `state: draft` to `state: confirmed`.

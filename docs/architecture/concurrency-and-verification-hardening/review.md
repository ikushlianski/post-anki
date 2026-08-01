---
type: debrief
branch: main
feature: concurrency-and-verification-hardening
updated: 2026-08-01
verdict: critical-issue-found-and-closed
diagram-format: ascii
---

# Architecture Review: concurrency and verification hardening (moonshine run, 2026-08-01)

## What was reviewed

Seventeen commits landed directly on `main` in one autonomous run (`e9dbdb1`..`b1d3260`).
They fall into three groups that are worth judging together rather than separately, because
they interact: **(1)** a server-side allowlist on the Electric sync proxy plus its dormant
production wiring; **(2)** a family of concurrency fixes that all reach for the same
advisory-lock mechanism — phrase-bank generate/grade, `createCurriculum` vs. merge,
`insertDomainNode`, `deleteSubject`, the doc-scan watermark, and double-click resolution of
scan suggestions; **(3)** verification-integrity work — an e2e database reset, a browser-bundle
guard, integration tests wired into CI, and four test files that had been silently not running.

Plus two data-correctness fixes that stand alone: `clearCurriculumStructure` provenance and the
per-subject scan watermark.

## Documentation found

Substantial, and it was kept current rather than left to rot — which is itself worth noting.
`docs/architecture/` already held per-feature reviews for most touched areas
(`curriculum-merge`, `phrase-bank-concurrency-fix`, `doc-changelog-scan`,
`domain-priority-review`, `ontology-split-merge`, `local-first-electric-sync`). Two documents
were corrected during the run rather than allowed to drift: `local-first-electric-sync.md`
(which described an enumerated forwarded-param set the code had never implemented, and a
board-only scope that had since grown to the practice screens), and the whole
`doc-changelog-scan` set (which still asserted the single-watermark bug as a live limitation
after it was fixed). No drift was found between what the remaining docs claim and what the code
does.

## As-built architecture

*This sketch shows the state at review time. The two `⚠` items were fixed immediately
afterwards — see "Resolution" below.*

```
        ONE advisory-lock space — every lock is hashtext(id)::bigint
 ┌────────────────────────────────────────────────────────────────┐
 │ withMergeLock(target, source)  2 locks, sorted lexicographically│
 │   mergeSubjects · mergeTags · mergeCurricula   → no merge-merge │
 │                                                    deadlock     │
 ├────────────────────────────────────────────────────────────────┤
 │ withSubjectLock(subjectId)     1 lock, blocking                 │
 │   createCurriculum · insertDomainNode                           │
 │   resolveDomainTopicSuggestion(accept) · deleteSubject ⚠        │
 ├────────────────────────────────────────────────────────────────┤
 │ withDocScanLock()   1 lock, GLOBAL key, pg_TRY (non-blocking) ⚠ │
 ├────────────────────────────────────────────────────────────────┤
 │ lockPhraseBankScope()   per (subjectId, level, pack)            │
 └────────────────────────────────────────────────────────────────┘

   pg.Pool  max: 4,  no connectionTimeoutMillis  → waits forever

   deleteSubject ───► tx holds conn #1 + subject lock
                       └─► deleteCurriculum()  getDb() → conn #2  ⚠
                           (loops once per owned curriculum)

   withDocScanLock ─► tx holds conn #1 + lock
                       └─► run()  pool reads/writes → conn #2     ⚠
                           (held across an LLM call)
```

The single shared lock space is the good decision here, and it is deliberate: `withSubjectLock`
derives its id exactly as `withMergeLock` does specifically so a create and a merge on the same
subject contend rather than interleave. `withMergeLock` sorts its two ids lexicographically, so
two merges racing on the same pair in opposite directions cannot deadlock. Every holder re-reads
its own entity *inside* the lock rather than trusting a pre-transaction read, which is what turns
a lost race into a clean 404 instead of a half-applied write. `withDocScanLock` uses the
non-blocking `pg_try_advisory_xact_lock` on purpose, because a queue of blocked waiters would
exhaust the pool — the reasoning is written down at the call site.

## Verdict

**Sound in its locking design, with one real resource-exhaustion hazard introduced by this run
that should be closed before it is forgotten.**

The lock discipline is genuinely good. One mechanism, one id derivation, sorted acquisition where
two locks are needed, re-read inside the lock everywhere, and a documented reason wherever a
variant deviates. Five separate races were closed this run and none of them invented a competing
mechanism. That is the hard part of concurrency work and it was done well.

**The critical issue: two call sites now hold a pooled connection *and* an advisory lock while
acquiring a second connection from the same 4-connection pool, and that pool has no acquire
timeout.**

`db/client.ts` creates `new pg.Pool({ max: 4, idleTimeoutMillis: 10_000 })` with no
`connectionTimeoutMillis`. `pg.Pool` therefore queues a connection request **indefinitely** — the
failure mode is a permanent hang, not an error.

- `deleteSubject` (commit `c7f7acb`) now wraps its whole body — including a loop calling
  `deleteCurriculum(c.id)` once per owned curriculum — inside `withSubjectLock`'s transaction.
  `deleteCurriculum` is not transaction-aware: it calls `getDb()` and takes its own connection.
  **This is new.** Before this run the loop ran outside any transaction, so only one connection
  was ever held at a time.
- `withDocScanLock` (commit `ace608f`) deliberately does not hand its transaction to `run()`, so
  the scan's own reads and writes take a second connection — held across an LLM call. The
  tradeoff is documented at the call site, but the cost is the same shape.

Concrete failure scenario: three concurrent `deleteSubject` calls each hold one connection and
each need a second. Three of four connections are held; one is free; one inner call proceeds and
the other two wait forever. Because each blocked outer transaction is still holding a *subject
advisory lock*, every merge and every curriculum create against those subjects now blocks too.
The process does not recover on its own — it needs a restart.

Being fair about likelihood: this is a single-user application, and three simultaneous subject
deletions by one human is implausible. But the clients are not one — the web app, the Telegram
bot, and Cloud Scheduler all hit this API independently, and a scheduled doc scan already holds
two of the four connections across an LLM call. That leaves the margin at exactly one concurrent
delete. The reason to fix it is not the odds; it is that the failure is unbounded (no timeout),
self-sustaining (locks held by the blocked parties), and invisible in testing (integration tests
run one operation at a time).

**The fix is a pattern this codebase already has.** `db/client.ts` exports `DbExecutor` — typed
precisely as "a repo function willing to run either against the shared pool or inside an
already-open transaction" — and eight files already use it (`gap.repo`, `gap-mastery.repo`,
`lecture.repo`, `lecture-source-candidate.repo`, `phrase-bank.repo`, `practice.repo` and two
orchestrators). `deleteCurriculum` simply predates it. This is not a new abstraction to design;
it is an existing one to apply.

The second-order point worth naming regardless: `connectionTimeoutMillis` should be set on that
pool. Nothing in the app benefits from an unbounded wait, and with it set, this class of bug
degrades into a loud 500 that surfaces in logs instead of a silent hang.

## Proposed alternative

```
 deleteSubject ──► withSubjectLock → tx  (conn #1, and only #1)
                    └─► deleteCurriculum(id, tx)
                        signature becomes (id, db: DbExecutor = getDb())
                        — the same shape gap.repo.ts:92,
                          lecture.repo.ts:132 and phrase-bank.repo
                          already use. Call sites outside a tx
                          are unchanged; this one passes tx.
                        Bonus: the curricula deletions become
                        part of the same transaction, so a
                        failure halfway no longer leaves a
                        subject whose courses are already gone.

 withDocScanLock ─► run(tx)  instead of run()
                    └─► scan threads the executor through its
                        watermark read-compare-write
                        → one connection for the whole scan

 db/client.ts ────► add connectionTimeoutMillis (e.g. 10_000)
                    → exhaustion becomes a logged error,
                      never an unbounded hang
```

What it costs: threading a `DbExecutor` parameter through `deleteCurriculum` and the doc-scan
watermark helpers. Mechanical, and every call site outside a transaction keeps working via the
default argument.

What it buys beyond the hang: `deleteSubject` becomes genuinely atomic. Today `deleteCurriculum`
commits independently of the outer transaction, so a failure partway through leaves the subject
row present with some of its curricula already destroyed. That partial-delete window is
*pre-existing*, not introduced by this run — but the same one-line change closes both.

## Resolution (same session, commit `ae0b37e`)

The critical issue above was fixed rather than left for the morning, since it was introduced by
this same run and the fix follows a pattern the codebase already had.

`deleteCurriculum`, `clearCurriculumStructure` and `resolveClearTargets` now each take a trailing
`db: DbExecutor = getDb()`, so `deleteSubject` runs the whole deletion on the one connection it
already holds. `resolveClearTargets` was the frame most easily missed — it called `getDb()` and
issued two `SELECT`s *before* `clearCurriculumStructure` even opened its transaction, so threading
only the outer two frames would have left the second connection in place. `withDocScanLock` now
hands its transaction to `run(tx)`, threaded through five one-line repo functions, and its comment
block was rewritten because this change falsified the "two connections" rationale it previously
gave for the global lock key. `connectionTimeoutMillis: 10_000` is set on the pool.

Proven, both tests written and run red against unmodified code first:
- **Atomicity** — injecting a failure on the second course deletion destroyed 1 of 2 courses
  before (`expected 1 to be 2`); after, all courses, their modules and topics, and the subject
  survive intact. This closes a **pre-existing** partial-delete window, not one this run created.
- **Connection usage** — tagging the pool with a per-run `application_name`, parking the delete on
  a `FOR UPDATE`-held course row and counting non-idle backends in `pg_stat_activity` showed 2
  connections held before (`expected 2 to be 1`); exactly 1 after.

Worth recording: the agent's first version of the connection test used courses with no modules or
topics, so it never reached the nested `db.transaction(...)` inside `clearCurriculumStructure` —
the single line most likely to take a second connection. It caught that itself, seeded real
structure, and re-confirmed. The strengthened test also demonstrates drizzle turns that nested
transaction into a savepoint on the same session rather than a new connection.

Still open, deliberately: `deleteCurriculum` called standalone via `DELETE /curricula/:id` remains
three separate commits, exactly as before. It is atomic only when handed a transaction. Wrapping
the standalone path is a further improvement beyond what this review asked for.

## Questions a reviewer would ask

1. `hashtext()` returns a 32-bit integer, so the advisory-lock space is ~4 billion values shared
   by subject ids, curriculum ids, tag ids and the literal string `"doc-scan"`. A collision
   would silently serialize two unrelated entities. Harmless at this scale, but is that
   understood and accepted, or accidental?
2. `withDocScanLock` holds its lock across an LLM call with no timeout of its own. If that call
   hangs rather than failing, what releases the lock — and does every subsequent scan just
   return "busy" until the process restarts?
3. The doc-scan watermark migration (`0030`) deletes existing rows when more than one gated
   subject exists. Production has one today. What confirms that is still true at the moment the
   migration actually runs there, given it has not been applied yet?
4. `deleteSubject` now returns `false` both for "no such subject" and for "lost the race to a
   concurrent merge". Does any caller need to tell those apart, or is a 404 genuinely correct
   for both?
5. Five call sites now take a subject lock. Is there a test that would catch a *sixth* one being
   added without it — or does correctness here rest on the next person noticing the pattern?
6. The Electric shape allowlist pins `sources` to three columns server-side while the client
   still sends its own `columns` param that is now silently ignored. Is a client asking for
   something it will not get worth failing loudly on, rather than quietly overriding?
7. `mergeSubjects` reassigns curricula and domain nodes but not the suggestion tables, so a
   merged-away subject's pending doc-scan suggestions are now stuck pending and invisible. Is
   that acceptable indefinitely, or does it want reassigning in the same transaction?

---
type: scenarios
branch: 33-untriaged-gaps-auto-defer
task: "[Story] Untriaged gaps auto-defer so they never pile up (#33)"
state: confirmed
updated: 2026-08-14
---

# Scenarios: Untriaged gaps auto-defer (#33)

**42 acceptance criteria** (1-38 plus 24a-24d and 37a, added after tracing where a Fail is
actually represented — see spec.md §"Fail reactivation — where a Fail actually lives").

No Playwright plan — Telegram bot + scheduled server job, non-browser surface. Proof mechanism is
vitest unit tests (`packages/core`, `apps/bot`) plus one real-Postgres integration test
(`apps/api/src/gap/gap-auto-defer.integration.test.ts`), mirroring
`gap-triage-concurrency.integration.test.ts`'s precedent and
`.planning/2026-08-14-gap-triage/scenarios.md`'s own "integration-only, not e2e" call for the
identical reason: there is no UI-observable difference a browser test could detect either way.

**A note on how the "1/3 weight" criteria are phrased.** Every criterion below states
*eligibility*, never observed frequency. `selectDailyPush` returns a single deterministic pick per
call, so "this gap was pushed 1/3 as often" is not an assertable property in this codebase — see
spec.md Decision 2. This is a disclosed reinterpretation of the issue's weight table, not an
oversight.

## Master acceptance criteria list (42 items, each independently walkable)

**Schema & storage**

1. `gaps` gains exactly two new columns via one generated migration: `untriaged_since`
   (`timestamp with time zone NOT NULL DEFAULT now()`) and `auto_deferred_at`
   (`timestamp with time zone`, nullable). Confirmed by reading the generated
   `apps/api/src/db/migrations/0041_*.sql`.
2. The generated migration contains **no** statement touching `triage_state` — because
   `apps/api/src/db/schema.ts:433` declares it as plain `text`, not a Postgres enum. Proven by
   grepping the generated SQL for `triage_state` and finding zero hits.
3. The generated migration contains no statement touching `state`, `wanted`, `concern`,
   `deferred_until`, `deferral_count`, `dismissed_at`, `dismissed_checkin_sent_at`, or
   `triaged_at`.
4. `gapTriageStateSchema` (`packages/shared/src/gap.ts:15-20`) has exactly five values:
   `untriaged | important | user_deferred | auto_deferred | dismissed`.
5. `gapSchema` gains `untriagedSince: z.string()` (non-nullable) and
   `autoDeferredAt: z.string().nullable()`.
6. `rowToGap` (`apps/api/src/gap/gap.repo.ts:29`) maps both new columns to ISO strings; a gap read
   back from Postgres round-trips both values unchanged.
7. `persistGaps` (`gap.repo.ts:74`) writes both new fields, so the reactivation computed in
   `probe.service.ts` commits through the existing `persistGaps(updated)` call at line 169 with no
   new repo function and no new write path.
8. `insertDiscoveredGaps` (`gap.repo.ts:105`) takes a new `now: string` parameter, writes
   `untriaged_since` **explicitly** into the insert values, and returns `Gap` objects whose
   `untriagedSince` equals that same value — DB row and returned DTO agree exactly, rather than
   differing by the DB-clock-vs-app-clock gap a bare column default would leave.
9. `handleDeclareGap` (`gap.controller.ts:50`) writes `untriaged_since` explicitly and returns
   both new fields in its DTO. `slice-generation.orchestrator.ts:296`'s bulk insert relies on the
   column default (it builds no `Gap` DTO from those rows) and produces a populated
   `untriaged_since` with a null `auto_deferred_at`.
10. `apps/api/src/socratic/socratic.service.ts:181` is **unchanged** — its `{ ...gap }` spread
    carries both new fields automatically. Proven by that file appearing in no diff.

**Pure logic — `packages/core/src/gap-triage/auto-defer.ts`**

11. `autoDeferAnchor(gap)` returns `untriagedSince + 3 days`, derived only — the same value before
    and after the sweep has stamped `autoDeferredAt`. Proven by asserting equality for two gaps
    identical except for `autoDeferredAt`.
12. `isAutoDeferDue(gap, now)` is `false` at `untriagedSince + 2d 23h 59m` and `true` at exactly
    `untriagedSince + 3d` (boundary is inclusive).
13. `isAutoDeferDue(gap, now)` is `false` for a gap whose `triageState` is `important`,
    `user_deferred`, `auto_deferred`, or `dismissed`, regardless of how old `untriagedSince` is.
14. `effectiveTriageState(gap, now)` returns `"auto_deferred"` for an `untriaged` gap past its
    anchor, and returns `gap.triageState` verbatim in every other case (five states × due/not-due
    matrix).
15. `applyAutoDefer(gap, now)` on a due `untriaged` gap → `triageState: "auto_deferred"`,
    `autoDeferredAt: now`, `changed: true`.
16. `applyAutoDefer` leaves `triagedAt` **null** on that transition — auto-defer is not a user
    decision (spec.md Decision 5). Asserted explicitly, not incidentally.
17. `applyAutoDefer` leaves `untriagedSince`, `deferralCount`, `deferredUntil`, `wanted`, `depth`
    and `state` byte-for-byte unchanged.
18. `applyAutoDefer(gap, now)` → `changed: false` for: a not-yet-due `untriaged` gap; an
    `important` gap of any age; a `user_deferred` gap; a `dismissed` gap; an already
    `auto_deferred` gap.
19. **"'Important' gaps are never auto-deferred"** — an `important` gap whose `untriagedSince` is
    a year old still has `effectiveTriageState === "important"` and `applyAutoDefer` returns
    `changed: false`. This is AC 18's most load-bearing case, asserted as its own named test.
20. `reactivateOnFail(gap, now)` on a gap whose **effective** state is `auto_deferred` →
    `triageState: "untriaged"`, `untriagedSince: now`, `autoDeferredAt: null`, `changed: true`.
21. `reactivateOnFail` fires for a gap that is due but **not yet swept** (stored
    `triageState: "untriaged"`, past its anchor) — the outcome does not depend on whether the
    06:00 job has run (spec.md Decision 12).
22. `reactivateOnFail(gap, now)` → `changed: false` for a not-yet-due `untriaged` gap. The issue's
    own rule: *"A user can be actively learning Lambda cold starts on Tuesday and Wednesday — the
    Lambda cold start GAP is still auto-deferred on Thursday if it was logged Monday and never
    triaged."*
23. `reactivateOnFail(gap, now)` → `changed: false` for `user_deferred`, `important` and
    `dismissed` gaps. A Fail never overrides an explicit user choice (spec.md Decision 10).
24. `AUTO_DEFER_AFTER_DAYS === 3` and `AUTO_DEFERRED_PUSH_INTERVAL_DAYS === 3` are exported named
    constants, not inline literals — matching `gap-triage.ts:3`'s `DEFER_DAYS` precedent.

**Fail-reactivation wiring (`apps/api/src/probe/probe.service.ts`)**

24a. A **missing** verdict for the probed gap counts as a fail and triggers reactivation, not just
    an explicit `covered: false`. `probe.service.ts:180-186` already defines a fail that way
    (`?.covered === true ? "pass" : "fail"`), and the freeform LLM path can omit the verdict
    entirely — hooking only the explicit-`false` branch would pass its unit test while never
    firing in the product. Covered by an integration test that submits a freeform answer whose
    evaluation returns an empty `verdicts` array for the probed gap.
24b. `applyGapVerdicts` and `packages/core/src/curriculum/gap.ts`'s verdict logic are
    **unchanged** — proven by zero assertion changes in the existing `gap.test.ts`
    `applyGapVerdicts` cases.
24c. `probe.service.ts`'s duplicated fail conditional is hoisted to a single `probedFailed`
    binding used by both the reactivation and the reported `outcome` — a net removal of a
    duplicated expression. The endpoint's returned `outcome` value is byte-identical to today's
    for every input, proven by the existing probe tests passing unchanged.
24d. A **pass** verdict on an auto-deferred gap does not reactivate it — it covers it, exactly as
    today.

**Push eligibility rotation**

25. `isAutoDeferredPushEligible(gap, now)` is `true` on the anchor day (day 0), `false` on days 1
    and 2, `true` on day 3, `false` on days 4 and 5, `true` on day 6 — asserted as an explicit
    seven-day table.
26. Two gaps auto-deferred on different days have different eligible days — proven by constructing
    two gaps whose `untriagedSince` differ by one day and asserting their eligibility booleans
    differ on at least one shared `now`. This is what prevents a single global "auto-defer day"
    flooding the pool (spec.md Decision 2, property 2).
27. Eligibility phase does not shift when the sweep runs: the same gap, evaluated with
    `autoDeferredAt: null` and with `autoDeferredAt` set to a later timestamp, yields identical
    eligibility for the same `now`.
28. `isPushExcluded(gap, now)` (`packages/core/src/curriculum/gap.ts:93`) returns `false` for an
    auto-deferred gap on its eligible day and `true` on the other two.
29. `isPushExcluded`'s existing behaviour is unchanged: `dismissed` → always `true`;
    `user_deferred` → `true` while `now < deferredUntil`, `false` after. Proven by zero assertion
    changes in the existing `gap.test.ts` cases for those two branches.
30. `selectDailyPush` (`daily-push.ts:33`) is **not modified** — the new rule reaches it entirely
    through `isPushExcluded`, which it already calls at line 39. Proven by `daily-push.ts`
    appearing in no diff.
31. `daily-push.test.ts` gains a case: a pool of one auto-deferred gap and one untriaged gap. On
    the auto-deferred gap's non-eligible day only the untriaged gap can be picked; on its eligible
    day, with the untriaged gap removed, the auto-deferred gap **is** picked — proving it "REMAINS
    in push rotation", never permanently excluded.
32. An auto-deferred gap on its eligible day is ranked by the existing `wanted`-then-depth sort
    with no penalty added — asserted by a case where an auto-deferred `wanted` gap outranks an
    untriaged non-`wanted` gap.

**Timer reset on every return to untriaged**

33. `applyTriageAction(gap, "revisit", now)` (`packages/core/src/gap-triage/gap-triage.ts:79-95`)
    now also sets `untriagedSince: now` — a revisited dismissed gap earns a fresh full 3-day
    window, per *"Every return to Untriaged state earns the same 3-day window."*
34. `markGapResurfaced(gapId, "deferral-expired", now)`
    (`apps/api/src/gap/gap-triage.repo.ts:120-127`) sets `untriaged_since = now` alongside
    `triage_state = 'untriaged'`. **Regression guard:** without this, a 60-day deferral expiring
    would resurface and be auto-filed by the very next sweep, because its `untriaged_since` would
    still hold a 60-day-old value. Covered by the integration test, not only a unit test.
35. Nothing else resets the timer. Asserted negatively: `applyGapVerdicts` with a
    `covered: true` verdict, and `lastEvaluatedAt` being written, both leave `untriagedSince`
    unchanged. (*"Answering questions about the gap's concept during a session does NOT reset the
    timer."*)

**Sweep endpoint and job**

36. `POST /gaps/auto-defer-sweep` returns `200 { autoDeferred: n, capped: boolean }`, requires
    `Authorization: Bearer ${API_SHARED_SECRET}` (via the existing `authorized()` at
    `apps/api/src/server.ts:212-226` — no new auth code), and `401`s without it.
37. `sweepAutoDeferredGaps(now)` is idempotent: running it twice with the same `now` flips gaps on
    the first run and reports `autoDeferred: 0` on the second.
37a. The candidate query is ordered `asc(gaps.untriagedSince)` before `.limit(SWEEP_BATCH_LIMIT)`.
    **Regression guard:** with more untriaged gaps than the cap, an unordered `LIMIT` can return
    the same not-yet-due rows on every run while due gaps are never swept — a job that reports
    success forever and does nothing. Proven by an integration test seeding `SWEEP_BATCH_LIMIT + 5`
    untriaged gaps where only the five oldest are due, and asserting all five flip in one run.
38. A new `autoDeferSweepJob` exists in `infra/index.ts`, targets `apiDomain` (not `botDomain`),
    carries the `apiSharedSecret` bearer, and is exported as `autoDeferSweepJobName` — mirroring
    `docScanJob` (`infra/index.ts:336-352`), not `gapResurfaceJob`.

---

## SCENARIO 1 — A gap the user never touches quietly files itself away

**Given** the user taps Fail on a question about Lambda cold starts on Monday, creating a gap at
`triage_state: "untriaged"`, `untriaged_since: Monday 21:00`
**When** the 06:00 sweep runs on Thursday
**Then** the gap's `triage_state` is `auto_deferred`, `auto_deferred_at` is Thursday 06:00,
`triaged_at` is still `null`, and **no Telegram message of any kind is sent**
**And** the user's experience of Thursday morning is indistinguishable from Wednesday's.

Covers AC 15, 16, 17, 36, 37.
Proof: `auto-defer.test.ts` (transition), `gap-auto-defer.integration.test.ts` (persisted flip
against real Postgres), plus the absence of any `sendMessage` import in the new API code path.

## SCENARIO 2 — The auto-deferred gap still shows up, just less often

**Given** an auto-deferred gap anchored on Thursday, and no other eligible gap in the pool
**When** `selectDailyPush` runs on Thursday, Friday, Saturday and Sunday
**Then** it returns the gap on Thursday, `null` on Friday, `null` on Saturday, and the gap again
on Sunday
**And** on Thursday, competing against an untriaged gap, it is ranked by the existing
`wanted`-then-depth sort with no penalty.

Covers AC 25, 28, 30, 31, 32.
Proof: `daily-push.test.ts` and `gap.test.ts` with an explicit day-by-day `now` table.
**This is the scenario that stands in for the issue's "≈1/3 base weight" row** — see the note at
the top of this file.

## SCENARIO 3 — A second Fail on the same concept pulls the gap straight back

**Given** an auto-deferred Lambda cold-start gap
**When** the user taps Fail on a Lambda cold-start question a week later
**Then** no second gap row is created (#28's dedup rule, already in force — `applyGapVerdicts`
updates the existing gap by id)
**And** the existing gap returns to `triage_state: "untriaged"` with `untriaged_since = now` and
`auto_deferred_at = null`
**And** it is immediately push-eligible every day again, not one day in three
**And** the user receives no notification about the change.

Covers AC 20, 7, 22, 23, 24a-24d.
Proof: `auto-defer.test.ts` for the pure transition; `gap-auto-defer.integration.test.ts`
asserting the row count for the topic is unchanged and the single row's fields moved.

This is the issue's own "New Fail on a concept with an existing auto-deferred gap" sub-section.
**Where it is walkable:** #23's one-tap pass/fail buttons live in the web probe UI
(`apps/web/src/curriculum/probe-answer.tsx:165,173`), which sends `selfOutcome` and produces an
explicit `covered: false` via `localEvaluation`. The Telegram bot never sends `selfOutcome`
(`apps/bot/src/api/client.ts:48-68` posts only `{ gapId, mode, answer }`), so on Telegram the
same reactivation is reached through the freeform path's *derived* fail — which is exactly why
AC 24a exists. Verified, not assumed.

## SCENARIO 4 — Repeat cycles get the full window every time, never a shortened one

**Given** a gap that has already been through auto-defer twice and was reactivated by a Fail an
hour ago
**When** two days and twenty-three hours pass with no triage
**Then** it is still `untriaged`
**And** one more hour later it auto-defers again — the full 3 days, not a shortened repeat-offender
window.

Covers AC 11, 12, 24.
Proof: `auto-defer.test.ts` boundary cases, driven purely by `untriagedSince` with no cycle
counter anywhere — the issue's *"There is no shortened timer for gaps that have cycled through
auto-defer before."*

## SCENARIO 5 — Marking a gap Important stops the clock permanently

**Given** an untriaged gap two days old
**When** the user taps `Important` on #29's keyboard
**Then** `applyTriageAction` sets `triage_state: "important"` and `triaged_at: now`
**And** a year later `effectiveTriageState` still reports `important`, `isAutoDeferDue` is
`false`, and the sweep does not select it
**And** it keeps winning the daily push's top priority tier exactly as #29 built it.

Covers AC 13, 14, 18, 19.
Proof: `auto-defer.test.ts`'s named "important gaps never auto-defer" test, plus the unchanged
`important` tier assertions in `daily-push.test.ts`.

## SCENARIO 6 — A 60-day deferral expires and does not get instantly auto-filed

**Given** a gap the user deferred 60 days ago, whose `untriaged_since` still holds a value from
before the deferral
**When** `gapResurfaceJob` fires, the bot sends the resurface message, and
`markGapResurfaced(gapId, "deferral-expired", now)` commits
**Then** the row is `triage_state: "untriaged"` **and** `untriaged_since = now`
**And** the next morning's sweep does **not** auto-defer it — the user gets their full 3 days to
answer the message that just arrived.

Covers AC 34.
Proof: `gap-auto-defer.integration.test.ts`, real Postgres, asserting the column value after
`markGapResurfaced` and then a no-op sweep. **This is the highest-value regression test in the
story** — the failure mode is silent and directly contradicts the resurfacing UX #29 shipped.

## SCENARIO 7 — A returning user finds their gaps already handled

**Given** the user is offline for five days after a session that produced three gaps
**When** they come back and open the bot
**Then** all three gaps are already `auto_deferred`, filed by the sweeps that ran while they were
away
**And** there is no badge, no count, no "you have 3 untriaged gaps" message anywhere
**And** the stale triage keyboard on the old session-summary message is no longer the way those
gaps get handled — the daily push is.

Covers the issue's *"A user returning after 3+ days of absence finds session gaps already
auto-deferred"* acceptance bullet, minus its `/gaps` clause.
Proof: `gap-auto-defer.integration.test.ts` seeding three gaps with a five-day-old
`untriaged_since` and running one sweep.
**Partially blocked:** the "labeled '(auto-filed)' in /gaps" half of this bullet cannot be walked
until #43 exists. See SCENARIO 8 and Known limitations 1.

## SCENARIO 8 — The two Deferred labels read differently (formatter only)

**Given** one `user_deferred` gap and one `auto_deferred` gap
**When** `deferredGapListLabel` is called on each
**Then** it returns `"Plugin API internals (deferred by you)"` and
`"Hydration boundary behavior (auto-filed)"` — the issue's copy verbatim
**And** a gap in any other state gets its bare label with no suffix.

Covers the issue's "Visual distinction in /gaps" sub-section.
Proof: `apps/bot/src/gap-triage/gap-triage-view.test.ts`.
**Disclosed limitation, not a hidden one:** nothing calls this function in this story, because
`/gaps` does not exist. #43 imports it in one line. Building a substitute command here would be
scope theft — spec.md Decision 1.

## SCENARIO 9 — Two sweeps racing, or a sweep racing a tap

**Given** a due untriaged gap
**When** the sweep transaction and a concurrent `POST /gaps/:id/triage` (`Important`) both target
it
**Then** they serialise through the same `SELECT … FOR UPDATE` lock
`triageGapLocked` already uses (`gap-triage.repo.ts:44`)
**And** whichever commits second re-reads the row inside its transaction and produces
`changed: false` rather than a lost update
**And** if the tap wins, the gap ends `important`, never `auto_deferred`.

Covers AC 37 and the concurrency half of AC 36.
Proof: `gap-auto-defer.integration.test.ts`, modelled on
`gap-triage-concurrency.integration.test.ts`'s existing two-connection pattern.

## SCENARIO 10 — Deploy day is uneventful

**Given** a production database with existing untriaged gaps of unknown age
**When** the migration applies and the sweep runs the next morning
**Then** `autoDeferred: 0` — every pre-existing gap got `untriaged_since` = the migration
timestamp, so the earliest auto-defer is three days after deploy
**And** no user-visible change happens on deploy day at all.

Covers AC 1, and spec.md Decision 4 / Known limitation 3.
Proof: `gap-auto-defer.integration.test.ts` seeding rows *before* applying the new column defaults
is not reproducible in-test; verified instead by reading the generated migration's `DEFAULT now()`
clause (AC 1) and by the manual post-deploy check in todo.md.

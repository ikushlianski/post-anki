---
type: scenarios
branch: gap-triage
task: "[Story] User triages a gap as important, deferred, or dismissed (#29)"
state: confirmed
updated: 2026-08-14
---

# Scenarios: Gap triage — Important / User-Deferred / Dismissed (#29)

No Playwright plan — Telegram bot, non-browser surface. Proof mechanism is vitest unit tests
(`packages/core`, `apps/bot`) plus one real-Postgres integration test
(`apps/api/src/gap/gap-triage-concurrency.integration.test.ts`), mirroring
`gap-mastery-concurrency.integration.test.ts`'s precedent and `.planning/
gap-mastery-cascade-delete/scenarios.md`'s own "integration-only, not e2e" call for the
identical reason: no UI-observable difference a browser test could detect either way.

## Master acceptance criteria list (30 items, each independently walkable)

**Schema & storage**
1. `gaps` gains six new columns via one generated migration (`triage_state`, `triaged_at`,
   `deferred_until`, `deferral_count`, `dismissed_at`, `dismissed_checkin_sent_at`). Existing
   `state`, `wanted`, `concern` columns are byte-for-byte unchanged in the migration diff.
2. `gapSchema` (`packages/shared/src/gap.ts`) gains a `gapTriageStateSchema` enum
   (`untriaged | important | user_deferred | dismissed`) and the six new fields; `gap.repo.ts`'s
   `rowToGap`/`persistGaps` read and write all six.
3. `gapMaturity`, `progressFromGaps`, `inScopeGaps` (`packages/core/src/curriculum/gap.ts`)
   read only `state` — proven by zero assertion changes required in the existing `gap.test.ts`
   cases for those three functions after this story lands.
4. `important` is stored as a `triageState` value, never written to the existing `wanted`
   column — proven by a unit test asserting `applyTriageAction(gap, "important", now).gap.wanted
   === gap.wanted` (unchanged).

**Pure transition logic (`packages/core/src/gap-triage/gap-triage.ts`)**
5. `applyTriageAction(gap, "important", now)` on an `untriaged`/`user_deferred`/`dismissed` gap
   → `triageState: "important"`, `changed: true`, deferred/dismissed fields cleared.
6. `applyTriageAction(gap, "important", now)` on an already-`important` gap → `changed: false`,
   no field mutated.
7. `applyTriageAction(gap, "defer", now)` on `untriaged` → `triageState: "user_deferred"`,
   `deferredUntil: now + 60d`, `deferralCount: 1`, `changed: true`.
8. `applyTriageAction(gap, "defer", now)` on a gap already `user_deferred` with `deferredUntil`
   still in the future → `changed: false`, `deferralCount` NOT incremented (same-state double
   tap).
9. `applyTriageAction(gap, "defer", now)` on a gap resurfaced back to `untriaged` (i.e.
   `deferredUntil` in the past) with prior `deferralCount: 2` → `deferralCount: 3`,
   `changed: true` (a fresh choice, never a no-op even though the resulting label matches the
   prior one).
10. `applyTriageAction(gap, "dismiss", now)` is allowed from every prior `triageState`
    (`untriaged`, `important`, `user_deferred`) with `changed: true` — no blocking on current
    state, per the issue's explicit late-triage rule.
11. `applyTriageAction(gap, "dismiss", now)` on an already-`dismissed` gap → `changed: false`.

**Push-eligibility & resurfacing predicates**
12. `isPushExcluded(gap, now)` returns `true` for `triageState: "dismissed"` unconditionally.
13. `isPushExcluded(gap, now)` returns `true` for `triageState: "user_deferred"` while
    `now < deferredUntil`, and `false` once `now >= deferredUntil` — independent of whether
    `mark-resurfaced` has been called yet (the read-time-vs-scheduled-job split).
14. `selectDailyPush` never selects a gap for which `isPushExcluded` is true, proven by a
    `daily-push.test.ts` case seeding both a `dismissed` and a live `user_deferred` candidate
    alongside an eligible one, asserting only the eligible one is ever picked.
15. `selectDailyPush` picks an `important`-tagged gap ahead of a `wanted`-but-not-important one
    when both are eligible, proven by a dedicated test case — "appears within 5–7 days" is
    verified as top-priority selection weight, not a literal timer assertion.
16. `isResurfaceDue(deferredUntil, now)` / `isDismissedCheckinDue(dismissedAt,
    dismissedCheckinSentAt, now)` are unit tested at their exact boundaries (59/60/61 days,
    5-months-29-days/6-months/6-months-1-day), including the `dismissedCheckinSentAt !== null`
    short-circuit (already-sent check-ins are never due again).

**API (`apps/api`)**
17. `POST /gaps/:id/triage` persists the transition inside a `SELECT ... FOR UPDATE` transaction
    and returns `{ gap, changed }` reflecting the post-transition row, not a stale pre-lock read.
18. `GET /gaps/due-for-resurface` is read-only — calling it twice in a row with no intervening
    `mark-resurfaced` call returns the identical candidate set both times.
19. `POST /gaps/:id/mark-resurfaced { kind: "deferral-expired" }` sets `triageState: "untriaged"`,
    clears `deferredUntil`; `{ kind: "dismissed-checkin" }` sets only
    `dismissedCheckinSentAt`, leaving `triageState` at `"dismissed"`.
20. A gap that fails a probe/Socratic evaluation after having been `dismissed` gets a **new**
    `gaps` row via the existing `insertDiscoveredGaps` path — the dismissed row's `triageState`,
    `dismissedAt`, and `dismissedCheckinSentAt` are untouched, preserved as audit history.

**Bot delivery & UX**
21. Every triage-eligible gap is sent as its own standalone Telegram message
    (`sendMessageWithKeyboard`) — never batched into one message or one combined keyboard, even
    when multiple gaps resurface on the same scheduled run.
22. The keyboard's button captions are exactly `Important`, `Defer again`, `Dismiss` (plus
    `Actually dismiss?` after the 3rd deferral) — never an internal identifier, enum value, or
    gap id — arranged in one row via `chunkButtons(_, 3)`.
23. Tapping `Important` edits that gap's message to exactly `"Noted — {Tool}: {gap label} is
    flagged as important."` with the keyboard removed; no other message is touched.
24. Tapping `Defer again` edits to exactly `"Got it — deferred for 60 days."`, keyboard removed,
    no separate chat message sent.
25. Tapping `Dismiss` (or `Actually dismiss?`) edits to exactly `"Dismissed. I'll trust your
    judgment on this one."`, keyboard removed.
26. The resurface notification text is `"Your deferred gap is back: {gap label} ({tool})"` and
    the 6-month check-in text is `"A few months back you dismissed this: {gap label} ({tool}).
    Still confident?"` — both explicitly reference the prior triage action (contain the words
    "back"/"dismissed"), never indistinguishable from a freshly-discovered gap.
27. The triage keyboard is reachable in exactly one tap from the message that carries it — no
    intermediate menu, confirming zero extra navigation between "gap message arrives" and
    "user's choice is committed."
28. After the 3rd re-deferral, the resurface keyboard includes `Actually dismiss?` as a fourth
    button; tapping it produces the identical outcome (state + confirmation text) as tapping
    `Dismiss`.
29. The 6-month check-in's `Yes, still got it` edits to an acknowledgment and performs no state
    write (gap was already `dismissed`); `Actually, let's revisit` edits to a reopened
    acknowledgment and sets `triageState: "untriaged"`.

**Idempotency & concurrency**
30. Two concurrent `POST /gaps/:id/triage { action: "important" }` calls for the same gap
    (simulating duplicate webhook delivery) resolve to exactly one `changed: true` and one
    `changed: false`, the DB ends in exactly one coherent `important` state, and the bot issues
    exactly one `editMessageText` call as a result — proven by `gap-triage-concurrency.
    integration.test.ts` against real Postgres.

---

## SCENARIO 1 — User marks a resurfaced gap Important

A gap's 60-day deferral has just expired; the resurfacing job sent its notification. The user
taps `Important`.

**Setup role:** subject = `handleTriageCallback` (bot) → `POST /gaps/:id/triage`; scenery = a
gap seeded with `triageState: "user_deferred"`, `deferredUntil` in the past.

**UI clicking notes:** user taps the single `Important` button on the resurfaced message.

**Acceptance:** AC 5, 17, 22, 23, 27.

BE: `gap-triage.repo.ts` commits `triageState: "important"` in one locked transaction.
FE: N/A (Telegram message edit only, no web surface).
Bot: message edited to the exact confirmation string, keyboard removed.
Infra: none.
Tests: `packages/core/src/gap-triage/gap-triage.test.ts` (AC5), `apps/api/src/gap/
gap.controller.test.ts` or equivalent route test (AC17), `apps/bot/src/gap-triage/
gap-triage-view.test.ts` (AC22-23).

## SCENARIO 2 — User defers a gap again from a resurfaced notification

Same trigger as SCENARIO 1, user instead taps `Defer again`.

**Acceptance:** AC 7 or 9 (depending on whether this is the gap's first-ever defer or a repeat —
both paths tested), 17, 22, 24, 27.

Tests: `gap-triage.test.ts` (AC7, AC9), bot flow test asserting the exact "Got it — deferred for
60 days." string and no second chat message.

## SCENARIO 3 — User dismisses a gap, including one currently marked Important

Covers both a fresh dismiss and the explicit no-blocking rule (dismissing an `important` gap).

**Acceptance:** AC 10, 11, 17, 22, 25.

Tests: `gap-triage.test.ts` two cases — dismiss from `important`, dismiss from already-`dismissed`
(idempotent no-op, AC11).

## SCENARIO 4 — Daily push selection excludes dismissed/deferred gaps and prioritizes Important

No user action — a scheduled/on-demand daily push runs against a candidate pool containing one
`dismissed`, one live `user_deferred`, one `important`, and one plain `wanted` gap.

**Acceptance:** AC 12, 13, 14, 15.

BE only. Tests: `packages/core/src/curriculum/daily-push.test.ts` — new cases seeding all four
triage states in one candidate pool, asserting the `important` gap is picked and neither excluded
gap is ever returned regardless of iteration order.

## SCENARIO 5 — 60-day resurfacing: job finds the gap, notifies, then commits

The scheduled `gapResurfaceJob` fires. One gap's `deferredUntil` is in the past.

**Setup role:** subject = the bot's `POST /gap-resurface` handler; scenery = one due
`user_deferred` gap, one not-yet-due `user_deferred` gap (control), seeded via direct DB insert.

**Acceptance:** AC 16, 18, 19, 21, 26.

BE: `GET /gaps/due-for-resurface` returns only the due gap (AC16, 18).
Bot: sends exactly one standalone message with the resurface text and keyboard (AC21, 26), then
calls `mark-resurfaced { kind: "deferral-expired" }` only for the gap whose send succeeded.
Infra: `gapResurfaceJob` Cloud Scheduler entry exists in `infra/index.ts`, mirroring
`dailyPushJob`'s shape (verified by reading the Pulumi diff, not runtime — no infra integration
test in this repo's existing precedent covers Cloud Scheduler jobs directly).
Tests: `apps/api/src/gap/` route test for the due-query filter; a bot-level test (mocking
`sendMessageWithKeyboard` to fail for one gap) asserting `mark-resurfaced` is only called for the
gap that actually sent (AC19's negative case — the not-marked-if-send-failed rule).

## SCENARIO 6 — 6-month dismissed check-in, both outcomes

A `dismissed` gap has passed its 6-month mark and has never had a check-in sent.

**Acceptance:** AC 16, 19, 26, 29.

Two sub-cases: `Yes, still got it` (no further state change, `dismissedCheckinSentAt` already set
by the send step prevents any future re-notification — proven by re-running the due-query after
and asserting the gap no longer appears) and `Actually, let's revisit` (`triageState` →
`"untriaged"`).

Tests: `gap-triage.test.ts` for the revisit transition; a due-query test proving the sent flag's
one-time-only effect (AC16's `dismissedCheckinSentAt !== null` short-circuit).

## SCENARIO 7 — Third re-deferral surfaces the extra shortcut button

A gap has been deferred twice before (`deferralCount: 2`); the user defers it a third time via a
resurfaced notification, then it resurfaces again.

**Acceptance:** AC 9, 28.

Tests: `gap-triage.test.ts` (AC9 — count reaches 3), `gap-triage-view.test.ts`
(`buildTriageKeyboard(3)` includes the fourth button; `buildTriageKeyboard(2)` does not) (AC28).

## SCENARIO 8 — Failing a previously-dismissed concept creates a fresh gap, not a resurrection

User dismissed a gap on "async iterators" weeks ago. In a later Socratic/probe session, they fail
a question touching that same concept.

**Acceptance:** AC 20.

BE: existing `insertDiscoveredGaps`/`applyGapVerdicts` path (`probe.service.ts`,
`socratic.service.ts`) inserts a new `gaps` row with `triageState: "untriaged"`; the old
dismissed row's six triage columns are read back unchanged after the new row is inserted.

Tests: `apps/api/src/gap/` integration or unit test (whichever layer the existing gap-discovery
tests already live at) seeding a dismissed gap, running the discovery path with a new gap of the
same label, asserting two distinct `gaps` rows exist and the original's triage fields are
untouched.

## SCENARIO 9 — Concurrent/duplicate triage taps converge to one state

Two near-simultaneous `POST /gaps/:id/triage { action: "important" }` calls for the same gap
(duplicate webhook delivery, or a genuine fast double-tap that raced past `update-lru`'s
in-process dedup).

**Setup role:** subject = `gap-triage.repo.ts`'s locked transaction, invoked directly via
`Promise.all`, mirroring `gap-mastery-concurrency.integration.test.ts`'s exact harness shape —
dedicated throwaway Postgres database, real transaction, no mocked DB layer.

**Acceptance:** AC 30.

Tests: NEW `apps/api/src/gap/gap-triage-concurrency.integration.test.ts` — both calls resolve
(asserted before any row is inspected, per this repo's existing Definition-of-Done convention for
concurrency tests), exactly one returns `changed: true`, the DB ends with `triageState:
"important"` and no double-write artifact (e.g. `deferralCount` unaffected by the `important`
action). Run via `npm run test:integration -w @post-anki/api`.

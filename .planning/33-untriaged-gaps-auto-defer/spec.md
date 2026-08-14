---
type: spec
branch: 33-untriaged-gaps-auto-defer
task: "[Story] Untriaged gaps auto-defer so they never pile up (#33)"
complexity: complex
state: confirmed
updated: 2026-08-14
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
---

# Plan: Untriaged gaps auto-defer (#33)

## What this story is, in one paragraph

Today a gap enters the world at `triage_state: "untriaged"` and stays there forever unless the
user taps a button. #33 makes the system take over after three days: the gap silently becomes
`auto_deferred` — still alive, still reachable by the daily push, just at reduced eligibility —
so the untriaged pile can never grow into an Anki-style guilt stack. This is an extension of
#29's just-shipped triage state machine (commit `c69651f`), not a new one: the same
`triage_state` column, the same pure-function-plus-locked-repo shape, the same read-time-predicate
vs scheduled-job split.

## Dependency and tracker-status findings (verified, not assumed)

- **#28** ("Gaps discovered in discussion are stored automatically") and **#23** ("User confirms
  or fails a question with one tap") — #33's two declared dependencies — are both **CLOSED**
  (`gh issue view 28/23 --json state`, and PM triage confirmed both shipped).
- **#29** ("User triages a gap as important, deferred, or dismissed") shipped as commit
  `c69651f` ("Add gap triage: important, defer, or dismiss (#29)") — verified via
  `git log --oneline -5`. Note the GitHub issue is still **OPEN** despite the merge; that is a
  tracker-hygiene artifact, not a code state. Every file this plan extends exists on `main`
  today.
- **#19** ("Daily architect question arrives automatically") — the "Enables" relationship — is
  **CLOSED**. `selectDailyPush` (`packages/core/src/curriculum/daily-push.ts:33`) and the
  `dailyPushJob` Cloud Scheduler entry (`infra/index.ts:286`) both exist, so #33's push-weighting
  work lands on a live surface rather than a hypothetical one.
- **#29 explicitly reserved this story's enum value.** `apps/api/src/db/schema.ts:428-432`:

  > `triageState`'s literal enum value is `user_deferred`, not `deferred` — reserves
  > `auto_deferred` as a future sibling (issue #33) without another migration touching this
  > column.

  The identical note is at `packages/shared/src/gap.ts:16-20`. This is the single most useful
  fact in the plan: `triage_state` is a plain `text("triage_state").notNull().default("untriaged")`
  column (`schema.ts:433`), **not** a Postgres enum type, so adding a fifth value costs **zero**
  migration work on that column. The migration this story generates adds only two brand-new
  columns.

- **`/gaps` still does not exist.** Confirmed independently for this plan:
  `apps/bot/src/conversation/reply.ts:38-46`'s `selectReply` recognises exactly `/start`,
  `/today`, `/push`, `/study` — nothing else. The three `/gaps…` strings in
  `apps/bot/src/api/client.ts:184,191,195` are HTTP paths to the API, not Telegram commands.
  #43 ("On-demand gap list for any registered tool") is marked **CLOSED** on GitHub but was
  closed without a linked commit — the same closed-but-unbuilt finding
  `.planning/2026-08-14-gap-triage/todo.md` §"To review / clarify" item 1 already recorded.
  See Decision 1 for how this story resolves it.

---

## The two real spec-vs-code gaps, resolved

### Decision 1 — the `/gaps` dependency: #33 does NOT depend on #43, and does NOT build it

**The problem.** The issue's acceptance list contains:

> - User can see auto-deferred gaps in /gaps (listed under 'Deferred') but is never pestered
>   about them
> - Auto-deferred gaps display in /gaps alongside user-deferred gaps (both under 'Deferred'
>   section) but the system tracks them differently internally

and a whole sub-section, "Visual distinction in /gaps between auto-deferred and user-deferred",
specifying `'[gap text] (auto-filed)'` vs `'[gap text] (deferred by you)'`. None of that can
render, because the command does not exist.

**The resolution.** Neither of the two obvious answers is right. #33 does not block on #43, and
#33 does not build a shadow `/gaps`.

Reason it does not block: **#33 has a user-facing delivery surface it owns outright — the daily
push.** The issue's own weight table is a push-selection table, and `selectDailyPush` is live
today (#19 closed). An auto-deferred gap really does reach the user on Telegram, as a pushed
question, with no new UI at all. That makes #33 end-to-end reachable and testable the day it
lands. This is a *stronger* position than #29 had: #29 shipped with a documented reachability
hole (`.planning/2026-08-14-gap-triage/plan.md` §"Known limitation — reachability until #27
ships") because a brand-new gap had no trigger; #33's behaviour is observable through a surface
that already ships.

Reason it does not build `/gaps`: that is #43's entire issue body — fuzzy tool matching, the
≤5/>5 keyboard threshold, archived-tool banners, the 15-gap "Show more" pagination, the
4096-character limit. Building any of it here is scope theft, and building a lesser version
guarantees a rewrite when #43 is done properly.

**What #33 builds instead:** the exact display copy the issue specifies, as a pure, unit-tested
formatter in `apps/bot/src/gap-triage/gap-triage-view.ts` — the module #29 created explicitly for
this kind of reuse:

> `apps/bot/src/gap-triage/gap-triage-view.ts:5-9` — "Reusable triage keyboard/callback module
> (issue #29) … **#27 and #43 are both expected to call into this same module** from their own
> trigger points once they land."

So the labels are written once, here, tested, and wired by #43 with a one-line import. What is
**not** closable by this story: the two acceptance bullets quoted above that say "in /gaps". They
are listed in "Known limitations" as blocked on #43, not silently marked done. See also
todo.md's tracker-hygiene item — #43 needs reopening.

### Decision 2 — "≈1/3 the frequency" against a deterministic single-pick sorter

**The problem.** The issue's table reads:

> | Untriaged (< 3 days old) | Normal (1× base weight) |
> | Auto-deferred | Lower (≈ 1/3 base weight) |

`selectDailyPush` (`packages/core/src/curriculum/daily-push.ts:33-95`) has **no weight concept and
no randomness**. It builds one pool, sorts it strictly (`wanted` first, then
`DEPTH_RANK[gap.depth] - DEPTH_RANK[depth]`), and returns `ranked[0]` — a single deterministic
pick per call. There is no sampler to attach a weight to. Worse, it has no rotation either: the
same top-ranked gap wins every day until it is covered.

**Rejected: probabilistic sampling.** Turning `selectDailyPush` into a weighted random sampler
would (a) introduce non-determinism into a pure function whose entire existing test suite
(`daily-push.test.ts`) asserts exact picks, (b) require an RNG or seed parameter threaded through
`packages/core`, which exists nowhere in this codebase, and (c) silently change behaviour for
`important`/`wanted`/`weakest` gaps that #29 and #19 already specified as strict tiers. That is
building a different system than the one that is there.

**Rejected: a rank penalty.** Adding a constant to `rank()` for auto-deferred gaps makes them lose
to *every* untriaged gap, always. That is a frequency of 0 whenever anything else is eligible —
the opposite of "remains in rotation".

**Chosen: a deterministic per-gap eligibility rotation.** An auto-deferred gap is **push-eligible
one day in three**, on a slot anchored to its own auto-defer moment:

```
eligible today  ⟺  utcDayIndex(now) − utcDayIndex(autoDeferAnchor(gap))  is ≥ 0 and ≡ 0 (mod 3)
autoDeferAnchor(gap) = gap.untriagedSince + AUTO_DEFER_AFTER_DAYS
utcDayIndex(iso)     = Math.floor(Date.parse(iso) / DAY_MS)
```

On its eligible day the gap competes at full base weight against untriaged gaps — same pool, same
sort, no handicap. On the other two days it is filtered out exactly the way a live `user_deferred`
gap already is. Over any window it is eligible for one third of the days an untriaged gap is,
which is the honest, implementable reading of "≈1/3 base weight" inside a sort-based selector.

Three properties that make this the right shape:

1. **Deterministic and unit-testable** — the only input is `now`, which every core function here
   already takes explicitly.
2. **Per-gap, not global** — anchoring on each gap's own auto-defer moment spreads eligibility
   across the population. A global `dayIndex % 3` would create one "auto-defer day" where the
   entire backlog floods the pool and two days where none of it appears.
3. **The anchor is derived, never stored-dependent** — `untriagedSince + 3d` is computable before
   the sweep job has materialised anything, so the rotation phase does **not** shift when the
   sweep runs. That collapses the stored-vs-derived divergence risk to zero. (A hand-rolled hash
   of `gap.id` was the other candidate for spreading the slots; the timestamp anchor is strictly
   better — no invented primitive, and it explains itself: "every third day since it was filed.")

**AC wording follows the reinterpretation.** Every acceptance criterion in `scenarios.md` phrases
this as *eligibility*, never as observed frequency: no test in this repo can assert "this gap was
pushed 1/3 as often", because `selectDailyPush` returns one pick and the Cloud Scheduler cadence
that calls it is outside unit-test reach (the same limit `.planning/2026-08-14-gap-triage/todo.md`
item 3 already recorded for "important gaps appear within 5-7 days").

---

## Decisions made autonomously

3. **The 3-day timer needs a new column: `gaps` has no `created_at`.** Verified —
   `schema.ts:416-439` has `id, topic_id, label, depth, origin, state, wanted, concern,
   last_evaluated_at` plus #29's six triage columns, and no creation timestamp anywhere. Rather
   than add `created_at` (which would be wrong on the second requirement anyway), this story adds
   **`untriaged_since`**, meaning *"the moment this gap most recently entered the untriaged
   state."* One column satisfies both of the issue's timer rules at once:

   > Timer starts at gap CREATION time — the moment the server processes the Fail tap event

   > **Repeat-cycle timer reset:** Each time a gap returns to Untriaged state … the full 3-day
   > timer resets from the moment it re-entered Untriaged.

   A `created_at` column plus a separate reset field would encode the same thing twice.

4. **`untriaged_since` is `notNull().defaultNow()`, and that backfill is a feature.** Existing
   rows get the migration's own timestamp, so every gap already in the database starts a fresh
   3-day window at deploy time instead of the entire historical backlog auto-deferring in the
   first sweep. Deliberate: a silent mass state-flip on deploy day would be the exact "system did
   something drastic without telling me" experience this story exists to prevent. Disclosed under
   Known limitations.

5. **`auto_deferred_at` is a separate nullable column, and `triaged_at` is NOT stamped on
   auto-defer.** `triaged_at` means "the user made a decision"; auto-defer is explicitly not a
   user decision ("Auto-defer is a system housekeeping action, not a user choice"). Leaving
   `triaged_at` null keeps that distinction honest and queryable, and gives a later story
   ("auto-filed 5 days ago") a real timestamp to read without inventing one.

6. **A new Cloud Scheduler job hitting the API directly, not a piggyback on `gapResurfaceJob`.**
   The existing daily job (`infra/index.ts:311-329`) POSTs to the **bot's** `/gap-resurface`
   (`apps/bot/src/server.ts:63-79`) because its whole purpose is sending Telegram messages. #33's
   sweep sends nothing — the issue is explicit: "No notification is sent about the auto-defer —
   it's silent." Routing a database-only housekeeping sweep through a Telegram-delivery service
   would put a DB write behind an unrelated boundary and couple it to the bot's uptime. The sweep
   instead mirrors **`docScanJob`** (`infra/index.ts:336-352`), the repo's existing precedent for
   an API-targeted scheduled job: `httpTarget.uri` on `apiDomain`, `Authorization: Bearer
   ${apiSharedSecret}` — which `apps/api/src/server.ts:212-226`'s `authorized()` already verifies
   for every route, so **no new auth code is written**.

7. **Scheduled at 06:00 Europe/Warsaw, two hours before the push.** `dailyPushSchedule` and
   `gapResurfaceSchedule` both default to `"0 8 * * *"` (`infra/index.ts:10,14`). Running the
   sweep at 06:00 means a gap that crosses its 3-day line overnight is already materialised as
   `auto_deferred` before that morning's push and before any user-visible read that day. Its own
   config keys (`autoDeferSweepSchedule` / `autoDeferSweepTimeZone`) so it can be retimed
   independently, matching how #29 gave `gapResurfaceSchedule` its own key.

8. **Behaviour is read-time-derived; the sweep only materialises.** This copies #29's most
   important structural decision verbatim (`packages/core/src/curriculum/gap.ts:88-92`):

   > correctness cannot depend on the once-a-day gapResurfaceJob having already run: a deferral
   > that expired minutes ago must be excluded (still live) or included (once past
   > `deferredUntil`) correctly on every read.

   So `effectiveTriageState(gap, now)` — a pure function — is the single authority for every
   *behavioural* question (push eligibility, fail-reactivation). The sweep exists so the stored
   `triage_state` column matches what the system already believes, for SQL-level filtering,
   counting, and #43's future section grouping. The column never leads; it follows.

9. **The rotation predicate lives in the new auto-defer module; `isPushExcluded` composes it.**
   `isPushExcluded` stays the single gate `selectDailyPush` calls (it is that function's only
   consumer, per its own doc comment at `gap.ts:82-92`), but the modular-arithmetic slot logic
   lives in `isAutoDeferredPushEligible` next to the rest of the auto-defer rules. Naming note
   taken deliberately: `isPushExcluded(gap, now)` answers "is this gap out of *this* run's push",
   which is already how #29 uses it for a live deferral — a per-`now` answer, not a permanent
   property. No rename.

10. **Only `auto_deferred` reactivates on a Fail. `user_deferred`, `important` and `dismissed` do
    not.** The issue specifies the transition for auto-deferred gaps only. Extending it to
    `user_deferred` would override an explicit "not now" the user chose and #29 promised to honour
    for 60 days; `important` is already at top priority so there is nothing to raise;
    `dismissed` is a considered judgment #29 protects behind a 6-month check-in. A one-line rule
    with a clear boundary.

11. **An already-`untriaged` gap gets NO timer reset from a Fail.** The issue forecloses this in
    its own worked example:

    > A user can be actively learning Lambda cold starts on Tuesday and Wednesday — the Lambda
    > cold start GAP is still auto-deferred on Thursday if it was logged Monday and never
    > triaged.

    Reactivation keys on the gap having been (effectively) auto-deferred, not on the Fail alone.

12. **Reactivation keys on *effective* state, not stored state.** A gap that crossed its 3-day
    line but has not been swept yet is, to the user, an auto-deferred gap — a Fail on it must
    reset the timer. Using stored state would make the outcome depend on whether the 06:00 job
    happened to have run, which is exactly the class of bug decision 8 exists to prevent.

13. **The sweep touches every `untriaged` gap regardless of `gaps.state`.** Scoping it to
    `state = 'open'` would let the stored column diverge from `effectiveTriageState` for a
    covered-but-never-triaged gap, reintroducing the two-sources-of-truth problem. `gaps.state`
    remains completely untouched by this story, exactly as #29 left it.

14. **No push copy changes, no provenance marker in the pushed question.** The issue says "No
    notification is sent about the auto-defer — it's silent," and says nothing about the push
    message. Adding "(auto-filed)" to a pushed question would be an unrequested embellishment of
    the same kind #29's decision 6 declined ("no added 'N days ago' elapsed-time string"). Logged
    as an explicit decision rather than left as silence.

15. **The bot label formatter takes `(gap)` only — no `now` parameter.** `apps/bot/package.json`
    depends on `@post-anki/shared` but **not** `@post-anki/core` (verified), so the bot cannot
    call `effectiveTriageState` without a new package dependency. It does not need to: whichever
    section #43 files a gap under will itself be driven by the stored `triage_state`, so a
    label driven by the same stored value is always internally consistent with its own heading.
    Cost: a <24h window where a due-but-unswept gap shows under "Untriaged" with no suffix. Since
    the sweep runs at 06:00 and the push at 08:00, the user never sees that window in practice.

16. **No web-dashboard surfacing of auto-defer.** Not requested by #33's acceptance criteria;
    identical boundary to #29's decision 8. Telegram + API only.

---

## User-facing behaviour, concretely

**Day 0.** User taps Fail on a question. `submitProbe` writes a gap (or a verdict on an existing
one). `untriaged_since = now`. Nothing is sent about triage — unchanged from today.

**Days 0-2.** The gap is fully eligible for the daily push, exactly as now.

**Day 3, 06:00.** The sweep flips it to `auto_deferred`, stamps `auto_deferred_at`, leaves
`triaged_at` null. **No Telegram message. No badge. No count.** The user experiences nothing.

**Day 3 onward.** The gap is push-eligible on day 3, day 6, day 9 … and filtered out on the days
in between. When eligible it competes normally and can win the day's push.

**Any day.** The user taps Fail on that same concept again. Per #28's dedup rule no new gap is
created; instead the existing gap returns to `untriaged`, `untriaged_since = now`,
`auto_deferred_at = null`, full base eligibility restored immediately. Silent, per the issue.

**Any day.** The user taps `Important` (via #29's keyboard, or `/gaps` once #43 exists). The gap
becomes `important`, and — because `effectiveTriageState` only ever derives `auto_deferred` from
the `untriaged` state — the auto-defer timer is permanently off it. "'Important' gaps are never
auto-deferred."

**Once #43 ships.** The Deferred section reads:

```
Deferred (2):
• Plugin API internals (deferred by you)
• Hydration boundary behavior (auto-filed)
```

Verbatim from the issue's "Visual distinction" section. No other copy is invented anywhere in
this story.

---

## Architecture

### Business logic changes

A gap acquires a lifecycle it never had: an untriaged gap now expires into a lower-eligibility
system-managed state after three days, and a repeat Fail pulls it back to full eligibility. The
user's obligation to triage becomes genuinely optional — the guilt pile is structurally
impossible, because nothing accumulates in a state that demands attention.

### Architectural changes

- `packages/core` gains a second module in the `gap-triage/` folder #29 created: the pure
  auto-defer rules, alongside the pure triage-tap rules. No I/O, `now` always injected.
- `packages/core/src/curriculum/gap.ts` gains a new intra-package import edge
  (`curriculum → gap-triage`). No cycle: `gap-triage/` imports only from `@post-anki/shared`.
  `npm run depcruise` is a gate for this.
- `apps/api` gains one scheduled-sweep endpoint. It is the first API route whose only caller is a
  scheduler and whose only output is a count.
- `infra` gains a third Cloud Scheduler job, the second one targeting the API directly.
- `apps/bot` gains display copy only — no new endpoint, no new callback kind, no new keyboard.

### Schema

Two new columns on `gaps` (`apps/api/src/db/schema.ts`, after `dismissedCheckinSentAt` at line
438). **The `triage_state` column itself is not altered** — see the top of this document.

```ts
// Auto-defer timer (issue #33). "The moment this gap most recently entered the
// untriaged state" — one column covering BOTH of the issue's timer rules
// (starts at creation; full reset on every return to untriaged). notNull +
// defaultNow deliberately backfills existing rows with the migration
// timestamp, so no historical gap mass-auto-defers on deploy day.
untriagedSince: timestamp("untriaged_since", { withTimezone: true }).notNull().defaultNow(),
// Stamped by the sweep only. `triagedAt` is deliberately NOT written on an
// auto-defer — that column means "the user decided something," and this is
// explicitly system housekeeping, not a user choice.
autoDeferredAt: timestamp("auto_deferred_at", { withTimezone: true }),
```

### Contracts (`packages/shared/src/gap.ts`)

```ts
export const gapTriageStateSchema = z.enum([
  "untriaged",
  "important",
  "user_deferred",
  "auto_deferred",   // issue #33 — the sibling #29's comment above reserved
  "dismissed",
]);
```

and two fields on `gapSchema`:

```ts
untriagedSince: z.string(),
autoDeferredAt: z.string().nullable(),
```

`untriagedSince` is non-nullable to match the column; it carries a stale-but-harmless value for a
gap in any non-`untriaged` state, because no predicate reads it outside the `untriaged` branch.

### Pure logic — new file `packages/core/src/gap-triage/auto-defer.ts`

Same shape as `gap-triage.ts`: no I/O, `now: string` injected, returns `TriageResult`
(`{ gap: Gap; changed: boolean }`, `gap-triage.ts:6-9`) so both modules' outputs are
interchangeable at the repo layer.

```ts
import type { Gap, GapTriageState } from "@post-anki/shared";
import type { TriageResult } from "./gap-triage";

export const AUTO_DEFER_AFTER_DAYS = 3;
export const AUTO_DEFERRED_PUSH_INTERVAL_DAYS = 3;

/** `untriagedSince + 3d` — the moment this gap becomes (or became) auto-deferred.
 *  Derived, never read from `autoDeferredAt`, so the push rotation's phase is
 *  identical before and after the sweep materialises the state. */
export function autoDeferAnchor(gap: Gap): string;

/** True once `now >= autoDeferAnchor(gap)`, for an `untriaged` gap only. */
export function isAutoDeferDue(gap: Gap, now: string): boolean;

/** The single authority for every behavioural question. Returns `"auto_deferred"`
 *  for an untriaged-and-due gap even before the sweep has run; returns
 *  `gap.triageState` unchanged in every other case. */
export function effectiveTriageState(gap: Gap, now: string): GapTriageState;

/** `untriaged` + due -> `auto_deferred`. Stamps `autoDeferredAt`; leaves
 *  `triagedAt`, `untriagedSince`, `deferralCount` and `state` untouched.
 *  `changed: false` for every other input. */
export function applyAutoDefer(gap: Gap, now: string): TriageResult;

/** A fresh Fail on a gap whose EFFECTIVE state is `auto_deferred`:
 *  -> `untriaged`, `untriagedSince = now`, `autoDeferredAt = null`.
 *  `changed: false` for every other effective state — including plain
 *  `untriaged` (the issue's Tuesday/Wednesday/Thursday rule). */
export function reactivateOnFail(gap: Gap, now: string): TriageResult;

/** The Decision-2 rotation: eligible on the anchor day and every 3rd day after. */
export function isAutoDeferredPushEligible(gap: Gap, now: string): boolean;
```

Exported through `packages/core/src/index.ts` with one added line next to
`export * from "./gap-triage/gap-triage";` (line 4).

### Push eligibility — `packages/core/src/curriculum/gap.ts`

`isPushExcluded` (line 93) gains one branch, placed before the existing `user_deferred` branch:

```ts
if (effectiveTriageState(gap, now) === "auto_deferred") {
  return !isAutoDeferredPushEligible(gap, now);
}
```

`selectDailyPush` (`daily-push.ts:33`) needs **no change at all** — it already calls
`isPushExcluded` at line 39. The `important` / `wanted` / `weakest` tier structure is untouched,
so an auto-deferred gap on its eligible day simply joins the `open` fallback pool and is ranked
by the existing `wanted`-then-depth sort. That is the whole point of Decision 2: the weight model
is expressed entirely through the existing gate, with zero change to the selector's shape.

### Fail reactivation — where a Fail actually lives (traced, not assumed)

This was the one place in the plan worth tracing all the way down, because the obvious hook is the
wrong one. The trace:

- **`applyGapVerdicts`** (`packages/core/src/curriculum/gap.ts:34`) has exactly **one** non-test
  call site in the repo: `apps/api/src/probe/probe.service.ts:160`.
- **A one-tap Fail does produce an explicit `covered: false`.**
  `apps/api/src/probe/probe-evaluation.ts:10-19`'s `localEvaluation` returns
  `verdicts: [{ gapId: probed.id, covered: selfOutcome === "pass" }]`. Good — but it is only
  reached when `shouldScoreLocally(mode, probed)` is true, which requires
  `mode === "quick_test"` **and** a non-null probed gap (`probe-evaluation.ts:3-8`).
- **The freeform path can omit the verdict entirely.** For every other mode, `evaluateAnswer`
  produces the verdict list from an LLM, which may return nothing for the probed gap.
  `probe.service.ts:180-186` already handles that, and its handling is the definition of a fail in
  this codebase:

  ```ts
  const outcome = probed
    ? evaluation.verdicts.find((v) => v.gapId === probed.id)?.covered === true
      ? "pass"
      : "fail"
    : "pass";
  ```

  `?.covered === true ? "pass" : "fail"` — **a missing verdict is a fail.** So hooking
  reactivation inside `applyGapVerdicts`' `coveredById.has(gap.id)` branch would silently miss
  every freeform fail, and SCENARIO 3 would pass its unit test while not working in the product.

**Therefore `applyGapVerdicts` and `packages/core/src/curriculum/gap.ts`'s verdict logic are NOT
modified.** The reactivation hooks in `probe.service.ts` on the same expression that already
defines a fail, hoisted so it can be reused instead of duplicated:

```ts
// issue #33 — one definition of "the user failed this gap", used both for the
// reactivation below and for the reported `outcome`. A MISSING verdict counts
// as a fail, matching what line 180 already did before this story.
const probedFailed =
  probed !== null &&
  evaluation.verdicts.find((v) => v.gapId === probed.id)?.covered !== true;

const updated = applyGapVerdicts(gaps, evaluation.verdicts, now).map((gap) =>
  probedFailed && gap.id === probed!.id ? reactivateOnFail(gap, now).gap : gap,
);
```

and the existing `outcome` expression collapses to `probed ? (probedFailed ? "fail" : "pass") :
"pass"` — a net removal of a duplicated conditional, not an addition.

Everything downstream is already in place: `persistGaps(updated)` at line 169 gains the two new
fields (below), so the reactivation commits with no repo or controller change.

**Which surface a Fail tap is on today (verified).** #23's one-tap pass/fail buttons are in the
**web** probe UI — `apps/web/src/curriculum/probe-answer.tsx:165,173`, sending
`selfOutcome: 'pass' | 'fail'`. The **Telegram bot never sends `selfOutcome`**:
`apps/bot/src/api/client.ts:48-68`'s `submitAnswer` posts only `{ gapId, mode, answer }`, and
`apps/bot/src/nav/dispatcher.ts`'s callback kinds contain no pass/fail button. So SCENARIO 3 is
walkable end-to-end on the web probe UI, and on Telegram via the freeform path's derived fail.
This is a fact about where #23 shipped, not something this story changes.

**Not covered, deliberately:** `apps/api/src/probe-session/probe-session.service.ts` (the bot's
MCQ quiz / #57's mastery cycle) never calls `applyGapVerdicts` and is not touched here — see
Known limitations 7.

`socratic.service.ts:181` writes only `state: "covered"` via a `{ ...gap }` spread and needs no
change at all.

### Persistence plumbing — every touch point

| File / line | Change |
|---|---|
| `apps/api/src/gap/gap.repo.ts:29` `rowToGap` | map `untriagedSince` (ISO) and `autoDeferredAt` (ISO-or-null) |
| `apps/api/src/gap/gap.repo.ts:74-98` `persistGaps` | add `untriagedSince` + `autoDeferredAt` to the `.set({…})` — this is what makes Fail-reactivation commit with no repo change at the call site |
| `apps/api/src/gap/gap.repo.ts:105-140` `insertDiscoveredGaps` | **add `now: string` to the signature** and write `untriagedSince: new Date(now)` into the insert values *explicitly*, plus `untriagedSince: now, autoDeferredAt: null` in the hand-built returned `Gap` literal (lines ~128-140). Do **not** lean on the column default here: the default fires at DB-clock time while the returned DTO carries app-clock `now`, and the two would disagree by milliseconds — enough to make an equality assertion in a test flake. Its one call site, `probe.service.ts:171`, already has `now` in scope. |
| `apps/api/src/gap/gap.controller.ts:50` `handleDeclareGap` | same rule — write `untriaged_since` explicitly from the request's `now`, and return both new fields in the DTO |
| `apps/api/src/learning-list/slice-generation.orchestrator.ts:296` | bulk `insert(gaps)` with no returned `Gap` literal — the column default is correct and sufficient here; confirm no DTO is built from these rows before re-reading them |
| `apps/api/src/gap/gap-triage.repo.ts:56-67` `triageGapLocked` | add both fields to the `.set({…})` so a `revisit` (`untriaged` transition) resets `untriagedSince` |
| `apps/api/src/gap/gap-triage.repo.ts:120-127` `markGapResurfaced` | the `deferral-expired` branch sets `triageState: "untriaged"` — must now also set `untriagedSince: new Date(now)`, or an expired 60-day deferral would return to untriaged already past its 3-day line |
| `apps/api/src/socratic/socratic.service.ts:181` | **no change** — spreads `...gap`, so both new fields ride along automatically |

The `markGapResurfaced` row is the easiest thing in this plan to miss and the most user-visible if
missed: a 60-day deferral expiring, resurfacing, and being auto-filed on the same day.

`applyTriageAction` (`gap-triage.ts:24`) also needs `untriagedSince: now` on its `applyRevisit`
branch (line 79-95), for the same reason — `revisit` is a return to `untriaged`, and the issue
says every return earns a fresh full window.

### The sweep

**Repo** — `apps/api/src/gap/gap-triage.repo.ts`, following `listGapsDueForResurface`'s exact
"narrow in SQL, decide in the unit-tested pure predicate" structure (its doc comment at lines
75-79) and `triageGapLocked`'s `SELECT … FOR UPDATE` convention:

```ts
const SWEEP_BATCH_LIMIT = 500;

export async function sweepAutoDeferredGaps(
  now: string,
): Promise<{ autoDeferred: number; capped: boolean }>;
```

Selects `where(eq(gaps.triageState, "untriaged"))` **ordered `asc(gaps.untriagedSince)`** with
`.limit(SWEEP_BATCH_LIMIT)`, filters in JS with `isAutoDeferDue`, then for each due gap runs a
locked transaction (re-read `.for("update")`, `applyAutoDefer`, conditional `.update()`).

**The `orderBy` is load-bearing, not cosmetic.** With more than `SWEEP_BATCH_LIMIT` untriaged
gaps, an unordered `LIMIT` could return the same 500 not-yet-due rows every single run while
genuinely due gaps are never reached — a sweep that reports success forever and does nothing.
Oldest-first guarantees the due ones are always in the batch, and makes `capped: true` mean
"there is more work, retry sooner" rather than "results are arbitrary".

The cap itself exists purely to bound the scheduler's `attemptDeadline`; a capped run is picked up
by the next day's. No LLM calls, no external fetches — the run's cost is one indexed read plus N
narrow updates.

**Controller** — `apps/api/src/gap/gap.controller.ts`, alongside `handleDueForResurface`
(line 146):

```ts
export async function handleAutoDeferSweep(res: http.ServerResponse): Promise<void>;
```

Reads `new Date().toISOString()`, calls the repo, `sendJson(res, 200, result)`. Same signature
shape as `handleDueForResurface` (response-only, no body to parse).

**Routing** — three coordinated edits, following how every other route is wired:
- `apps/api/src/router.ts` `RouteName` union (near `"markGapResurfaced"`, line 49): add
  `| "sweepAutoDeferGaps"`.
- `apps/api/src/router-table.ts` (next to the other `/gaps` routes, lines 72-81):
  `{ method: "POST", pattern: "/gaps/auto-defer-sweep", name: "sweepAutoDeferGaps" }`. **Order
  matters** — it must sit above the `/^\/gaps\/([^/]+)\/…$/` patterns is not a concern (no
  overlap), but it must sit above `PATCH /^\/gaps\/([^/]+)$/`… which is a `PATCH`, so no
  collision either. Place it directly after the `"/gaps/due-for-resurface"` literal at line 73,
  which is the same literal-before-regex placement that route already relies on.
- `apps/api/src/server.ts` dispatch `switch` (next to `case "markGapResurfaced"`, line 385):
  `case "sweepAutoDeferGaps": return handleAutoDeferSweep(res);`

Auth: none written. `authorized()` (`server.ts:212-226`) already gates every route on
`Bearer ${API_SHARED_SECRET}`.

**Infra** — `infra/index.ts`, mirroring `docScanJob` (lines 336-352):

```ts
const autoDeferSweepSchedule = config.get("autoDeferSweepSchedule") ?? "0 6 * * *";
const autoDeferSweepTimeZone = config.get("autoDeferSweepTimeZone") ?? "Europe/Warsaw";

const autoDeferSweepJob = new gcp.cloudscheduler.Job("auto-defer-sweep", {
  project: projectId,
  region,
  name: "post-anki-auto-defer-sweep",
  schedule: autoDeferSweepSchedule,
  timeZone: autoDeferSweepTimeZone,
  attemptDeadline: "60s",
  httpTarget: {
    httpMethod: "POST",
    uri: pulumi.interpolate`https://${apiDomain}/gaps/auto-defer-sweep`,
    headers: { Authorization: pulumi.interpolate`Bearer ${apiSharedSecret}` },
  },
}, { dependsOn: [apiService, ...enabledApis] });

export const autoDeferSweepJobName = autoDeferSweepJob.name;
```

`apiSharedSecret` is already `config.requireSecret` (line 30), so no new Pulumi config step —
unlike #49, which had to introduce it.

### Bot display copy — `apps/bot/src/gap-triage/gap-triage-view.ts`

Appended to the existing copy constants (lines 51-61), verbatim from the issue:

```ts
// Issue #33's "Visual distinction in /gaps" section, verbatim. Same section,
// distinct label — "prevents the user from wondering why they 'chose' to defer
// something they never consciously acted on."
export const AUTO_FILED_SUFFIX = "(auto-filed)";
export const USER_DEFERRED_SUFFIX = "(deferred by you)";

export function deferredGapListLabel(gap: Gap): string;
```

Returns `` `${gap.label} ${AUTO_FILED_SUFFIX}` `` for `auto_deferred`,
`` `${gap.label} ${USER_DEFERRED_SUFFIX}` `` for `user_deferred`, and bare `gap.label` for every
other state. Not wired to any surface in this story — #43 imports it (see Decision 1). Unit
tested in the existing `gap-triage-view.test.ts`.

---

## Quality gates

Run from the repo root unless noted. Verified against `package.json` — **there is no repo-wide
ESLint**; the only `"lint"` script in the workspace is `apps/bot`'s, which is itself
`tsc -p tsconfig.json --noEmit`. So the type gate *is* the lint gate here.

1. `npm run typecheck` — root, fans out to every workspace.
2. `npm run test` — root, fans out to every workspace's `vitest run`.
3. `npm run test:integration -w @post-anki/api` — real Postgres; needs
   `npm run e2e:db:up` (docker, port 5436) first.
4. `npm run depcruise` — specifically guards the new `curriculum → gap-triage` import edge.
5. `npm run check-no-dynamic-imports` and `npm run check-web-node-builtins` — unchanged by this
   story, run for completeness.

### Migration

Generate, never hand-write:

```
npm run db:generate:api      # === npm run db:generate -w @post-anki/api  (drizzle-kit generate)
```

Confirm a **new** file appears in `apps/api/src/db/migrations/` — the latest committed today is
`0040_fantastic_oracle.sql`, so expect `0041_*.sql` plus a matching
`apps/api/src/db/migrations/meta/0041_snapshot.json` and a new `_journal.json` entry. Inspect the
generated SQL and confirm it contains exactly two `ALTER TABLE "gaps" ADD COLUMN` statements
(`untriaged_since`, `auto_deferred_at`) and **no** statement touching `triage_state`, `state`,
`wanted`, `concern`, or any #29 column. Then apply with `npm run db:migrate:api`.

See todo.md for the migration-journal ordering constraint carried forward from #29 — `git status`
currently shows `0039_robust_exodus.sql` as a newly-added (uncommitted) file while
`0040_fantastic_oracle.sql` is committed, so the journal needs re-verification before anyone
generates.

---

## Known limitations

1. **The two "in /gaps" acceptance bullets are not closable by this story.** `/gaps` does not
   exist (#43 closed-but-unbuilt). The `(auto-filed)` / `(deferred by you)` labels ship as a
   tested formatter with no live caller. This is disclosed, not routed around by inventing a
   substitute command — see Decision 1.
2. **"≈1/3 the frequency" is delivered as "eligible one day in three."** No test in this repo can
   assert an observed push frequency; `selectDailyPush` returns one deterministic pick per call
   and its cadence is a Cloud Scheduler concern. Same class of limit as #29's "important gaps
   appear within 5-7 days" note.
3. **Existing gaps get their 3-day clock from the migration timestamp, not their true creation
   time** — `gaps` never had a `created_at` to recover it from. Consequence: the first
   auto-defers happen three days after deploy, not immediately. Deliberate (Decision 4).
4. **The display label can lag stored state by up to one sweep interval.** A gap that crosses its
   3-day line at 09:00 shows as untriaged (no suffix) until the 06:00 sweep the next morning.
   *Behaviour* never lags — push eligibility is read-time-derived (Decision 8). Only the label.
5. **Auto-deferred gaps are still fully eligible for probe and Socratic session generation.**
   `isPushExcluded` gates `selectDailyPush` only; `openGaps` / `inScopeGaps` / `nextGapToProbe`
   are untouched, exactly the boundary #29 drew and #33's acceptance criteria (all
   push-selection-scoped) do not ask to move.
6. **No auto-defer state is visible in the web dashboard.** Telegram + API only (Decision 16).
7. **A miss in the bot's MCQ quiz does not reactivate an auto-deferred gap.**
   `apps/api/src/probe-session/probe-session.service.ts` (#57's mastery cycle) has its own
   advisory-lock-guarded transaction, never calls `applyGapVerdicts`, and only ever flips
   `gaps.state` to `covered`. Reaching into it would mean adding a triage write inside #57's
   concurrency-critical path for evidence the issue does not name — #33's declared dependency is
   #23 (the one-tap pass/fail), and that write path is fully covered. Disclosed as a follow-up
   rather than silently missed; see todo.md.

## Explicitly out of scope

- Building the `/gaps` command in any form, minimal or otherwise (#43's issue body).
- The session-summary trigger surface (#27, still open).
- Any notification, badge, digest or count about auto-deferral — the issue says silent, twice.
- Changing user-deferred behaviour: the 60-day exclusion, `deferralCount`, the
  `Actually dismiss?` threshold, and the 6-month dismissed check-in all stay exactly as #29
  built them.
- Reactivating a `user_deferred`, `important` or `dismissed` gap on a Fail (Decision 10).
- Any change to `gaps.state` (`open|covered|skipped`), to `gap_mastery`, or to
  `probe-session.service.ts`'s mastery cycle.
- Any change to `selectDailyPush`'s tier structure or to the `important` / `wanted` / `weakest` /
  `refresh` reasons.
- Web-dashboard surfacing (Decision 16).

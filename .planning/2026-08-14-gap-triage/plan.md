---
type: spec
branch: gap-triage
task: "[Story] User triages a gap as important, deferred, or dismissed (#29)"
complexity: complex
state: confirmed
updated: 2026-08-14
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
---

# Plan: Gap triage — Important / User-Deferred / Dismissed (#29)

## Dependency and tracker-status findings (verified, not assumed)

- #28 ("Gaps discovered in discussion are stored automatically") and #44 ("Gap resolved when
  consistently demonstrated") — #29's two declared dependencies — are both **CLOSED**
  (`gh issue view 28/44 --json state`).
- No triage state machine exists today: `grep -rl "deferral_count\|userDeferred\|user_deferred"
  apps/bot apps/api` returns nothing. `packages/shared/src/gap.ts`'s `gapSchema` has only
  `state: open|covered|skipped` and a `wanted` boolean — no triage concept.
- **Tracker/reality mismatch found during this planning pass**: #29's own spec text says the
  triage keyboard is "owned by #29 across all contexts" and lists two trigger surfaces —
  session summary (#27) and the `/gaps` command (#43). #27 is **OPEN** (not a declared
  dependency of #29 — listed only as "Parallel with"). #43 is marked **CLOSED** on GitHub, but
  `grep -rn "'/gaps'\|GAPS_REPLY" apps/bot/src` returns nothing, `apps/bot/src/conversation/
  reply.ts`'s `selectReply` recognizes only `/start`, `/today`, `/push`, `/study`, and the
  `#43` close event (`gh api repos/{owner}/{repo}/issues/43/timeline`) has no linked commit —
  it was closed without a merge. **#43 is closed-but-unbuilt.** Neither of #29's two intended
  trigger surfaces actually exists in the codebase today, regardless of GitHub status.
- **Resolution (not a blocker):** #29's own acceptance criteria include a delivery surface it
  owns outright — the 60-day resurfacing notification and the 6-month dismissed check-in are
  system-initiated Telegram messages, not something #27 or #43 need to exist first. This plan
  builds the full triage engine (schema, pure logic, API, reusable bot keyboard/callback
  module) plus that resurfacing delivery path, so the story is independently reachable and
  testable end-to-end without waiting on #27 or #43. Building `/gaps` here would be scope
  theft from #43's own (unbuilt) issue body — explicitly out of scope. See "Known limitation"
  below and `todo.md`.
- No collision with in-progress uncommitted WIP: `git status`/`git diff` show untracked
  `apps/api/src/cards/`, `apps/api/src/db/migrations/0032_robust_exodus.sql` and modified
  `apps/api/src/db/schema.ts`/`probe-session/*` — all additive `topic_card_sets`/`topic_cards`/
  `topic_card_variants` tables and probe-session/replenish changes. `gap.repo.ts`,
  `gap.controller.ts`, and the `gaps` table definition are untouched by that WIP. See the
  migration-ordering note in `todo.md` — this is a real *sequencing* constraint, not a file
  collision.

## Known limitation — reachability until #27 ships

Until #27 (session summary) lands, a **brand-new** gap has no user-facing path to its triage
keyboard on the day it's discovered — the only two Telegram-initiated triggers this plan builds
are the 60-day resurface and 6-month check-in, which by definition only fire on *already-triaged*
gaps. A freshly discovered gap sits at `triage_state: "untriaged"` with no message ever sent for
it until #27 (or #43) exists to display it. This is intentional scope discipline, not an
oversight — logged as a design call, not silently defaulted past (see `todo.md`). Manual
verification of the full tap-to-confirmation flow before #27 ships uses a direct `POST
/gaps/:id/triage` call (curl/Postman) or the resurfacing job against a gap seeded with an
already-expired `deferred_until`.

## User-facing interaction walkthrough

**How a gap reaches the keyboard (today, via this plan):** the daily resurfacing job (new,
below) is the only Telegram-initiated trigger this story builds. It fires once a day, finds gaps
whose 60-day deferral or 6-month dismissed check-in is due, and sends **one standalone Telegram
message per gap** — never a batch, never folded into the daily push message. (#27 and #43, once
built, will call the exact same keyboard/confirmation module to show the identical keyboard from
their own trigger points — this module is written once, here, and reused, per the issue's own
"owned by #29 across all contexts" instruction.)

**The message and buttons, verbatim** (issue's own copy, kept as-is — see "Decisions made
autonomously" for why nothing here was reworded):

Resurfaced 60-day deferral:
```
Your deferred gap is back: {gap label} ({tool name})
[ Important ]  [ Defer again ]  [ Dismiss ]
```
(after the 3rd re-deferral, a 4th button is appended: `[ Actually dismiss? ]`)

6-month dismissed check-in:
```
A few months back you dismissed this: {gap label} ({tool name}). Still confident?
[ Yes, still got it ]  [ Actually, let's revisit ]
```

Both messages already explain *why* the gap is showing up — "Your deferred gap is **back**" and
"A few months **back** you dismissed this" are both explicit callbacks to the prior triage
action, not generic gap text indistinguishable from a brand-new discovery. **Deliberate decision:
no additional "60 days ago" / elapsed-time counter was added** — the issue's copy already
satisfies "explains itself" without extra clutter, and adding a second, dynamically computed
timestamp string is unrequested scope on an already-fully-specified UX. Logged in `todo.md`.

**Button labels are the literal, human-readable strings above** — never internal names
(`user_deferred`, `triage_state`, a gap id). This matches every existing bot surface's tone
(`apps/bot/src/nav/menu.ts`: "⬅️ Back", "▶️ Continue: {label}"; `dispatcher.ts`'s error copy:
"Had a hiccup — send /start to begin again.") — short, plain, no jargon.

**Layout:** one row, three (or four, post-3rd-deferral) buttons side by side, via the existing
`chunkButtons(buttons, 3)` helper (`apps/bot/src/nav/keyboard.ts`) — matches the repo's existing
single-row pattern for short button sets (`showSubjects`'s "Continue" row).

**What happens immediately after a tap — no forced flow, no "next":**

1. User taps `Important` / `Defer again` / `Dismiss` on a gap's message.
2. The bot answers the callback query (removes Telegram's loading spinner — existing
   `answerCallbackQuery` call, same as every other button in this bot).
3. **That single message** is edited in place: the keyboard disappears, replaced by one line of
   confirmation text (exact strings below). No new message is sent. No other gap's message (if
   several are pending triage) is touched.
4. The user is free to tap any other pending gap message next, in any order, or ignore them —
   there is no linear "triage queue" the user must step through. This matches the issue's
   explicit "one message per gap, edits independently" constraint verbatim — a forced
   next-gap flow would violate it.

Confirmation text per button (issue's own copy):
- `Important` → `"Noted — {Tool}: {gap label} is flagged as important."`
- `Defer again` → `"Got it — deferred for 60 days."` (silent — no other message)
- `Dismiss` → `"Dismissed. I'll trust your judgment on this one."`
- `Actually dismiss?` → same as `Dismiss` (it's a shortcut to the same transition, not a
  separate one)
- `Yes, still got it` → the message is edited to a short acknowledgment, e.g.
  `"Good to know — I won't bring this one up again."` (no further state change; the gap was
  already `dismissed`)
- `Actually, let's revisit` → `"Reopened — I'll ask about it again."` (gap becomes `untriaged`)

**Reachability:** exactly one tap from the message that carries the keyboard — zero intermediate
menus, matching every other single-purpose action button already in this bot (e.g. quiz answer
buttons).

## Schema decision — columns on `gaps`, not a new table, and never touching `state`

`gaps` (`apps/api/src/db/schema.ts:291`) gains **six new columns**, in a new Drizzle migration
generated with `npm run db:generate -w @post-anki/api`:

```ts
triageState: text("triage_state").notNull().default("untriaged"),
triagedAt: timestamp("triaged_at", { withTimezone: true }),
deferredUntil: timestamp("deferred_until", { withTimezone: true }),
deferralCount: integer("deferral_count").notNull().default(0),
dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
dismissedCheckinSentAt: timestamp("dismissed_checkin_sent_at", { withTimezone: true }),
```

`triageState` enum values: `"untriaged" | "important" | "user_deferred" | "dismissed"`. The
literal value is `user_deferred`, not `deferred` — #33 ("Untriaged gaps auto-defer") needs an
`auto_deferred` sibling later, and this naming means #33 adds a value, not a migration touching
this one.

**Why columns, not a `gap_triage` sidecar table (unlike `gap_mastery`'s pattern):** `gap_mastery`
(`schema.ts:314`) is a *cycling, resettable* counter tracked across repeated probe attempts,
justifying its own table with its own lifecycle. Triage state is a **permanent, 1:1 attribute of
a gap** — the same shape as the existing `wanted`/`concern` columns already inline on `gaps`.
Adding a table here would be inventing a join for no benefit. The spec's one durability
requirement — "the dismissed gap record remains as audit history" — is satisfied by the
surviving `gaps` row itself; nothing is ever deleted.

**Why `important` is its own `triageState` value, not a reuse of `wanted`:** `wanted` is the
existing web-UI star toggle (`apps/web/src/curriculum/topic-row.tsx`). Telegram's `Important` tap
silently flipping that star would be a cross-surface side effect nobody asked for. `Gap`'s zod
schema (`packages/shared/src/gap.ts`) gains a `gapTriageStateSchema` enum and the six new fields;
`gap.repo.ts`'s `rowToGap`/`persistGaps` read and write them exactly like the existing fields.

**`state` (`open|covered|skipped`) is completely untouched.** `gapMaturity`, `progressFromGaps`,
`inScopeGaps` keep reading only `state` — zero behavior change for existing consumers. This is
the exact "orthogonal concept, don't overload state" lesson `gap.repo.ts`'s own comment already
documents for `gap_mastery`.

## Resurfacing computation — read-time exclusion, scheduled-job delivery (deliberate split)

Two different mechanisms for two different jobs, not one:

1. **Push-eligibility exclusion is a pure, read-time predicate** — `packages/core/src/
   curriculum/gap.ts` gains `isPushExcluded(gap, now): boolean` (dismissed → always excluded;
   user_deferred → excluded only while `now < deferredUntil`), consumed inside `openGaps`
   (used by `selectDailyPush`, `packages/core/src/curriculum/daily-push.ts`). This must be
   read-time and independent of whether the scheduled job has run yet: `selectDailyPush` runs on
   every push invocation, and correctness cannot depend on a once-a-day job having already fired
   — a deferral that expired 3 hours ago must be excluded (still) or included (once past
   `deferredUntil`) correctly on every single read, not just after the next scheduled tick.
2. **The state flip + Telegram notification is a scheduled job**, because a read-time
   computation structurally cannot send an unprompted message. New Cloud Scheduler job
   `gapResurfaceJob` (`infra/index.ts`, mirrors `dailyPushJob` at `infra/index.ts:282`), firing
   daily, hitting a new bot endpoint `POST /gap-resurface`.

`selectDailyPush` also gains a new top-priority tier: gaps with `triageState === "important"`
are picked before the existing `wanted` tier, before "weakest". "Important gaps appear in the
daily push selection within 5–7 days" is verified as **increased selection weight** (first
priority tier, deterministic unit test), not as a literal timer — no code path can assert a wall-
clock delivery deadline.

### Resurfacing endpoints (read candidates, then commit only after send succeeds)

- `GET /gaps/due-for-resurface` (read-only) → `{ userDeferredDue: Gap[], dismissedCheckinDue:
  Gap[] }`. `userDeferredDue`: `triageState = 'user_deferred' AND deferredUntil <= now`.
  `dismissedCheckinDue`: `triageState = 'dismissed' AND dismissedCheckinSentAt IS NULL AND
  dismissedAt <= now - 6 months`.
- `POST /gaps/:id/mark-resurfaced`, body `{ kind: "deferral-expired" | "dismissed-checkin" }`.
  `deferral-expired` → `triageState = 'untriaged'`, `deferredUntil = null`, `triagedAt = now`.
  `dismissed-checkin` → `dismissedCheckinSentAt = now` only (no `triageState` change — this is
  what makes the check-in a **one-time** event: once sent, the due-query's `IS NULL` clause never
  matches this gap again unless the user later re-dismisses it, which resets the field).

**Why two calls instead of one eager write:** if the bot's Telegram send fails after an eager
DB write, the gap would be silently marked "resurfaced" with no message ever delivered — a
correctness bug the spec explicitly cares about ("the user receives a Telegram notification" is
part of the state change, not a decoupled side effect). The bot only calls `mark-resurfaced`
for a gap **after** `sendMessageWithKeyboard`/`sendMessage` for that gap resolves successfully;
an undelivered gap stays `user_deferred`/un-checked-in and is retried on the next day's run —
naturally idempotent, no extra "attempted" flag needed.

## API surface (`apps/api`)

New route entries in `router.ts`'s `ROUTES`/`RouteName`, handlers in `apps/api/src/gap/
gap.controller.ts`, backed by a new `apps/api/src/gap/gap-triage.repo.ts`:

- `POST /gaps/:id/triage` — body `{ action: "important" | "defer" | "dismiss" }` → `{ gap: Gap,
  changed: boolean }`. Wraps `applyTriageAction` (below) inside `getDb().transaction()` with a
  `SELECT ... FOR UPDATE` on the target row — same locking shape as `gap-mastery.repo.ts`'s
  existing advisory-lock convention — so two concurrent taps on the same gap serialize into one
  real transition and one no-op.
- `GET /gaps/due-for-resurface` and `POST /gaps/:id/mark-resurfaced` — as above.

## Pure logic (`packages/core`)

New sibling module `packages/core/src/gap-triage/gap-triage.ts` (mirrors the existing
`packages/core/src/gap-mastery/gap-mastery.ts` sibling-folder convention):

```ts
export type TriageAction = "important" | "defer" | "dismiss";

export function applyTriageAction(
  gap: Gap,
  action: TriageAction,
  now: string,
): { gap: Gap; changed: boolean }
```

Transition rules:
- `important`: no-op (`changed: false`) if already `triageState === "important"`. Otherwise sets
  `triageState: "important"`, `triagedAt: now`, clears `deferredUntil`, `dismissedAt`,
  `dismissedCheckinSentAt` — `important` always wins over any prior deferred/dismissed state.
- `defer`: no-op if currently `user_deferred` **and** `deferredUntil` is still in the future
  (a genuine double-tap on the same live deferral). Otherwise sets `triageState:
  "user_deferred"`, `triagedAt: now`, `deferredUntil: now + 60 days`, **`deferralCount += 1`**
  (this covers both a first-time defer and a resurfaced re-defer — both are real transitions,
  never idempotent no-ops, because each is a fresh user choice even if the resulting state label
  is unchanged from before the last resurface), clears dismissed fields.
- `dismiss`: no-op if already `dismissed`. Otherwise sets `triageState: "dismissed"`,
  `dismissedAt: now`, `dismissedCheckinSentAt: null` (a fresh dismissal always restarts its own
  6-month clock), `triagedAt: now`, clears `deferredUntil`. **No blocking on current state** —
  dismissing an `important` or previously-`covered`/reopened gap is always allowed, per the
  issue's explicit late-triage rule.

`packages/core/src/curriculum/gap.ts` gains `isPushExcluded` (above) plus two small resurfacing
predicates used by the API repo layer's query construction and unit-tested in isolation:
`isResurfaceDue(deferredUntil, now)`, `isDismissedCheckinDue(dismissedAt,
dismissedCheckinSentAt, now)`.

## Bot surface (`apps/bot`)

- `apps/bot/src/gap-triage/gap-triage-view.ts` — pure, unit-tested (mirrors `quiz-view.ts`):
  `buildTriageKeyboard(deferralCount: number): InlineKeyboard`, `buildResurfaceCheckinKeyboard():
  InlineKeyboard`, and the confirmation-text functions for each of the six outcomes listed in the
  walkthrough above.
- `apps/bot/src/gap-triage/gap-triage-flow.ts`:
  - `sendGapTriageMessage(chatId, gap, tool)` — one `sendMessageWithKeyboard` call, used by the
    resurfacing job (and, later, by #27/#43's own trigger points — this is the reusable
    entry point the issue asks for).
  - `handleTriageCallback(chatId, messageId, gapId, action)` — calls `POST /gaps/:id/triage`,
    and only if `changed: true`, calls `editMessageText` with the confirmation text and no
    keyboard; if `changed: false`, does nothing (no second edit, no second Telegram call).
- `apps/bot/src/nav/callback.ts` — four new `CallbackKind`s: `triage_important`, `triage_defer`,
  `triage_dismiss`, plus `triage_dismiss_shortcut` for the `Actually dismiss?` button (routes to
  the same handler as `triage_dismiss` — it's a UI shortcut, not a distinct transition), and two
  more for the check-in keyboard: `checkin_confirm`, `checkin_revisit`. New 2-3 char prefixes
  following the existing convention (`ti`, `td`, `tds`, `tad`, `cc`, `cr`).
- `apps/bot/src/nav/dispatcher.ts` — `route()` gains a branch for the six new kinds, delegating
  to `handleTriageCallback`/`handleCheckinCallback`, matching the existing `onAnswer`/`onNext`
  shape exactly.
- `apps/bot/src/server.ts` — new `POST /gap-resurface` handler, authenticated identically to the
  existing `POST /push` (`Authorization: Bearer TELEGRAM_WEBHOOK_SECRET`): fetches `GET /gaps/
  due-for-resurface`, sends one message per due gap (via `sendGapTriageMessage`/its check-in
  counterpart), calls `mark-resurfaced` per successfully sent gap only.

## Infra (`infra/index.ts`)

New `gapResurfaceJob` Cloud Scheduler entry, same shape as `dailyPushJob` (`infra/index.ts:282`):
daily schedule, `httpTarget` POSTing to `https://{botDomain}/gap-resurface`, `Authorization:
Bearer` the bot's `TELEGRAM_WEBHOOK_SECRET`, `dependsOn: [botService, ...enabledApis]`.

## Files touched (new + modified)

```
apps/api/src/
├── db/schema.ts                                    # + 6 columns on gaps
├── db/migrations/00XX_<generated>.sql               # generated after WIP lands — see todo.md
├── gap/
│   ├── gap.repo.ts                                  # rowToGap/persistGaps: + 6 fields
│   ├── gap.controller.ts                            # + handleTriageGap, handleDueForResurface,
│   │                                                 #   handleMarkResurfaced
│   └── gap-triage.repo.ts                            # NEW — locked transaction wrapper
├── router.ts                                         # + 3 routes
packages/shared/src/gap.ts                            # + gapTriageStateSchema, 6 Gap fields
packages/core/src/
├── curriculum/gap.ts                                 # + isPushExcluded, isResurfaceDue,
│                                                       #   isDismissedCheckinDue
├── curriculum/daily-push.ts                          # + "important" priority tier
└── gap-triage/gap-triage.ts                           # NEW — applyTriageAction
apps/bot/src/
├── gap-triage/gap-triage-view.ts                      # NEW
├── gap-triage/gap-triage-flow.ts                      # NEW
├── nav/callback.ts                                    # + 6 CallbackKinds
├── nav/dispatcher.ts                                  # + routing branch
└── server.ts                                          # + POST /gap-resurface
infra/index.ts                                         # + gapResurfaceJob
```

## Decisions made autonomously

Per the recommended-default rule — each had a safe, reversible, pattern-following default, no
human present. Logged in full (one line each) in `ORCHESTRATOR-MEETING-NOTES.md`.

1. **Columns on `gaps`, not a new `gap_triage` table.** Matches the `wanted`/`concern` precedent,
   not the `gap_mastery` sidecar precedent — triage is a permanent 1:1 attribute, not a cycling
   counter. Reversible: a later migration could still split it out if needed.
2. **`important` is a `triageState` value, never a reuse of `wanted`.** Avoids a silent
   cross-surface write into the web UI's star toggle.
3. **`user_deferred` (not `deferred`) as the literal enum value**, anticipating #33's
   `auto_deferred` sibling without a future migration touching this column's existing rows.
4. **Push-exclusion computed read-time; state-flip + notification is the scheduled job's job.**
   Prevents a "job hasn't run yet today" staleness window from ever reaching an incorrect push
   selection.
5. **Two-call resurfacing commit (read candidates, send, then mark) instead of one eager write.**
   Prevents "marked resurfaced but never notified" on a Telegram send failure.
6. **Kept the issue's resurface/check-in message copy verbatim, no added elapsed-time string.**
   The existing copy already signals "this is a returning item, not new" — adding a dynamically
   computed "60 days ago" clause is unrequested embellishment on an already-fully-specified UX.
7. **No `/gaps` command rebuild, no session-summary trigger built here.** Both are scope owned by
   #43 and #27 respectively; #29 builds the reusable engine + keyboard module + its own
   resurfacing delivery path only. The closed-but-unbuilt state of #43 is a tracker-hygiene
   finding to raise separately, not a reason to absorb #43's scope into this story.
8. **No web-UI surfacing of triage state.** The issue is scoped to the Telegram surface; no
   acceptance line requests a web dashboard triage view. Out of scope, not silently dropped.
9. **`Actually dismiss?` and `Dismiss` route to the same handler/transition** — it is a shortcut
   button, not a fourth state, matching the issue's own framing ("simply a convenience
   shortcut... same as tapping [Dismiss]").

## Quality gates (must pass before this is considered done)

1. `npm run typecheck` — clean across all workspaces.
2. `npm test` (root, `--workspaces --if-present`) — full unit suite, including new
   `gap-triage.test.ts` (packages/core), `gap-triage-view.test.ts` (apps/bot), `daily-push.test.ts`
   additions, `gap.test.ts` additions (`isPushExcluded`/`isResurfaceDue`/
   `isDismissedCheckinDue`).
3. `npm run test:integration -w @post-anki/api` against real Postgres — **not skippable**. Per
   `.github/workflows/deploy.yml`'s own comment, this project's integration suite exists
   specifically to catch locking/transaction bugs a mocked-DB unit test cannot — exactly the
   class of bug this story's concurrent-tap requirement is about. Run with:
   `DATABASE_URL=postgres://postanki:postanki@localhost:5436/postanki_e2e npm run test:integration
   -w @post-anki/api` (matches `e2e/docker-compose.yml` and the CI `postgres:16-alpine` service
   block exactly). Must include the new `gap-triage-concurrency.integration.test.ts` (see
   `scenarios.md` SCENARIO 9), following `gap-mastery-concurrency.integration.test.ts`'s harness
   shape (dedicated throwaway DB, `Promise.all`, both calls asserted to resolve before any row is
   inspected).
4. No Playwright/e2e-tests.md — this is a Telegram-bot, non-browser surface with no visible-in-a-
   browser difference; same precedent already set by `.planning/gap-mastery-cascade-delete/
   scenarios.md`'s own "integration-only, not e2e" call for a structurally-identical reason.
5. `npx depcruise --config .dependency-cruiser.cjs --output-type err apps packages` (the
   `review-factory-gate` CI job) — no new dependency-boundary violation from the new
   `packages/core/src/gap-triage` module or the bot's new `gap-triage` folder.

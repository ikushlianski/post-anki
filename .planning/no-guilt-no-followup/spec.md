---
type: spec
branch: no-guilt-no-followup
task: "Verify silence stays silent, remove/confirm the shipped streak feature, add a non-destructive depth-calibration staleness signal, and close the continuation-language gap (GitHub #26)"
complexity: complex
state: needs-decision
updated: 2026-08-13
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
---

# Spec: No response causes no guilt or follow-up (#26)

## PM triage claim vs. what the code actually shows

The PM's assessment said the bot has "no retry/follow-up message logic" and grepping for
`retry|follow-up|queue|streak|debt|falling behind` returned zero results, calling this "mostly
verification." That grep claim is **false** — `streak` alone returns 90+ hits, including a fully
shipped, user-visible gamification feature. Re-running the same grep today:

```
grep -rniE "guilt|follow.?up|streak|debt|falling behind|you.?ve been (gone|away)|missed.{0,20}day|welcome back" apps/bot/src apps/api/src packages/core/src
```

returns nothing guilt-shaped in `apps/bot/src` (bot replies are clean), but returns an entire
`streak/` feature under `apps/api/src`, `packages/core/src`, and `apps/web/src`. This changes the
risk profile: this is not "mostly verification," it is verification (roughly a third of the
ticket) plus one shipped-feature removal decision plus two areas of genuinely new code.

## What to do

### A. Verification-only — confirm and lock in with tests, no behavior change

1. **No queue of missed pushes.** `packages/core/src/curriculum/daily-push.ts`'s `selectDailyPush`
   is a pure, stateless selection over *current* open gaps — it never reads or writes anything
   about a missed prior push. `apps/api/src/push/push.controller.ts`'s `handleDailyPush` calls it
   fresh on every invocation. `apps/bot/src/server.ts`'s `POST /push` handler clears chat context
   and sends exactly one message per invocation; the actual 8am-daily cadence is enforced by an
   external Cloud Scheduler hitting this endpoint (IaC-verified, not something a unit test can
   cover) — note this limit explicitly rather than claiming full coverage.
2. **No absence-referencing language in bot replies.** All reply constants
   (`apps/bot/src/conversation/reply.ts`: `START_REPLY`, `DECLINE_REPLY`, `ERROR_REPLY`;
   `apps/bot/src/conversation/probe-flow.ts`: `NO_PUSH_REPLY`, `NO_PENDING_REPLY`) contain no
   "you've been gone," "missed X days," or "welcome back" language today. `NO_PENDING_REPLY`
   ("No question in flight. Send /today for today's question.") is what a bare greeting on return
   actually gets today (falls through `selectReply` → `process` → `answerPending` with no pending
   question) — it satisfies "no absence reference, no auto-start," though its wording differs from
   the issue's illustrative example ("Your next push is at 9am tomorrow...").
3. **The `/gaps` Untriaged re-notification scenario in the issue does not apply yet.** There is no
   `/gaps` bot command, no "Untriaged" value in `gapStateSchema` (`open | covered | skipped` only,
   `packages/shared/src/gap.ts`), and no gap-resurfacing-to-Telegram feature anywhere in the repo.
   That acceptance line is currently vacuously true (nothing can re-notify because the
   resurfacing/Untriaged feature itself doesn't exist) — flag as unverifiable-as-written, re-check
   whenever that feature ships (looks like a distinct, not-yet-filed story).

Add tests asserting the negative, following the existing precedent at
`apps/bot/src/conversation/reply.test.ts:103` ("error reply is non-guilt-inducing and short") —
extend that file with the same assertion shape for `NO_PENDING_REPLY`/`NO_PUSH_REPLY`, and add a
`daily-push.test.ts` case proving `selectDailyPush` never grows a queue across repeated calls with
an unanswered candidate still present.

### B. Genuine fork — the shipped streak feature (see `decision-comment.md`)

`packages/core/src/streak/streak.ts` (`updateStreak`), `apps/api/src/streak/{repo,service,
controller}.ts`, the `user_streaks` table (`schema.ts:581`, migration `0012_wooden_silver_
samurai.sql`), `GET /streak` (`router.ts:59,204`; `server.ts:85,344-345`), and
`apps/web/src/curriculum/streak-banner.tsx` (🔥 emoji counter + a shame state — "No streak yet —
answer a question today to start one" — wired into `apps/web/src/routes/dashboard.tsx:24,45`) form
a complete, deliberately shipped gamification feature (`.planning/study-stats-dashboard/spec.md`,
complexity: complex, state: confirmed, SCENARIOs 5-7). This directly contradicts #26's acceptance
line "No streak tracking exists anywhere in the system (not in DB, not in UI)."

No `.planning/*/e2e-tests.md`, `state-fixtures.md`, or `playwright.md` reference
`streak-banner`/`streak-current`/`streak-longest` — no Playwright corpus would break on removal.

This is not defaulted silently: removing a shipped, user-visible dashboard feature is hard to
reverse and is a product call #26 (a Telegram-bot story) never explicitly resolves for the web
dashboard. See `decision-comment.md` for the two options and recommendation.

### C. New code — depth-calibration staleness (item 3)

**#42 ("Questions probe deeper as user demonstrates understanding") is CLOSED, but its actual
concept-group pass-streak / tier-escalation engine was never built.** What exists instead:

- `gaps.depth` (`awareness | working | deep`) — a static classification the AI assigns when the
  gap is discovered, used directly as the question-generation target
  (`apps/api/src/probe/probe.service.ts:224`, `generateQuestion`'s `Target depth:` line). It is
  not a decaying "calibration" value — no code path ever raises or lowers it based on pass/fail
  history.
- `gap_mastery` (issue #57, `packages/core/src/mastery/mastery-state.ts`) — a sequence-based
  (not date-based) recall-recycling cycle, written only by the probe-session *quiz* answer path
  (`probe-session.service.ts`), not by the Telegram Socratic push path #26 is about.

Neither is "per-concept depth calibration that decays with wall-clock silence." **There is no
existing state to reset.** Treat item 3 honestly as "build the minimum viable piece of #42's
never-built calibration reset," not "add a timer to existing state."

**Recommended minimal, non-destructive shape** (mirrors the existing `isStale` pattern at
`packages/core/src/curriculum/daily-push.ts:26-33`, which already does date-vs-60/90-day math for
a different purpose):

- New pure function `isCalibrationStale(lastEvaluatedAt: string | null, now: string): boolean`
  in `packages/core/src/curriculum/gap.ts` (co-located with the other gap derivers), 60-day
  threshold, same `daysBetween`-style math as `isStale`.
- Consumed at **read time only**, inside `apps/api/src/probe/probe.service.ts`'s
  `generateQuestion`: when `gap` is non-null and `isCalibrationStale(gap.lastEvaluatedAt, now)` is
  true, floor the prompt's `Target depth:` line to `"awareness"` instead of `gap.depth` for that
  one generated question. **`gap.depth` itself is never written** — `persistGaps` keeps writing
  the gap's real classification unchanged, so nothing about the taxonomy is corrupted and nothing
  is lost if the reasoning here turns out wrong later.
- This is silent by construction (per #26/#42's explicit constraint) — no message, no gap-state
  change, just a softer question next time that gap comes up. Satisfies "the user simply receives
  an easier question on that concept; this feels natural, not punishing" without inventing new
  persisted state or a migration.
- Explicitly NOT in scope for this ticket: the full #42 concept-group pass-streak/tier-escalation
  engine (3-consecutive-passes-per-concept-group, intra-session AI escalation, the "all concepts
  mastered" one-time message). Building that is a separate, larger effort — recommend re-opening
  #42 or filing a fresh story rather than smuggling it into a "no guilt" ticket.

### D. New code — continuation-language routing (also item 2's acceptance block)

`apps/bot/src/conversation/reply.ts`'s `selectReply` only recognizes `/start`, `/today`, `/push`,
`/study <name>`; everything else — including "let's continue," "where were we," and "let's talk
about Lambda" — becomes `{ kind: "process", text }` and falls into `answerPending`, which has no
concept of continuation language or tool names. There is also no `/menu` command anywhere in the
bot (only `/start`, which shows the subjects screen via `nav/menu.ts`'s `showSubjects`) — the
issue's own example reply text ("...or type /menu to start a session now") references a command
that doesn't exist; the nearest real equivalent is `/start`.

This is a real, currently-unsatisfied acceptance line, not a wording nitpick. Minimal buildable
shape, consistent with this codebase's existing deterministic (non-LLM) command dispatch:

- Extend `ReplyDecision` in `reply.ts` with two new kinds: `{ kind: "continue"; tool: string |
  null }` for continuation phrases, matched via a small fixed phrase list (`"let's continue"`,
  `"where were we"`, `"continue"` as a standalone message) combined with an optional trailing/
  leading tool name; and treat `"let's talk about X"` / `"let's discuss X"` as an immediate
  `{ kind: "study"; name: X }` (i.e. route it through the exact same path `/study` already uses —
  Decision 54 in the issue is just naming this existing `/study` flow's free-text trigger).
- `webhook.handler.ts`: `continue` with a `tool` routes to `startStudy`/`startSocratic` exactly
  like `/study <name>` (same fresh-session-no-context-carryover behavior, already correct there);
  `continue` with no `tool` routes to `showSubjects` (`/start`'s existing screen) — this is the
  `/menu`-equivalent, so no new screen needs to be built.
- No new "I lost our session" messaging is added anywhere — the fresh-session behavior is the
  entire point; verify with a test that no reply text produced by this path ever mentions prior
  context.
- Recommend keyword/phrase matching, not an LLM intent classifier — matches the deterministic
  dispatch pattern used everywhere else in `apps/bot/src`, avoids adding cost/latency/failure-mode
  risk to every incoming message just to route it.

## Decisions made autonomously

1. **60-day staleness check floors the prompt at read time, never writes `gap.depth`.** A
   destructive alternative (overwrite `gaps.depth` to `"awareness"` in `persistGaps`) was
   considered and rejected: `inScopeGaps` filters candidate gaps by
   `DEPTH_RANK[g.depth] <= ceiling`, so mutating `depth` changes which gaps are in/out of scope —
   corrupting the AI's taxonomy classification, not "resetting calibration," and there is nothing
   in the schema that would let a later correct answer restore the original depth. The read-time
   floor is fully reversible (next real answer just doesn't hit the stale branch) and requires no
   migration.
2. **Continuation-language routing reuses the existing `/study` free-text path rather than adding
   an LLM classifier.** Matches this codebase's existing pattern (deterministic string/command
   dispatch everywhere in `apps/bot/src`; LLM calls are reserved for question generation/
   evaluation, never for routing). Reversible, cheap, no new failure mode.
3. **The streak feature is NOT defaulted to removal** — see `decision-comment.md`. This is the one
   genuine fork in this plan.
4. **"Decision 54" (named in the GitHub issue body) could not be located.** Fact: searched
   `.planning/**`, `docs/**`, `.product/DECISIONS.md`, and GitHub issue #54 (closed, unrelated —
   "Probe quiz grounded explanations") — no numbered decision log matching "Decision 54" exists in
   this repo. Assumption: it refers to an external/未committed decision log. Treated the issue's
   own description of that decision ("conversational commands like 'let's talk about Lambda' DO
   start a session immediately") as the source of truth rather than continuing to search for the
   citation.

## Files to touch

```
Verification only (tests, no behavior change):
apps/bot/src/conversation/
├── reply.test.ts                    # extend: NO_PENDING_REPLY / NO_PUSH_REPLY non-guilt assertions
└── probe-flow.ts                    # read only — no change

packages/core/src/curriculum/
└── daily-push.test.ts               # + case: repeated selectDailyPush calls never accumulate a queue

Fork — pending decision (see decision-comment.md), NOT built until resolved:
packages/core/src/streak/            # streak.ts, streak.test.ts, index.ts — delete if approved
apps/api/src/streak/                 # repo/service/controller — delete if approved
apps/api/src/db/schema.ts            # userStreaks table — delete if approved
apps/api/src/db/migrations/          # generated DROP migration via drizzle-kit — never hand-written
apps/api/src/router.ts               # getStreak route — delete if approved
apps/api/src/server.ts               # getStreak dispatch — delete if approved
apps/api/src/probe-session/probe-session.service.ts   # remove recordActivityToday call
apps/api/src/socratic/socratic.service.ts              # remove recordActivityToday call
packages/shared/src/                 # Streak type — delete if approved
apps/web/src/curriculum/streak-banner.tsx              # delete if approved
apps/web/src/curriculum/api-client.ts:1192              # getStreak call — delete if approved
apps/web/src/routes/dashboard.tsx                        # edit loader (drop streak from Promise.all)

New code — depth-calibration staleness:
packages/core/src/curriculum/
├── gap.ts                           # + isCalibrationStale(lastEvaluatedAt, now)
└── gap.test.ts                      # NEW cases mirroring daily-push.test.ts's isStale coverage
apps/api/src/probe/
└── probe.service.ts                 # generateQuestion: floor Target depth when stale (read-time only)

New code — continuation-language routing:
apps/bot/src/conversation/
├── reply.ts                         # + "continue" ReplyDecision kind, phrase matching, tool-name extraction
└── reply.test.ts                    # + continuation-phrase cases, no-context-reference assertions
apps/bot/src/telegram/
└── webhook.handler.ts               # route "continue" kind to startStudy/startSocratic or showSubjects
```

## Derivers

| Deriver | Inputs | Output | Notes |
|---|---|---|---|
| `isCalibrationStale` (new, `packages/core/src/curriculum/gap.ts`) | `lastEvaluatedAt: string \| null`, `now: string` | `boolean` | 60-day threshold, same date-diff shape as `isStale` in `daily-push.ts` |
| `selectReply` continuation branch (extend, `reply.ts`) | `message.text` | `ReplyDecision` incl. new `continue`/tool-name extraction | Pure string matching, no LLM |

## Done when

- `reply.test.ts` and `daily-push.test.ts` assert the verification-only claims above and pass.
- Streak removal (or explicit "keep, criterion amended") is resolved via `decision-comment.md`
  before any deletion work starts — do not delete `user_streaks` or `streak-banner.tsx` on an
  assumed default.
- `isCalibrationStale` exists, is unit-tested (fresh/exactly-60-day/61-day-plus cases), and
  `probe.service.ts` demonstrably asks an `awareness`-level question for a gap whose
  `lastEvaluatedAt` is 60+ days old, without writing anything to `gaps.depth` — proven by a test
  reading the generated prompt/question, not by inspecting a DB row.
- A message containing "let's continue" or "where were we" with no tool named shows the subjects
  screen (the `/menu` equivalent); with a tool named, starts a fresh session on that tool exactly
  as `/study <name>` does today — proven by extending `reply.test.ts` / a webhook-handler test,
  and no reply text anywhere in this path mentions prior/missing session context.
- `npx tsc --noEmit` and the project lint pass with zero new issues.

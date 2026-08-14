---
type: scenarios
branch: 27-session-end-summary
task: "[Story] Session ends with a gap and progress summary (#27)"
state: planned
updated: 2026-08-14
---

# Scenarios: Session ends with a gap and progress summary (#27)

**31 acceptance criteria.** Two hard-end triggers, one soft checkpoint, one migration, one new
scheduled job, one new command, and a summary builder whose gap-shaped fields are real but
structurally empty today (spec.md Decision 1) — sized between #96's 20 (a pure-function clamp) and
#33's 42 (two new columns + a migration + a scheduled job), since this story has the scheduled job
and the migration but only one new column, not two.

No Playwright plan — every surface here is the Telegram bot (message text, inline keyboards,
scheduled HTTP endpoints); this project's verification-repo integration targets `apps/web`, and
nothing in this story touches `apps/web`.

## Master acceptance criteria list (31 items, each independently walkable)

**`/done` — explicit hard end (`reply.ts`, `webhook.handler.ts`)**

1. `selectReply` recognizes `/done` as `{ kind: "done" }`, same shape as the existing `/start`/
   `/today`/`/study` cases.
2. `handleMessage` dispatches `/done` to a new conditional `onDone` dep only when
   `context?.mode === "socratic"` — mirrors `onSocraticText`'s existing conditional-dispatch pattern
   exactly (`webhook.handler.ts:143-146`).
3. `/done` sent while `chat_context.mode` is `"idle"` or `"quiz"` falls through to existing behavior
   unchanged (`DECLINE_REPLY` for idle-with-no-pending, or the quiz text handler) — `/done` has no
   special meaning outside an active Socratic session.
4. `/done` inside an active Socratic session ends it immediately: `completeSocraticSession` performs
   the `active → completed` transition, the summary is sent, and chat context clears
   (`mode: "idle"`, `sessionId: null`, `currentItemId: null`) — same shape as the existing
   natural-completion clear in `answerSocratic` (`socratic-flow.ts:66-71`).

**Soft checkpoint at 5+ exchanges — does not end the session**

5. `answeredCount = listTurnRows(session.id).filter(t => t.answeredAt).length`, computed AFTER the
   current turn's `recordTurnAnswer` call, so the just-answered turn counts.
6. `checkpointReached` is `true` exactly when `answeredCount >= 5 AND session.checkpointShownAt ===
   null` — a session with `checkpointShownAt` already set never re-triggers, regardless of
   `answeredCount`.
7. When `checkpointReached`, `checkpoint_shown_at` is stamped via a conditional
   `WHERE checkpoint_shown_at IS NULL` update — a concurrent double-fire (should never happen given
   single-owner synchronous request handling, but proven anyway) stamps at most once.
8. `answerSocraticSession`'s existing `next`-generation and `status` logic is completely unchanged —
   `next` is still generated eagerly on a covered turn exactly as today; `checkpointReached` is an
   additive boolean field on the response, not a branch that skips generation.
9. `status` stays `"active"` when `checkpointReached` is true — the session is never marked completed
   by the checkpoint path. Proven by: after a checkpoint-triggering exchange, a fresh `GET`-equivalent
   (`getActiveSocraticSessionRow`) for the same topic still returns this session.
10. The bot (`answerSocratic`) renders the checkpoint summary + `buildCheckpointKeyboard(false)`
    (single "Continue now" button) instead of `formatSocraticAnswer`'s normal next-question text,
    when `result.checkpointReached` is true.
11. Chat context after a checkpoint-triggering answer is identical in shape to a normal answer:
    `currentItemId: result.next.id`, `mode: "socratic"`, `sessionId` unchanged — only the rendered
    message/keyboard differs.
12. Tapping "Continue now" (`buildCallback("continue")`) re-enters via the **existing**, unmodified
    `onContinue` → `startSocratic` → `startSocraticSession({ topicId })` path, which returns the
    already-generated pending turn's prompt via the `pendingTurn` branch
    (`socratic.service.ts:70-77`) and edits the checkpoint message itself in place (`onContinue`'s
    `editMessageText` targets the callback query's own `message.message_id`, not any id read from
    `chat_context`) — proven by zero new callback kinds and zero new endpoints added for this
    interaction.
13. Answering exchange 6, 7, 8… after "Continue now" was tapped never re-shows the checkpoint —
    `checkpoint_shown_at` stays non-null for the rest of this session's lifetime, proven directly
    from AC 6.
14. `buildCheckpointKeyboard(isIntensityMode)` with `isIntensityMode: true` renders a second
    "⏭ Save for next session" button; with the default `false` (the only value this story ever
    passes), exactly one button renders. `"done"` is not a real `CallbackKind` in this story (no
    such member/prefix exists in `nav/callback.ts`) — the `true` branch is illustrative shape for
    #25 to fill in with its own callback kind and handler, not code this story wires live. This
    function is not called with `true` anywhere in this story's own code, proven by a direct unit
    test of both branches with no caller wiring the `true` case.

**Inactivity sweep — 30-minute hard end**

15. `lastActivityAt(pending, turns)` returns `pending.createdAt` when a pending (unanswered) turn
    exists.
16. `lastActivityAt` falls back to the most recently answered turn's `answeredAt` when `pending` is
    `null` (the gap-mastery-cascade-delete edge case, spec.md Decision 5) — proven with a turns array
    containing no unanswered row.
17. `chat_context.updated_at` is never read by any part of this mechanism — proven by the idle-check
    implementation taking `pending`/`turns` (Socratic-sourced), not `ChatContext`, as its only inputs.
18. `POST /socratic-sessions/:id/check-idle` returns `{ idle: false }` and performs no write when
    `now - lastActivityAt < 30 minutes`.
19. `POST /socratic-sessions/:id/check-idle` returns `{ idle: true, summary }` and completes the
    session when `now - lastActivityAt >= 30 minutes` and the session is still `"active"`.
20. `POST /session-idle-sweep` (bot) rejects with 401 when the `Authorization` header doesn't match
    `TELEGRAM_WEBHOOK_SECRET` — identical check to `/push` and `/gap-resurface`
    (`server.ts:41-46,63-68`).
21. `POST /session-idle-sweep` responds 200 immediately (before any DB/API work), matching the
    fire-and-forget shape of `/push`/`/gap-resurface`.
22. When `chat_context.mode !== "socratic"` or `sessionId` is `null` for the owner chat, the sweep
    does nothing — no API call is made.
23. When the sweep's idle check returns `{ idle: true, summary }`, the bot sends the formatted summary
    via `sendMessage` and then clears chat context — in that order, so a `sendMessage` failure leaves
    context intact for the next sweep to retry rather than silently losing the summary.

**Race guard shared by `/done` and the sweep**

24. `completeSocraticSession` only updates rows where `status = 'active'`, returning the updated row
    or `null`.
25. Two concurrent callers racing to end the same session (simulated: two parallel calls) result in
    exactly one non-null return and exactly one summary message sent — the integration test's real
    proof, mirroring the concurrency-proof shape of
    `gap-mastery-concurrency.integration.test.ts`/`probe-session-replenish.integration.test.ts`.
26. The pre-existing natural-completion caller (`openNextConcept` returning `null` → "all gaps
    covered") is unaffected by the new `WHERE status='active'` clause — it only ever calls this on a
    session it already knows is active, proven by that existing test suite passing unmodified.

**Summary content**

27. `buildSessionSummary`'s `solidConcepts` is the deduplicated, turn-order list of `conceptLabel`
    for every answered turn with `action === "advance"` in this session — built entirely from
    `socraticTurns`, no new schema.
28. `mostRecentGap`, `gapsLoggedCount` (0), and `crossCuttingConcerns` ([]) are present as real typed
    fields on `SocraticSessionSummary` but structurally constant at their empty value in this story —
    proven by a test asserting the exact empty values for a session containing turns with mixed
    `action` values (including non-`"advance"` ones), demonstrating the empty result is NOT derived
    from "not-advanced" turns (spec.md Decision 1's explicitly-rejected workaround).
29. The rendered summary shows "Solid session — no new gaps logged." (verbatim, per #27's own spec'd
    copy) whenever `gapsLoggedCount === 0` — which, per AC 28, is every session in this story's
    shipped state.
30. `exchangeCount === 0` (a session created but never answered — `/done` or the sweep firing before
    any turn is answered) produces no summary message, but the session is still marked completed —
    proven by asserting `sendMessage` is not called while `completeSocraticSession` still returns the
    updated row.
31. The depth shown in the summary is the real `DepthLevel` value (`"awareness" | "working" |
    "deep"`) from `rowDepth(topicRow)`, never the issue text's illustrative `"architect"` label —
    proven by a snapshot-style assertion against the actual enum values.

---

## SCENARIO 1 — A discussion crosses 5 exchanges and the user keeps going

**Given** an active Socratic session on "TanStack Start" with 4 already-answered turns
**When** the user answers the 5th question
**Then** the bot shows a checkpoint summary ("Solid understanding: …") with one "📚 Continue now"
button, instead of immediately showing the 6th question
**And** tapping "Continue now" reveals the 6th question exactly as if the checkpoint had never fired
**And** answering through exchanges 6-10 produces no further checkpoint.

Covers AC 5, 6, 7, 8, 9, 10, 11, 12, 13.
Proof: `socratic.service.test.ts` (checkpoint trigger + one-time guard, pure count logic),
`socratic-flow.test.ts` (bot-side branch + chat-context shape), `dispatcher.test.ts` (existing
`onContinue` coverage, unmodified, proving no new plumbing was needed).

## SCENARIO 2 — The user explicitly ends a discussion with `/done`

**Given** an active Socratic session with 3 answered turns (below the checkpoint threshold)
**When** the user sends `/done`
**Then** the session is marked completed, a summary is sent showing solid understanding from those 3
turns and "Solid session — no new gaps logged.", and chat context clears to idle.

Covers AC 1, 2, 3, 4, 27, 29.
Proof: `reply.test.ts` (new case), `webhook.handler.test.ts` (new conditional-dispatch case),
`socratic.service.test.ts`/integration test for the completion + summary build.

## SCENARIO 3 — A discussion goes quiet and the sweep closes it 30 minutes later

**Given** an active Socratic session whose pending turn was sent 31 minutes ago, and the owner's
`chat_context` still shows `mode: "socratic"` with that session's id
**When** the 5-minute Cloud Scheduler sweep next fires
**Then** the bot's `/session-idle-sweep` endpoint checks the one owner chat, finds the session idle,
completes it, sends the summary unprompted (no user message triggered this), and clears chat context
**And** the next sweep invocation (5 minutes later) does nothing further — the session is already
completed and `chat_context.mode` is already `"idle"`.

Covers AC 15, 18, 19, 20, 21, 22, 23, 24.
Proof: `session-summary.test.ts` (`lastActivityAt`), `check-idle.integration.test.ts` (real Postgres,
real elapsed-time simulation via a seeded `createdAt` 31 minutes in the past), `server.test.ts` (bot
endpoint auth + fire-and-forget shape, mirroring `/gap-resurface`'s own existing test shape).

## SCENARIO 4 — `/done` and the sweep race on the same idle session

**Given** an active Socratic session, idle for 31 minutes
**When** `/done` arrives from the user at almost the same instant the sweep's idle check runs against
the same session
**Then** exactly one of the two callers wins the `active → completed` transition and sends the
summary; the other sees `completeSocraticSession` return `null` and sends nothing.

Covers AC 24, 25, 26.
Proof: `session-completion-race.integration.test.ts` (real Postgres, two concurrent calls, asserting
exactly one summary-worthy result and no duplicate message), mirroring
`probe-session-replenish.integration.test.ts`'s "paired scenario, one file, positive control" shape
from `.planning/96-adaptive-quiz-size/`.

## SCENARIO 5 — A session ends with zero answered exchanges

**Given** a Socratic session that was just created (one pending turn, never answered) sitting idle
for 31 minutes — or the user sending `/done` before answering anything
**When** the sweep (or `/done`) fires
**Then** the session is marked completed (it doesn't stay active forever) but no summary message is
sent — matching #27's own "minimum: a session needs at least 1 exchange" rule and #26's silence
carve-out.

Covers AC 30.
Proof: `session-summary.test.ts`/`socratic.service.test.ts`, a case with `exchangeCount === 0`
asserting `sendMessage`/the formatter is never invoked while completion still occurs.

## SCENARIO 6 — The gap line stays honest, not silently faked

**Given** a session where several turns did NOT advance (the learner struggled on some concepts,
`action` values of `point_out`/`explain_hint`/`give_answer`/`move_on`) but zero gaps were ever
discovered via `insertDiscoveredGaps` during the session (true for every session in this story's
shipped state, per spec.md Decision 1)
**When** the summary is built
**Then** `mostRecentGap` is `null` and `gapsLoggedCount` is `0` — NOT derived from the count or
recency of non-`"advance"` turns, even though such turns exist in this exact scenario
**And** the rendered message shows "Solid session — no new gaps logged.", which is the accurate,
spec'd copy for this state, not a workaround pretending gaps were found.

Covers AC 28.
Proof: `session-summary.test.ts`, a case seeded with mixed-`action` turns and zero discovered gaps,
asserting the empty gap fields specifically to guard against a future edit silently reintroducing
the rejected "not-advanced turn = gap" workaround (spec.md Decision 1).

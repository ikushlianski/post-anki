---
type: todo
branch: main
task: Telegram bot — subject → curriculum → (Socratic | quiz) selection and continuation
state: open
updated: 2026-07-11
---

# Todo: Telegram quiz + Socratic subject/curriculum selection

## Decisions to make

Nothing to decide — no code changes are proposed by this plan. The one interpretive call
made autonomously is logged below for review.

## To review / clarify

1. **Mode selection: auto vs explicit chooser.** The task text ("starts or continues either
   a Socratic learning conversation or a quiz") is readable two ways: (a) the user
   explicitly picks the mode, or (b) the system picks automatically. Shipped code (and the
   already-confirmed `.planning/telegram-frontend/scenarios.md` SCENARIO 3) does (b):
   `topic.progress.status === "not_started"` → quiz, otherwise Socratic
   (`apps/bot/src/nav/dispatcher.ts:163-168`). Chosen interpretation: **(b), no new UI**,
   because (i) grammatically "selects" governs subject and curriculum, not the mode, (ii)
   it matches the already-confirmed source plan, (iii) shipped code already implements it,
   (iv) adding a chooser would be net-new scope this task explicitly warned against
   manufacturing. **If the intent was actually (a) — an explicit "Quiz or Socratic?" button
   pair after topic selection — that is the one real code gap this plan did not build; flag
   it and it becomes a small follow-up (one new callback + dispatcher branch, no data model
   change).**

2. **"Quiz on that curriculum" scope.** Read as quiz within the curriculum's existing
   topic/module scope (as shipped), not a new curriculum-wide quiz scope — no such
   curriculum-level scope exists in `probe_sessions` today and none was requested elsewhere
   in the task. Conservative/reversible reading; flag if a curriculum-wide "test everything"
   mode was actually wanted.

3. **`onQuizText` extension point.** `apps/bot/src/telegram/webhook.handler.ts` declares
   `HandlerDeps.onQuizText` but `apps/bot/src/server.ts` never supplies it, so free text sent
   during an active quiz always falls through to "Tap one of the answer buttons above." This
   matches the design (quiz answers are buttons only) — not a functional gap. Left as-is;
   noted here only so a reviewer doesn't mistake it for dead code needing a fix.

4. **Self-grill objection not fully closed: is an "active" probe/Socratic session ever
   orphaned (stuck `status: active` forever, e.g. if a user abandons a session mid-quiz),
   causing indefinite reuse of a stale session instead of ever regenerating?** Observed
   evidence points the right way — `quiz-flow.ts` sets `chat_context.mode` to `"idle"` on
   completion, and `getActiveSessionRow` filters on `status: "active"` — but the full
   completion state machine in `apps/api/src/probe-session/probe-session.service.ts` was
   not exhaustively traced for every abandonment path. Assumption, not fact: abandoned
   sessions stay resumable indefinitely rather than expiring, which is arguably correct
   behavior anyway (resume, don't lose progress) but was not independently confirmed as
   intentional vs. an edge case. Not a blocker — flagged for the user's own sanity check,
   not a code change.

## Manual steps

- **Activate the production webhook** (SCENARIO 10). Run, once, against the deployed prod
  bot service:
  `TELEGRAM_BOT_TOKEN=<prod token> npm run set-webhook -w @post-anki/bot https://bot.postanki.ilya.online/telegram`
  (script: `apps/bot/scripts/set-webhook.ts`). Per the user's own recorded project memory,
  the bot is deployed but this one-time activation is still pending — `PROD_TELEGRAM_WEBHOOK_SECRET`
  must already be set as the Cloud Run bot service's env var (per `.inbox/TODOS.md` §1/§7).
- No database migration, IaC change, or new secret is required — all backing tables
  (`probe_sessions`, `probe_session_questions`, `socratic_sessions`, `chat_context`,
  `pending_probe`) and env vars already exist per commit `6ccfb76`.

## Post-deploy checks

- Send `/start` to the production bot chat; confirm the subjects screen renders.
- Start a never-probed topic → confirm a quiz batch generates once and a "Continue" resume
  works without re-generating (watch for a second LLM call in logs on the second entry —
  there should be none).
- Start an established topic → confirm a Socratic turn renders and a second "Continue" tap
  resumes the same open turn rather than restarting the conversation.
- Update `.product/DECISIONS.md` with an entry documenting the quiz/Socratic bot's shipped
  design and this activation — the current DECISIONS.md has no entry for commit `6ccfb76`
  at all, which is a documentation gap worth closing but is not a functional blocker.

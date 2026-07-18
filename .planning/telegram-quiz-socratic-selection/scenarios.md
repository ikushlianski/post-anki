---
type: scenarios
branch: main
task: Telegram bot — subject → curriculum → (Socratic | quiz) selection and continuation
state: confirmed
updated: 2026-07-11
---

# Scenarios: Telegram quiz + Socratic subject/curriculum selection

This plan audits commit `6ccfb76` ("Add Telegram quiz and Socratic learning bot") against
the requested UX (subject → curriculum → start/continue Socratic or quiz) and the
already-confirmed source plan `.planning/telegram-frontend/scenarios.md`. Scenarios 1–9
below were planned there and are now verified **implemented and wired** in the current
codebase — restated here with file citations, not as new work. Scenario 10 is the one
piece of real residual scope: production activation.

## Business Scenarios (verified implemented — no new work)

### SCENARIO 1: Enter the app and pick a subject — IMPLEMENTED
`/start` renders subject buttons from `GET /subjects`.
- `apps/bot/src/conversation/reply.ts` classifies `/start` → `webhook.handler.ts` `onStart` → `showSubjects` (`apps/bot/src/nav/menu.ts:29`), which calls `getSubjects()`.
- Only the owner chat id is served (`apps/bot/src/auth/owner.ts`, checked in `webhook.handler.ts`).

Verify: `/start` from the owner chat id returns a subject-button screen; any other chat id gets no reply.

### SCENARIO 2: Pick a curriculum and see topics with progress — IMPLEMENTED
Tapping a subject shows its curricula; tapping a curriculum shows modules/topics with progress %.
- `apps/bot/src/nav/dispatcher.ts` routes `sub:<id>` → `showCurricula` (`getCurricula()`), `cur:<id>` → `setNavCurriculum` + `showCurriculum` (`getCurriculumDetail()`).
- A "▶️ Continue: {label}" button renders whenever `chat_context.mode !== "idle"` (`apps/bot/src/nav/menu.ts:37-41`).

Verify: tapping a subject button edits the message into a curricula list; tapping a curriculum edits it into a module/topic list with percentages.

### SCENARIO 3: Start a NEW topic → quiz — IMPLEMENTED, auto-selected server-side
- `apps/bot/src/nav/dispatcher.ts:163-168`: `if (topic.progress.status === "not_started") startQuiz(...) else startSocratic(...)`.
- Mode is **not** a user-facing choice — it is decided by topic progress status, matching `.planning/telegram-frontend/scenarios.md` SCENARIO 3 exactly (`"New" is decided server-side`). See todo.md for the reading of the task text this resolves.

Verify: tapping "Start" on a topic with `progress.status === "not_started"` renders quiz question 1, never a mode-choice prompt.

### SCENARIO 4: Answer a quiz question — IMPLEMENTED
- Inline number buttons (`qa:<idx>`) → `submitQuizAnswer` (`apps/bot/src/quiz/quiz-flow.ts`) → `answerProbeSession`; `qnext` → `nextQuizQuestion`.
- Scoring is deterministic server-side against a persisted `correctAnswerIndex` — no LLM call at answer time (`apps/api/src/probe-session/probe-session.service.ts`).

Verify: tapping an answer button reveals correct/incorrect immediately (no generation delay) and advances via "Next →".

### SCENARIO 5: Start an ESTABLISHED topic → Socratic conversation — IMPLEMENTED
- Free-text replies during `chat_context.mode === "socratic"` route to `answerSocratic` (`apps/bot/src/socratic/socratic-flow.ts`) → `answerSocraticSession`.
- Server-side evaluation only (`apps/api/src/socratic/socratic.service.ts`, `evaluateSocratic` at line 320) — invoked per learner answer, not per session start.

Verify: tapping "Start" on a topic with prior progress renders a Socratic question, and a free-text reply gets a judged response (not the quiz button UI).

### SCENARIO 6: Resume where left off (cross-device) — IMPLEMENTED
- Quiz: `startQuiz` calls `getActiveProbeSession` before rendering (`apps/bot/src/quiz/quiz-flow.ts:105,129,161`).
- Socratic: `startSocraticSession` itself resumes server-side — `apps/api/src/socratic/socratic.service.ts:64-83` checks `getActiveSocraticSessionRow(topicId)` and returns the pending turn instead of creating a new session, unless `regenerate` is explicitly requested. No duplicate-session or lost-history risk on repeat "Continue" taps.

Verify: tapping "▶️ Continue" twice in a row for the same in-progress quiz or Socratic session renders the same unanswered question/turn both times, not a fresh one.

### SCENARIO 7: See progress in percent — IMPLEMENTED
Curriculum/module/topic percentages render at every navigation level (`apps/bot/src/nav/menu.ts`, `apps/bot/src/nav/progress-label.ts`, unit-tested in `progress-label.test.ts`).

Verify: percentages shown at curriculum/module/topic level update after completing a quiz or covering a Socratic concept.

### SCENARIO 8: Regenerate a quiz — IMPLEMENTED
`rt`/`rm` callbacks → `startQuiz(..., regenerate=true)` → `prepareProbeSession({ regenerate: true })`, which deletes prior sessions for that scope and re-invokes the LLM only in this explicit path (`apps/api/src/probe-session/probe-session.service.ts`).

Verify: tapping "🔄 Regenerate" produces a new question set (may show the waiting indicator); tapping "Continue" instead never triggers this LLM path.

### SCENARIO 9: Module-level probing (quiz only, by design) — IMPLEMENTED
Module-scope "Start module (quiz)" always starts a quiz (`apps/bot/src/nav/dispatcher.ts` `startModule`); Socratic is topic-scoped only, matching the source plan (concept checklists are per-topic).

Verify: "Start module (quiz)" always opens a quiz batch spanning the module's topics; there is no module-level Socratic entry point.

## Remaining scope (real gap)

### SCENARIO 10: Production bot is live and reachable
The Telegram webhook must be registered against the deployed bot service before any user
can trigger scenarios 1–9 in production.

What to verify:
- `apps/bot/scripts/set-webhook.ts` has been run once against the prod bot token, pointing
  Telegram at `https://bot.postanki.ilya.online/telegram` (per `.inbox/TODOS.md` §7 and the
  user's own recorded memory note: bot deployed, webhook activation still pending).
- `/start` receives a live reply from the production bot once activated.
- This is an operational step, not a code change — see `todo.md` "Manual steps".

## Technical/Architectural Scenarios

None — no architectural shift. This plan touches no new service boundary, async boundary,
or data model; it audits existing wiring and flags one deployment activation step.

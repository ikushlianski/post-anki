---
type: scenarios
branch: main
task: Telegram test-mode frontend (chat bot + inline buttons)
state: confirmed
updated: 2026-06-30
---

# Scenarios: Telegram test-mode frontend

## Business Scenarios

### SCENARIO 1: Enter the app and pick a subject
Owner sends `/start`; bot replies with a message + inline buttons, one per subject.

What to verify:
- Only the owner chat id is served; any other chat is ignored.
- Buttons are built from `GET /subjects`; empty state shows a helpful message.
- Tapping a subject button navigates to its curricula list (callback query, message edited in place).

### SCENARIO 2: Pick a curriculum and see topics with progress
From a subject, owner taps a curriculum; bot shows the curriculum's modules→topics as buttons, each annotated with progress %.

What to verify:
- Curricula come from `GET /curricula?subjectId=`; only `confirmed` curricula are startable (others show a "still being prepared" note).
- Curriculum header shows curriculum-level %; each module button shows module %; each topic button shows topic maturity %.
- A "⟳ Continue where I left off" entry appears when an active session exists.

### SCENARIO 3: Start a NEW topic → quiz probing session
Owner taps a topic that has never been probed; because it is new, the bot starts a quiz probing session.

What to verify:
- "New" is decided server-side: topic `progress.status === not_started` (attempts 0, maturity 0) → quiz; otherwise Socratic.
- If no persisted quiz exists, the bot shows a "⏳ Generating your quiz (questions + answers)…" placeholder + typing action, then edits it into Q1 once the batch is generated and persisted.
- The batch is 10–20 questions spanning difficulty (true/false → harder MCQ); persisted in DB with correct answers; reused on next entry until regenerated.

### SCENARIO 4: Answer a quiz question (test mode)
Bot shows one question with each option as an inline button; owner taps an option.

What to verify:
- Scoring is deterministic server-side against the stored `correctAnswerIndex` (no LLM at answer time) → fast.
- Bot reveals correct/incorrect, shows the correct answer, and a short clarification.
- The answer is persisted server-side immediately (answeredIndex + outcome), so the same session resumes identically on another device.
- A "Next →" button advances; the session tracks answered/correct/total and completes after the last question.

### SCENARIO 5: Start an ESTABLISHED topic → Socratic teaching conversation
Owner taps a topic already probed at least once; the bot runs a Socratic conversation that teaches against the topic's concept checklist (its gaps).

What to verify:
- Each turn targets a specific concept (gap) the owner must understand; the bot asks rather than lectures.
- Owner replies with free text; the bot judges the answer degree (correct / slightly wrong / mostly wrong).
- Escalating help: slightly wrong → point out the flaw; mostly wrong → explain or hint a better answer; wrong 2nd–3rd time on the same concept → just give the correct answer and move on.
- Every turn (question, owner answer, verdict, help level) is persisted server-side → resumable cross-device.
- Covering a concept advances topic maturity %; conversation ends when all in-scope concepts are covered.

### SCENARIO 6: Resume where left off (cross-device)
Owner opens the bot on a second device mid-session; the bot offers to resume the exact open question/turn.

What to verify:
- Active session (quiz or Socratic) is found server-side by scope, independent of which Telegram client is used.
- Resume re-renders the first unanswered quiz question, or the last unanswered Socratic turn, with prior progress intact.
- Already-submitted answers are not re-asked.

### SCENARIO 7: See progress in percent
At every level the owner sees percentages: curriculum %, module %, topic %.

What to verify:
- Curriculum/module % come from existing `progress.percent`; topic % from `maturity`.
- Percentages update after a quiz session completes or a Socratic concept is covered.

### SCENARIO 8: Regenerate a quiz
Owner chooses "Regenerate quiz" on a topic/module; the bot generates a fresh batch, adapting difficulty to prior scores.

What to verify:
- Regeneration replaces the persisted batch and resets session progress for that scope.
- Prior poor-scoring areas are weighted harder; if basics were solid, harder questions are served.
- The waiting indicator is shown again during regeneration.

### SCENARIO 9: Module-level probing (broad)
Owner starts a whole module; the bot serves a broad module-spanning quiz (1–2 questions per topic + integrative cross-topic questions).

What to verify:
- Module scope generates coverage across all included topics plus integrative items.
- Each question still maps to a topic/gap so correct answers advance the right topic's maturity.

## Technical/Architectural Scenarios

### SCENARIO 10: Prod bot is live on the same Neon DB
The production Telegram bot (`postanki_bot`) responds to `/start` in production, backed by the same Neon database as postanki.ilya.online.

What to verify:
- Bot Cloud Run service has the prod bot token, the live Neon `DATABASE_URL`, and the live API `API_BASE_URL`.
- Webhook is registered to `https://bot.postanki.ilya.online/telegram` with `callback_query` in `allowed_updates`.
- All learning state (sessions, answers, progress) reads/writes the same Neon DB the web app uses.

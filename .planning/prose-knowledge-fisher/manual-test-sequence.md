# Manual test sequence: typed answer survives failures

No confirmed scenarios, built from the brief.

Shipped: keep the typed answer and offer a retry when grading or loading fails. Contract: `.planning/prose-knowledge-fisher--typed-answer-recovery/spec.md`, `.planning/prose-knowledge-fisher--typed-answer-recovery/impl-report.md`.

## Start the local environment

Lane `dev` from `~/.claude/devports` (`node ~/.claude/devports/cli.mjs resolve post-anki --json`): web 5540, API 5560, Electric 5561, DB 5562. Check first, launch only what is missing:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5540/        # web
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5560/        # API (any HTTP status means it is up)
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select 1"
```

If all three answer, reuse the running environment. If not, from the repo root run `npm run dev` (starts the DB container, migrates, then API and web). Open http://localhost:5540.

## Before you start

The answer screen is http://localhost:5540/knowledge/answer. Steps 3-5 need at least one approved card with a question (see Data gap check). Stopping and starting the API process is done by you in the terminal that runs it.

## Group 1: Read-only

1. Action: open http://localhost:5540/knowledge/answer with the API running. Expect: heading "Answer knowledge bits"; either a question with an answer box and Submit, or "Nothing to answer right now."

## Group 2: Reversible (failure and recovery)

2. Action: stop the API process (Ctrl+C in its terminal), then reload /knowledge/answer. Expect: "Couldn't load your questions." with a Retry button; the text "Nothing to answer right now." is not shown.
3. Action: with the API still stopped, click Retry. Expect: the same error stays, no crash.
4. Action: start the API again (`npm run dev:api`), wait until it answers, then click Retry. Expect: the error disappears and the question (or the empty message) appears.
5. Action: with a question on screen, type a draft answer, stop the API, click Submit. Expect: "We couldn't grade your answer. Your answer is still saved here, so you can try again." with Try again and Skip this question; no raw error code is shown.
6. Action: start the API again, click Try again. Expect: the form returns with your typed text intact and editable; nothing is auto-submitted.
7. Action: click Submit now. Expect: the answer is graded and a result shows.

## Group 3: Irreversible

8. Action: on the next question type a draft, stop the API, click Submit, then click Skip this question. Expect: the draft is cleared and the next question (or empty message) shows with an empty answer box.

## Group 4: Skip and keyboard submit (reversible)

9. Action: open /knowledge/answer with a question on screen. Expect: a quiet "Skip for now" button sits beside Submit.
10. Action: click "Skip for now". Expect: the next question (or the empty message) shows; nothing is graded or recorded.
11. Action: type an answer and press plain Enter. Expect: a new line is added; nothing is submitted.
12. Action: press Ctrl+Enter (Cmd+Enter on Mac). Expect: the answer is graded and a result shows.
13. Action: on the next question hold Ctrl/Cmd+Enter down. Expect: the answer is submitted once and Skip is disabled while grading.

## Not verifiable through the product UI

- Loading text while the queue refetches after the last question: covered by `apps/web/src/routes/-knowledge.answer.test.tsx`.

## Data gap check

- Local dev DB has no knowledge sources or cards, so steps 1 (question case) and 5-8 cannot run until approved cards exist; left unfixed. Check:
```bash
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_bits"
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_sources"
```
- Not testable locally: none.

END-OF-REPORT

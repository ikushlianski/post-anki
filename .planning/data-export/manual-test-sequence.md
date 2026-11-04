# Manual test sequence: download all cards

No confirmed scenarios, built from the brief.

Shipped: download all cards and review history as a file; a cancelled card download ends cleanly on the server; negative numbers in the CSV stay plain numbers. Contract: `.planning/data-export--cards-download/spec.md`, `.planning/data-export--cards-download/impl-report.md`, `.planning/product-improvement-candidates/followups-impl-report.md` sections 2-3.

## Start the local environment

Lane `dev` from `~/.claude/devports` (`node ~/.claude/devports/cli.mjs resolve post-anki --json`): web 5540, API 5560, Electric 5561, DB 5562. Check first, launch only what is missing:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5540/        # web
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5560/        # API (any HTTP status means it is up)
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select 1"
```

If all three answer, reuse the running environment. If not, from the repo root run `npm run dev` (starts the DB container, migrates, then API and web). Open http://localhost:5540.

## Before you start

The All cards page is http://localhost:5540/knowledge. It shows "Download my cards:" with JSON and CSV links. Steps 2-8 need approved cards, ideally with some reviewed and one with a negative value such as a negative ease or interval (see Data gap check). Open downloaded files in a text editor.

## Group 1: Read-only

1. Action: open http://localhost:5540/knowledge. Expect: "Download my cards:" with JSON and CSV links under the header.
2. Action: click JSON. Expect: a file named post-anki-cards-YYYY-MM-DD.json downloads (today's date); it holds exportedAt and a cards list with question, answer, example, subject, sources, state, due date, interval, ease, lapses, review count, last reviewed and review history.
3. Action: click CSV. Expect: post-anki-cards-YYYY-MM-DD.csv downloads with a header row and one row per card; the history column reads "time grade" entries joined by " | ".
4. Action: compare the card count in either file with the All cards page. Expect: only approved cards appear; pending cards do not.
5. Action: in the CSV find a card whose text contains a comma, a quote or a line break. Expect: that cell is quoted, quotes doubled.
6. Action: in the CSV find a text cell starting with =, +, - or @. Expect: it has a leading apostrophe.
7. Action: in the CSV find a numeric column with a negative value (negative interval or ease). Expect: it shows as a plain number such as -2, with no apostrophe or quotes.

## Group 2: Reversible

8. Action: click CSV and cancel the download in the browser at once (or close the tab while it runs); then reload /knowledge and click JSON. Expect: the second download completes normally and the API terminal shows no hang or crash. Slow cancelling needs a large library; with few cards the download may finish before you can cancel.

## Group 3: Spreadsheet and JSON contents (reversible, needs cards)

9. Action: download the CSV and open it in Excel or Numbers by double-clicking. Expect: Russian and other non-Latin text shows correctly, not as garbled characters.
10. Action: look at the last four columns. Expect: topic, tags, added_at and other_questions are appended after the existing columns, in that order.
11. Action: for a card in a topic with tags, read those cells. Expect: topic shows the topic title, tags are names in alphabetical order, added_at is an ISO date; a card without topic or tags has empty cells.
12. Action: for a card with several questions, read other_questions. Expect: each other question reads "question => answer", joined by " | "; replaced questions are absent.
13. Action: download the JSON and open it in a text editor. Expect: each card has topic, tags, addedAt and otherQuestions with the same values.

## Not verifiable through the product UI

- Server stops reading cards when the client disconnects: `apps/api/src/knowledge-bit/knowledge-bit-export.controller.test.ts` ("should stop reading cards and finish when the client disconnects mid-download").
- Request without auth or with a bad format returns 400: covered by the controller tests, needs a raw HTTP call.
- Mid-stream failure makes the download fail instead of looking complete: no UI trigger; engineering pass.

## Data gap check

- Local dev DB has no knowledge sources or cards, so steps 2-8 have nothing to export (the files would hold only headers); no card with a negative number or review history exists either. Left unfixed. Check:
```bash
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_bits"
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_sources"
```
- Not testable locally: none.

END-OF-REPORT

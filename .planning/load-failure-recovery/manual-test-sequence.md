# Manual test sequence: friendly error and not-found pages

No confirmed scenarios, built from the brief.

Shipped: show a friendly error and not-found page instead of a crashed screen. Contract: `.planning/load-failure-recovery--router-error-pages/spec.md`, `.planning/load-failure-recovery--router-error-pages/impl-report.md`.

## Start the local environment

Lane `dev` from `~/.claude/devports` (`node ~/.claude/devports/cli.mjs resolve post-anki --json`): web 5540, API 5560, Electric 5561, DB 5562. Check first, launch only what is missing:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5540/        # web
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5560/        # API (any HTTP status means it is up)
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select 1"
```

If all three answer, reuse the running environment. If not, from the repo root run `npm run dev` (starts the DB container, migrates, then API and web). Open http://localhost:5540.

## Before you start

The dashboard is http://localhost:5540/ and its data comes from the API. Provoking failure means stopping the API process yourself (Ctrl+C in its terminal).

## Group 1: Read-only

1. Action: open http://localhost:5540/ with the API running. Expect: the dashboard loads normally.
2. Action: open http://localhost:5540/no-such-page. Expect: "Page not found" with a "Back to dashboard" link.
3. Action: click "Back to dashboard". Expect: you land on the dashboard.

## Group 2: Reversible (failure and recovery)

4. Action: stop the API, then open http://localhost:5540/ fresh (reload). Expect: a plain message ("Something went wrong while getting your data. Try again, or go back to the dashboard."), a Retry button and a "Back to dashboard" link; no stack trace or raw error text on screen.
5. Action: click Retry with the API still stopped. Expect: the same friendly message again, no blank or crashed screen.
6. Action: start the API again (`npm run dev:api`), wait until it answers, click Retry. Expect: the dashboard loads in place without a manual reload.
7. Action: with the API stopped, click a sidebar link to another page, then restore the API and click Retry. Expect: the friendly message on failure, the page content after Retry.
8. Action: open http://localhost:5540/knowledge-bit-review with the API stopped. Expect: this page shows its own error screen, not the shared one (it keeps its own).

## Group 3: Reversible (settings save and card lists)

9. Action: open the settings page, stop the API (or set devtools Network to Offline), then change a setting (model, toggle or new cards per day). Expect: "Could not save, try again." appears next to that control, every control stays usable, and the control shows its last saved value (the new-cards box reverts).
10. Action: restore the API (or go back online) and change the setting again. Expect: the save succeeds and the error line is gone.
11. Action: with the API stopped, reload the settings page. Expect: the settings still load; if placement suggestions fail, the placement section shows only a short error note ("Reload to try again").
12. Action: with the API stopped, open http://localhost:5540/knowledge. Expect: "Could not load your cards. Check your connection and try again." with a Retry button; the Download links stay visible.
13. Action: start the API, click Retry. Expect: the error is replaced by the card list in place.
14. Action: stop the API and open the Suspended cards list. Expect: the same message and Retry button; after restoring the API, Retry shows the list.

## Not verifiable through the product UI

- "Loading..." status on slow navigation (1000 ms delay): covered by `apps/web/src/route-fallback/route-fallback.test.tsx`.

## Data gap check

- Local dev DB has no knowledge sources or cards; none of these steps need them, left as is. Check:
```bash
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_bits"
docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select count(*) from knowledge_sources"
```
- Not testable locally: none.

END-OF-REPORT

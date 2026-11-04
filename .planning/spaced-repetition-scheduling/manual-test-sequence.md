# Manual test sequence: spaced-repetition-scheduling

No confirmed scenarios, built from the brief: `.planning/spaced-repetition-scheduling--sidebar-review-count/{spec,impl-report}.md`, `.planning/spaced-repetition-scheduling--new-card-limit-setting/{spec,impl-report}.md`, `.planning/product-improvement-candidates/followups-impl-report.md` section 1.

Shipped this run:
- Sidebar review count current after grading and on the learner's local day
- Older sidebar count reply cannot overwrite a newer one during fast grading
- Learner-set daily new-card limit in settings (default 20, 1 to 200)

Not done: none.

## Start the local environment

Port source: `~/.claude/devports` (registry.toml), project `post-anki`, lane `dev`: web 5540, API 5560, Electric 5561, DB 5562. Ports are reused as registered, none newly claimed.

Check what is already running first; launch only what is missing.

```bash
DEVPORTS=~/.claude/devports/cli.mjs
node "$DEVPORTS" resolve post-anki --json
lsof -i :5540 -sTCP:LISTEN
lsof -i :5560 -sTCP:LISTEN
curl -sf http://localhost:5540/ >/dev/null && echo web-up
docker ps --filter name=post-anki-dev-db --format '{{.Names}} {{.Status}}'
```

If the DB container is missing, then the API, then the web app (migration 0101 is already applied locally, do not re-run it):

```bash
cd /Users/ikushlianski/webdata/ilya-projects/post-anki
npm run db:dev:up
npm run dev:apps
```

Open http://localhost:5540.

## Before you start (fixtures)

- Migration 0101 (`app_settings.new_cards_per_day`, default 20) is applied locally. Confirm:
  `docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select new_cards_per_day from app_settings"`
- Steps 4 onward need approved cards (some new, some already due). The local dev DB has none, see Data gap check. Without them, run only steps 1 to 3.
- To cite example cards once they exist, take the newest by creation time:
  `docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select id, created_at from <cards table> order by created_at desc limit 5"` (find the table name with `\dt`).

## Group 1: Read-only browsing

1. Action: open the sidebar on any page with no cards in the account. Expect: the link reads plain "Review" with no counts and no error.
2. Action: open Settings (/admin-settings), find "New cards per day". Expect: the field shows 20 (the default) with the hint "Most new cards shown in a day, from 1 to 200. Reviews that are due are not limited."

## Group 2: Reversible mutations

3. Action: in "New cards per day" type 500 and press Enter, then reload the page. Expect: the field shows 200 after reload. Action: type 0, blur, reload. Expect: the field shows 1. Action: type 20, blur, reload. Expect: back to 20 (restores the default).
4. Action: set the field to 2 and press Enter, then open Review (/knowledge/review) with at least 3 approved new cards. Expect: the sidebar shows at most "2 new" and the review screen offers no more than 2 new cards.
5. Action: grade the first new card. Expect: the sidebar count drops by one new card right after grading, without a page reload.
6. Action: click Undo on that grade. Expect: the sidebar count goes back up by one.
7. Action: bury (or suspend) the next card. Expect: the sidebar count drops by one. Action: unsuspend it from "Suspended cards" if suspended, then return. Expect: the sidebar count rises again.
8. Action: grade several cards quickly one after another (3 or more within a second or two). Expect: the final sidebar label settles on the correct remaining count and never flips back to a larger earlier number after the last grade.
9. Action: approve a suggestion in "Approve suggestions" that creates a new card. Expect: the sidebar review count rises without a reload.

## Group 3: Expensive or irreversible

10. Action: with the limit still 2, grade cards until the 2 new cards are done while more new cards are waiting. Expect: the done screen says "Daily new-card limit reached. Change it in settings." with a link to /admin-settings. Action: click the link, set 20, return to Review. Expect: more new cards are offered and the message is gone on the next done screen.
11. Action: finish a session where no new cards were hidden (limit higher than waiting cards). Expect: the done screen does not show the limit message.

## Group 4: Environment-only

None. Everything above runs on localhost.

## Not verifiable through the product UI

- A save that succeeds while only the page refresh fails shows "Saved, but the page could not refresh" and no save error: `apps/web/src/routes/-admin-settings.test.tsx`.

- Learner's local day in the sidebar count: needs the browser time zone changed (devtools sensors) and a DB check of due times near midnight; covered by `apps/web/src/nav/sidebar.test.tsx` (time zone passed to the counts call).
- Older reply arriving after a newer one: needs a delayed network response; covered by the sidebar test "should show the newest counts when an older reply arrives last during fast grading". Step 8 only approximates it.
- Failed refresh keeps last counts: needs the API stopped mid-session; covered by the sidebar test for failed refresh.
- Migration 0101 content: check with `docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "\d app_settings"`; covered by the generated migration and integration test `knowledge-bit-review-queue.new-card-limit.integration.test.ts`.
- Scoped reviews (a single topic) are not capped by the limit: needs per-topic review; covered by the same integration test file.

## Data gap check

- The local dev DB has no cards, so steps 4 to 11 cannot run. Not fixed here; needs approved cards (a mix of new and already-due) before the sequence, supplied by the user or the seed source.
- No example rows could be cited, since there are no cards; the newest-first query is given in Before you start.

END-OF-REPORT

# Manual test sequence: article-knowledge-extraction

No confirmed scenarios, built from the brief (shipped items plus the direction's `### Scope` in `.planning/todo.md`).

Shipped: article page cleaned to main text; background 3-5 sentence summary on `knowledge_sources.summary` at URL import; final address after redirects (safe-checked) stored as `knowledge_sources.source_url` and set as source link on every extracted item; approval screen shows summary and source link above each source's items. Migration `0100_knowledge_source_url_and_summary` adds `source_url` and `summary`.

## Start the local environment

Ports come from devports (`node ~/.claude/devports/cli.mjs resolve post-anki --json`, lane `dev`, host `127.0.0.1`): api 5560, web 5540, electric 5561. Check each is this project's before launching; if both api and web already answer, reuse them and skip the start commands.

```bash
cd /Users/ikushlianski/webdata/ilya-projects/post-anki
node ~/.claude/devports/cli.mjs resolve post-anki --json
lsof -i :5560 -sTCP:LISTEN; lsof -i :5540 -sTCP:LISTEN
```

Database: only the shared pet-projects Postgres, dev lane `post_anki_dev` (127.0.0.1:5999). `apps/api/.env.local` points at `localhost:5562/postanki_dev` and `.env` at a remote database, so override `DATABASE_URL` on every command below.

```bash
docker compose -f ~/.claude/pet-projects-db/docker-compose.yml up -d

export DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev

# apply migration 0100 on the dev lane via the repo migrate script
npm run db:migrate:api

# confirm both columns exist
PGPASSWORD=pet_projects psql -h 127.0.0.1 -p 5999 -U pet_projects -d post_anki_dev \
  -c "select column_name from information_schema.columns where table_name='knowledge_sources' and column_name in ('source_url','summary');"

# api and web, same DATABASE_URL, devports ports (the api needs OPENROUTER_API_KEY in apps/api/.env.local)
PORT=5560 npm run dev:api
WEB_PORT=5540 npm run dev:web
```

Health: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5560/_healthz` and open `http://127.0.0.1:5540/`.

## Before you start

- Starting state: `knowledge_sources` is empty on `post_anki_dev` (checked); no sources are pending approval.
- Pick one real article with a long page (site menu, sidebar, footer, comments), here called ARTICLE_A, and one short link that redirects to it (a link shortener or an `http` to `https` redirect), here called LINK_R. Use real URLs you trust.
- The summary and the extraction run in the background after import, so each wait below is the short delay, not a hang.

## Group 1: Reversible actions (import and read)

1. Action: open `http://127.0.0.1:5540/add-knowledge`, click "Add link" on block 1, paste ARTICLE_A, click the submit button.
   Expect: the green success message appears at once, with an "Approve suggestions" link; the import did not wait for the summary.
2. Action: wait about 30 seconds, then click "Approve suggestions".
   Expect: the approval screen lists the source for ARTICLE_A with items pending.
3. Action: on the approval screen, read the area above ARTICLE_A's items.
   Expect: an "Article summary" box with 3-5 plain sentences in the article's language, no lists or markdown. Under it, a link showing the article's host. (If the box is missing, reload once; the summary may still have been running.)
4. Action: click the host link under the summary.
   Expect: a new tab opens on ARTICLE_A's address.
5. Action: read every extracted item on ARTICLE_A's source.
   Expect: items come from the article body only; no text from the site menu, ads, cookie banner, footer or comments appears in any item.
6. Action: open any item's source links on the card (expand the item).
   Expect: each item lists the ARTICLE_A address as its source link.
7. Action: back on `/add-knowledge`, add link LINK_R, submit, wait about 30 seconds, open "Approve suggestions".
   Expect: the new source shows the summary box and the link host of the final article address (where LINK_R redirected to), not the short link's host. Each of its items carries that final address as source link.

## Group 2: Pasted text has no summary or link

8. Action: on `/add-knowledge`, stay on "Paste text", paste two paragraphs of prose, submit, wait about 30 seconds, open "Approve suggestions".
   Expect: this source's items appear with no "Article summary" box and no source link above them.

## Group 3: Summary failure does not fail the import (needs an api restart)

9. Action: stop the api, restart it with the language model address pointing at a dead port (`OPENROUTER_BASE_URL=http://127.0.0.1:5599 PORT=5560 npm run dev:api`, same `DATABASE_URL`), then import ARTICLE_A again on `/add-knowledge` with "Add link".
   Expect: the green success message still appears and no error message shows; the import is accepted.
10. Action: wait about 30 seconds, open "Approve suggestions".
    Expect: the new source has no "Article summary" box (summary failed quietly); the page loads normally. The api log shows `article_summary_failed`.
11. Action: stop the api and restart it with the normal command from the environment block.
    Expect: the api is healthy again for any later checks.

## Not verifiable through the product UI

- Stored final address and safe check: `select id, source_url, left(summary, 80) from knowledge_sources order by created_at desc;` on `post_anki_dev` (example rows, most recent first: the step 9 source with `source_url` set and `summary` null; the step 8 pasted source with both null; the step 7 LINK_R source with the final address and a summary; the step 1 ARTICLE_A source with its address and a summary). Covered by `knowledge-source.controller.article.test.ts`.
- Unsafe final address stored as null (redirect to a private or non-http address): needs a controlled redirecting host; covered by the same test file.
- Cleaning rules in detail: covered by tests of `apps/api/src/knowledge-source/article-text.ts`.
- Summary length cap and prompt-injection handling: covered by `apps/api/src/mastra/article-summary.agent.test.ts`.

## Data gap check

- Migration 0100 is not applied to `post_anki_dev` (columns `source_url` and `summary` absent, checked); not patched here, applied by the migrate command in the environment block.
- No sources exist on `post_anki_dev` (count 0); the sequence creates its own sources through the UI, no seed needed.
- ARTICLE_A and LINK_R are real external URLs the tester must choose; no fixture exists for them.
- `OPENROUTER_API_KEY` is needed in `apps/api/.env.local` for steps 3 to 7; its value was not inspected here.
- Local env note: `apps/api/.env.local` points at a separate `postanki_dev` on port 5562, not the shared database; the `DATABASE_URL` override above is required.

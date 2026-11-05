# Manual test sequence: ai-web-enrichment

No confirmed scenarios, built from the brief (shipped items plus the direction's Scope in `.planning/todo.md`).

Scope under test: AI label and source links on knowledge items, web fetch and web search in item chat, draft agent with web research, save-as-new-card draft flow, AI badge on approval and study screens, item chat toggle in the knowledge overview.

## Start the local environment

Ports come from the devports registry (`resolve` is the only allocator; no scanning). Nothing here is started by this document; run the commands yourself.

```bash
cd ~/webdata/ilya-projects/post-anki
DEVPORTS=~/.claude/devports/cli.mjs
PORTS=$(node "$DEVPORTS" resolve post-anki --json 2>/dev/null); echo "RC=$?"; echo "$PORTS"   # RC 0 -> use roles.web.url and roles.api.url; RC 4/2 -> stop and report
```

Registered defaults: web 5540, api 5560 (host 127.0.0.1). Already running? Check `curl -s http://127.0.0.1:5560/_healthz` and open `http://127.0.0.1:5540/`; if both answer from this repo (`lsof -i :5560 -sTCP:LISTEN`), reuse them and skip the launch lines below, but still run the migrate step.

Database: shared pet-projects Postgres only (dev lane `post_anki_dev` on 127.0.0.1:5999). `apps/api/.env` points DATABASE_URL at a remote database, so override it explicitly for every api command; the repo's own `.env.local` is not enough.

```bash
docker compose -f ~/.claude/pet-projects-db/docker-compose.yml up -d
export DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev
npm run db:migrate:api      # applies pending migrations incl. 0098 (is_ai_generated), 0099 (source_links), 0100 (knowledge_sources.source_url, summary)
```

```bash
export DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev
PORT=5560 npm run dev:api          # terminal 1, needs OPENROUTER_API_KEY in apps/api/.env.local
WEB_PORT=5540 npm run dev:web      # terminal 2, API_BASE_URL=http://127.0.0.1:5560 already in apps/web/.env.local
```

Confirm the columns exist before testing:

```bash
PGPASSWORD=pet_projects psql -h 127.0.0.1 -p 5999 -U pet_projects -d post_anki_dev -Atc "select column_name from information_schema.columns where table_name='knowledge_bits' and column_name in ('is_ai_generated','source_links')"
```

Expect both column names. Electric sync is part of the dev stack; if the overview shows no rows after approval, restart the web/electric piece per `docs/memories/local-dev-env.md`.

## Before you start (fixtures)

- Web base URL: `http://127.0.0.1:5540`. Routes used: `/add-knowledge`, `/knowledge-bit-review`, `/knowledge`, `/knowledge/review`.
- The dev lane holds no knowledge items today (see Data gap check), so Group 1 creates the first item and every later step reuses it.
- Steps marked paid call a real model through OpenRouter; web research costs more and is slower. Run them once.
- Use a topic a web page can plausibly extend, e.g. a short pasted text about HTTP caching headers (Cache-Control, ETag).

## Group 1: Read-only browsing and setup (zero cost)

1. Open `/knowledge`. Expect the overview loads with no console error and an empty state (no rows) before any item exists.
2. Open `/knowledge-bit-review`. Expect the approval screen loads with nothing pending and no AI badge anywhere.
3. Open `/knowledge/review`. Expect the study screen loads with nothing due.

## Group 2: Reversible mutations

4. Open `/add-knowledge`, type the HTTP caching text into block 1 (`knowledge-block-input-0`), click "Add" (`knowledge-submit-button`). Expect the item is accepted and extraction starts (paid, small).
5. Open `/knowledge-bit-review` and wait for the extracted item(s) to appear. Expect pending items listed with a prompt/answer and NO AI badge (`ai-label-badge-<id>` absent), because the label defaults to not AI for ordinary extraction.
6. Click Approve (`knowledge-bit-review-approve-<id>`) on one item; note its text as ITEM A. Expect it leaves the pending list.
7. Open `/knowledge`. Expect ITEM A listed as an approved card with Suspend and a "Chat about this" button on its row (`knowledge-bit-chat-open`).
8. Click "Chat about this" on ITEM A's row, then the close button (`knowledge-bit-chat-close`), then open it again. Expect the panel opens and closes in place on that row only, other rows unaffected, and reopening works.

## Group 3: Expensive actions (paid, run once)

9. With the chat open on ITEM A, type "Why does ETag exist if Cache-Control is there?" in `knowledge-bit-chat-input` and click send. Expect a typing indicator, then an assistant message that explains the why in terms of ITEM A.
10. Ask "Read https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching and tell me what it says about validation." Expect the assistant reply cites that page's content (web fetch used), not a refusal about being unable to open links. If the tutor cannot reach the internet from this machine, record it as a failure of this step.
11. Ask a question that needs a lookup ("What is the stale-while-revalidate directive and who defined it?"). Expect a web-informed answer with a named source.
12. In the draft section of the same chat, leave "Use web research (slower and paid)" (`knowledge-bit-chat-draft-web`) unticked, click "Draft a new card from this chat" (`knowledge-bit-chat-draft-start`). Expect the editor appears with filled front and back (`knowledge-bit-chat-draft-front`, `-back`) and NO draft AI badge (`ai-label-badge-draft` absent), since no web research was used.
13. Tick `knowledge-bit-chat-draft-web`, click the draft button again. Expect the button shows "Drafting…", then the editor shows new front/back text AND an AI badge (`ai-label-badge-draft`) with one or more source links. Each link shows a host name and opens an http(s) page.
14. Edit the back text slightly, click "Save as new card" (`knowledge-bit-chat-draft-save`). Expect "Saved. The new card is waiting in your review queue." (`knowledge-bit-chat-draft-saved`), no error.
15. Open `/knowledge-bit-review`. Expect the saved card appears as a NEW pending item under the same source as ITEM A, with your edited text, an AI badge (`ai-label-badge-<id>`) and the same source links from step 13. Call it ITEM B.
16. Click Approve on ITEM B. Expect it leaves the pending list, and ITEM A is untouched.
17. Open `/knowledge`. Expect ITEM B listed as an approved card next to ITEM A, with its own "Chat about this" button.
18. Open `/knowledge/review` and study until ITEM B appears (rate other due cards if needed). Show the answer (`anki-review-show-answer`). Expect an AI badge with the source links on ITEM B's card (below the answer, `ai-label-badge`), and no badge on ITEM A's card.
19. Click one source link on the study card. Expect it opens the cited page in a new tab and the study session stays on the same card.
20. Repeat step 14 once from the unticked-web draft (step 12 setup) and approve it. Expect the card has no AI badge in approval or study, confirming a no-research draft is not labelled.

## Not verifiable through the product UI

- Column defaults and stored values (`is_ai_generated` false for old rows, `source_links` json): `psql` against `post_anki_dev`, `select id, is_ai_generated, source_links from knowledge_bits order by created_at desc limit 5`; covered by `knowledge-bit-manual-item.repo.test.ts` and `knowledge-bit-derived-item.repo.test.ts`.
- `POST /knowledge-bits/:id/derived-items` rejects a bit that is not approved (`not_approved`) and a missing id (`not_found`): raw HTTP call; covered by `knowledge-bit-derived-item.controller.test.ts`.
- Unsafe source links (non-http schemes) are dropped from the badge: unit level; covered by `ai-label-badge.test.tsx`.
- Double JSON encoding fix in the web api-client: covered by `apps/web/src/curriculum/api-client.test.ts`.

## Data gap check

- Gap: `post_anki_dev` contains zero knowledge items (`select count(*) from knowledge_bits` returns 0), so no existing approved item exists to chat on; Group 1 and 2 create ITEM A through the UI. Not fixed here.
- Gap: `post_anki_dev` does not yet have `knowledge_bits.is_ai_generated` and `source_links` (verified via information_schema); migrations 0098, 0099 (and 0100) are not applied. Not fixed here; the environment block applies them.
- Gap: web research, web fetch and the search tool need real internet and a funded OPENROUTER_API_KEY in `apps/api/.env.local`; only the key name's presence was confirmed, not that it works or has credit.
- Gap: `apps/api/.env` DATABASE_URL points at a remote database rather than the shared lane; every api command must export DATABASE_URL first (included above). Not changed here.
- Gap: whether a manually derived pending card gets a study variant immediately after approval (step 18) was not confirmed in code; if ITEM B never appears in study, that is a finding, not a fixture problem.
- Gap: no AI-labelled row exists today, so there are no example ids to quote; after step 15 the latest one is `select id, is_ai_generated, source_links, created_at from knowledge_bits where is_ai_generated order by created_at desc limit 1`.

## Item chat: enrich and suggest related cards (web)

1. Open an approved card that came from your own source material, open its chat, and confirm "Use web search to clarify" is ticked by default.
2. Ask about a piece you do not understand. Expect a reply that starts with "From your material:" quoting the relevant passage, then examples or facts tagged [Web] or [Your material].
3. Expect one to three suggested cards under the reply, each badged Web or Your material. Tap "Add to tray" on one: the tray opens filled with its front and back.
4. Create the card from the tray. A Web-badged one lands in pending review with the AI label and source links; a Your-material one has no AI label.
5. Untick web search and ask again: no search happens, no source quote is added, and the reply matches the old grounded-only behaviour.
6. Ask a question needing several searches: the reply never uses more than 2 searches and 1 page read.
7. Not tested live: real web search needs a funded OPENROUTER_API_KEY and internet.

## Triage chat, long paste, parent review mix (2026-11-06)

1. Send a card to chat in review (button, C key, swipe down): the card shrinks and fades toward the Inbox, then the next card shows. With reduced motion on, no animation.
2. Open Inbox chat, ask a "why" question: reply is more thoughtful and offers 1-2 proposed cards. Tap Approve: card shows "Added to approved cards" and appears in approved cards; keep chatting instead: nothing is created.
3. Add knowledge: paste 8,000+ characters of prose with several topics: it becomes several sources with titles, extraction runs on each. Paste short text: one source as before. Paste the same long text again: "already added".
4. Review a parent subject with 2+ sub-subjects (e.g. Business): the queue mixes new and learning cards from several children, leaning slightly to the one studied most recently; grade a full page and the next page shows other cards, not the graded ones.

# Manual test sequence: Cloze cards

No confirmed scenarios, built from the plan (`.planning/cloze-cards/plan.md`) and the run reports `impl-u1.md` to `impl-u6.md` and `review.md` in `.planning/.runs/2026-11-08/cloze-cards/`.

Scope shipped: manual cloze create on `POST /knowledge-sources/:id/items` (400 `invalid_cloze` for a bad note); AI extraction for non-language, non-business subjects may emit cloze cards; sources whose `import_key` starts with `anki:` and hold `{{cN::..}}` become cloze cards with no model call, other sources still go to the model; the local `anki-batch-mcp` server puts `{{cN::..}}` into `rawText`; the web manual form got a cloze mode but is not mounted on any screen.

Deviation from the UI-only rule, on purpose: the manual create route and the MCP tools have no screen, so Groups 1 to 3 use curl, the MCP session and `psql`; only Group 4 is on-screen. The web cloze form cannot be reached by hand (see the closing section).

Status per step is not tracked here. Everything runs on localhost against the isolated e2e stack.

## Start the local environment

Nothing was started and `~/ports.toml` was not touched when this file was written. The isolated e2e stack owns these localhost ports (defaults of `scripts/e2e-stack.sh`): Postgres 5578, mock model server 4999, API 5570, web 5550.

Check first, reuse if healthy:

```bash
cd /Users/ikushlianski/webdata/ilya-projects/post-anki
npm run e2e:stack:status
curl -fsS http://localhost:5570/_healthz
curl -fsSI http://localhost:5550/ | head -1
```

If everything is healthy, skip the next block. Otherwise start only what is missing:

```bash
npm run e2e:stack:up
npm run e2e:stack:status
```

The stack sends every model call to the mock server on 4999, which is the mock-LLM mode this sequence needs. If you start the API by hand instead, set `LLM_MODE=mock`.

Variables and the local shared secret (read from `e2e/.env`, never from `apps/api/.env`):

```bash
cd /Users/ikushlianski/webdata/ilya-projects/post-anki
set -a; source e2e/.env; set +a
export API=http://localhost:5570
export DB=postgres://postanki:postanki@localhost:5578/postanki_e2e
export AUTH="Authorization: Bearer $API_SHARED_SECRET"
```

Work copy of the export (the original `subjects/Business.txt` is never used):

```bash
mkdir -p /Users/ikushlianski/webdata/ilya-projects/post-anki/.tmp-manual
cp subjects/Business.txt .tmp-manual/Business.copy.txt
printf '{"mcpServers":{"anki-batch-copy":{"type":"stdio","command":"npx","args":["tsx","apps/anki-batch-mcp/src/anki-batch-mcp.server.ts","/Users/ikushlianski/webdata/ilya-projects/post-anki/.tmp-manual/Business.copy.txt"]}}}' > .tmp-manual/copy.mcp.json
```

Fixture facts (not tested here): the e2e database needs the Business sub-subject `Sales` (deck "Продажи" maps to it) and migration 0152 (the `scopes` column). Look up the subject id once:

```bash
psql $DB -c "select id, name from subjects where name = 'Sales'"
export SUBJECT_ID=<id printed above>
```

## Group 1: Read-only (local converter)

1. Action: in `/Users/ikushlianski/webdata/ilya-projects/post-anki` run `claude --mcp-config .tmp-manual/copy.mcp.json --strict-mcp-config`, then `/mcp`. Expect: `anki-batch-copy` connected with `get_next_batch`, `confirm_batch`, `status`.
2. Action: ask Claude to call `get_next_batch` with `size: 20`. Expect: notes each with `hash`, `deck`, `front`, `back`, `rawText`. For cloze notes `rawText` contains `{{c1::`, `{{c2::` and so on (hints appear as `{{c1::answer::hint}}`), while `front` and `back` hold no `{{` and no HTML. A note with no cloze spans has plain `rawText`.
3. Action: `wc -l .tmp-manual/Business.copy.txt` and `cmp subjects/Business.txt .tmp-manual/Business.copy.txt`. Expect: identical; `get_next_batch` did not change the copy and the original is untouched (`git status subjects/Business.txt` clean).

Pick one cloze note from step 2 and keep its `hash` and `rawText` for Group 3.

## Group 2: Manual cloze create (writes to the local database only)

4. Action: create a source to attach the card to:
   `curl -s -X POST $API/knowledge-sources -H "$AUTH" -H 'content-type: application/json' -d '{"text":"Manual cloze host source for testing the create route.","subjectId":"'$SUBJECT_ID'"}'` and `export SRC_ID=<id from the response>`. If the response has no `id` at the top level, take it from `select id from knowledge_sources order by created_at desc limit 1`. Expect: a source id.
5. Action: count before the bad note:
   `psql $DB -c "select (select count(*) from knowledge_bits) as bits, (select count(*) from knowledge_bit_question_variants) as variants"`. Expect: two numbers; write them down.
6. Action: send a bad note (unclosed gap):
   `curl -s -w '\n%{http_code}\n' -X POST $API/knowledge-sources/$SRC_ID/items -H "$AUTH" -H 'content-type: application/json' -d '{"note":"{{c1::Paris is the capital of France"}'`. Expect: status 400, body `{"error":"invalid_cloze","message":"..."}` with a readable sentence about the unclosed gap.
7. Action: rerun the count query from step 5. Expect: both numbers equal the ones from step 5 (the 400 wrote nothing; this is a direct consequence of step 6).
8. Action: send a note with no gap at all: same call with `{"note":"Paris is the capital of France"}`. Expect: status 400 with `invalid_input` (a note needs at least one `{{c1::...}}` gap); counts still unchanged.
9. Action: send a valid note:
   `curl -s -w '\n%{http_code}\n' -X POST $API/knowledge-sources/$SRC_ID/items -H "$AUTH" -H 'content-type: application/json' -d '{"note":"{{c1::Paris}} is the capital of {{c2::France}}.","example":"Manual test example"}'`. Expect: status 201, an item that is pending with 2 variants of kind `cloze`.
10. Action: read the rows (most recent bit by `created_at` descending, which is the one step 9 just made):
    `psql $DB -c "select id, body, approval_state, created_at from knowledge_bits where knowledge_source_id='$SRC_ID' order by created_at desc limit 1"` then, with that bit id,
    `psql $DB -c "select kind, \"order\", prompt, answer, sentence from knowledge_bit_question_variants where knowledge_bit_id='<bit id>' order by \"order\""`.
    Expect: `body` is `Paris is the capital of France.` (markers removed), `approval_state` is `pending`; two variant rows, orders 1 and 2, kind `cloze`, `sentence` equal to the full note with markers.
11. Action: send the basic shape to prove it still works:
    `curl -s -w '\n%{http_code}\n' -X POST $API/knowledge-sources/$SRC_ID/items -H "$AUTH" -H 'content-type: application/json' -d '{"front":"Capital of Germany?","back":"Berlin"}'`. Expect: status 201, one non-cloze variant.

## Group 3: Anki import through the local MCP, then the model path

12. Action: mint a write token (the script takes the database from the variable and does not read any env file):
    `cd apps/api && DATABASE_URL=$DB node --import tsx scripts/create-api-token.ts "cloze manual" --scopes knowledge:write` and `export WRITE_TOKEN=<printed pat_...>`. Expect: output says "with scopes knowledge:write".
13. Action: write `.tmp-manual/local.mcp.json` as `{"mcpServers":{"post-anki-local":{"type":"http","url":"http://localhost:5570/mcp","headers":{"Authorization":"Bearer <WRITE_TOKEN>"}}}}`, run `claude --mcp-config .tmp-manual/local.mcp.json --strict-mcp-config`, then `/mcp`. Expect: `post-anki-local` connected, tools include `submit_knowledge`.
14. Action: ask Claude to call `submit_knowledge` with deck `Продажи` and one note: `key` `anki:cloze-manual-0001`, `text` `{{c1::Mitochondria}} produce {{c2::ATP}} inside the {{c3::cell}}.` followed by a blank line and `Back extra: only in eukaryotes.` Expect: `created: 1`, `alreadyPresent: 0`, `subjectName` Sales, one `sourceIds` entry.
15. Action: submit the same text under a key that does not start with `anki:`, using the plain create route so it is a normal source:
    `curl -s -X POST $API/knowledge-sources -H "$AUTH" -H 'content-type: application/json' -d '{"text":"{{c1::Mitochondria}} produce {{c2::ATP}} inside the {{c3::cell}}.\n\nBack extra: only in eukaryotes.","subjectId":"'$SUBJECT_ID'"}'`. Expect: a source id (this source has no import key).
16. Action: wait for the detection scan (a minute or two), then check both sources (the two most recent by creation time, newest first):
    `psql $DB -c "select id, import_key, status, created_at from knowledge_sources where import_key = 'anki:cloze-manual-0001' or raw_text like '%Mitochondria%' order by created_at desc limit 2"`. Expect: both rows reach a processed state.
17. Action: for the anki-keyed source id, list its bits and variants:
    `psql $DB -c "select b.id, b.body, b.background, b.created_at from knowledge_bits b where b.knowledge_source_id='<anki source id>' order by b.created_at desc"` and then the variants query from step 10 on that bit. Expect: exactly one bit, `body` `Mitochondria produce ATP inside the cell.`, `background` `Back extra: only in eukaryotes.`, three `cloze` variants with orders 1 to 3, each `sentence` holding the full marked note. No model call was needed for this source.
18. Action: do the same lookup for the non-anki source. Expect: the bits come from the mock model (content from the mock server, not one cloze bit with three variants taken straight from the markers); the Group 3 difference from step 17 is that this source went through the model path. Cite which rows you looked at: the most recent bit for that source by `created_at` descending.
19. Action: repeat the call from step 14 unchanged. Expect: `created: 0`, `alreadyPresent: 1`; the anki source row count for the key stays 1 and no second bit appears.

## Group 4: Review screens (on-screen)

20. Action: open `http://localhost:5550/knowledge-bit-review`. Expect: under the Sales sub-subject a pending card for the Mitochondria note with three gaps (one card per gap number) and the Back extra text as its background; the card from step 9 (Paris / France) shows two gaps.
21. Action: approve the Mitochondria bit and open `http://localhost:5550/knowledge/review` (the review session). Expect: cloze cards render the sentence with the current gap hidden and the other gaps visible; revealing shows the answer; the three variants come as separate cards.
22. Action: in the review-screen note editor for the Paris / France card, change the note to `{{c1::Paris}} is the capital of {{c2::France}} and {{c3::Europe}}.` and save. Expect: the card now has three gaps (this uses the existing note editor, not the new form).

Example rows from the database (picked as the 5 most recent cloze variants by creation time, newest first):

```bash
psql $DB -c "select v.id, v.knowledge_bit_id, v.\"order\", v.prompt, v.answer, v.created_at from knowledge_bit_question_variants v where v.kind='cloze' order by v.created_at desc limit 5"
```

## Not verifiable through the product UI

- Web manual form, cloze mode (toggle, live preview, create blocked on a broken note): the form is not mounted on any screen, so there is nothing to click. Covered by `apps/web/src/knowledge-bit/knowledge-bit-review-draft-card.test.tsx` and `apps/web/src/curriculum/api-client.test.ts`, run with `npx vitest run`. The API half of the same flow is Group 2.
- AI extraction emitting a cloze card for a non-language, non-business subject: the mock model cannot be steered to return one by hand. Covered by `apps/api/src/mastra/knowledge-bit-source-items.agent.prompt.test.ts`.
- Single-gap import notes, notes over the length cap and malformed or nested gaps falling back to the model: `apps/api/src/knowledge-bit/knowledge-bit-cloze-import.test.ts` and `knowledge-bit-cloze-import.integration.test.ts`.
- Previously imported notes are not upgraded: a note already present under the same hash stays as it was (review.md Medium 10, no backfill). Check by resubmitting an old hash with `submit_knowledge`; it reports `alreadyPresent`.

## Data gap check

- Gap, not fixed: the e2e database may lack the Sales sub-subject (created by `npm run db:seed:business-sub-subjects -w @post-anki/api`); step 14 would then return a missing-subject error. Not checked, the file-only rule forbids running anything.
- Gap, not fixed: the e2e database may lack migration 0152 (`scopes` column); step 12 would fail.
- Gap, not fixed: the stack's mock model returns fixed content, so step 18 cannot show real card quality, only that the model path ran.
- Gap, not fixed: step 4 assumes the create-source response carries the new source id; the fallback query is given.
- Gap, not fixed: no `~/ports.toml` entry was read or written, so the ports above are script defaults, not confirmed free.
- Gap, not fixed: no database rows could be cited because nothing has been run; every row citation above states its ordering and query.
- Gap, not fixed: the detection scan timing (step 16) depends on the stack's worker and is unconfirmed.

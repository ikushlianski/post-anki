# Business Anki import MCP

## local-batch-server

### Scope
- A stdio MCP server in this repo that Claude starts from .mcp.json and that reads subjects/Business.txt in batches, writes Business.txt.bak once before the first batch, and removes a batch from the file only when told the cards were saved.
- Out of scope: Any database access or AI rewriting; it only moves text in and out of the file.

### Goal
- Claude can pull notes from subjects/Business.txt a batch at a time and shrink the file only after those notes are saved elsewhere, with a one-time backup to fall back on.

### Criteria
- [x] The first get_next_batch call creates Business.txt.bak beside the file and a second run never overwrites it.
- [x] get_next_batch returns the requested number of notes with deck label, question and answer parsed out of the tab-separated Anki export, cloze notes included.
- [x] confirm_batch removes exactly the returned notes from Business.txt and refuses a batch id it never handed out.
- [x] Claude Code lists the server's tools from the committed .mcp.json entry with no secret in the config.

### Coding tasks
- [x] Add a small stdio MCP package in the repo (name it for what it does, for example tools/anki-batch-mcp) using the MCP SDK already in apps/api, with a parser for the tab-separated Anki export that handles quoted HTML fields and cloze spans.
- [x] Implement get_next_batch, confirm_batch and status tools with a batch id handshake, so a batch is deleted from Business.txt only when the caller confirms it was saved.
- [x] Register the server in .mcp.json as a stdio entry pointing at the package, with the file path passed as an argument so other exports can reuse it later.
- [x] Co-located vitest tests for the parser (plain and cloze notes, empty answers) and for the backup-once and confirm-then-remove rules.
- [x] Turn each Anki cloze note into plain raw text by putting the hidden words back into the sentence, so the server receives the full fact and the pipeline can make its own questions from it.

### Notes
- Owns apps/anki-batch-mcp (new workspace), the root package.json workspaces list and .mcp.json.

## token-scopes

### Scope
- Give api_tokens rows a list of scopes so one token can be limited to creating cards, and make the MCP server know the scopes of the token behind each request.
- Out of scope: Changing how the existing read-only tools authenticate; a token with no scopes keeps today's read access.

### Goal
- An API token can carry scopes, and the MCP server can tell what scopes the token behind the current request has.

### Criteria
- [x] A migration generated with drizzle-kit and run through the existing migrate script adds a scopes column to api_tokens, with existing rows reading as no scopes.
- [x] The token creation script accepts a scopes list and the MCP request handler passes the resolved scopes into createMcpServer.
- [x] A token with no scopes still runs every existing read tool, proven by the current MCP auth tests staying green.

### Coding tasks
- [x] Add a scopes text-array column to api_tokens in schema.ts, generate the migration with db:generate and run it with db:migrate, never with push.
- [x] Find where the bearer token is checked for /mcp, return the token's scopes from that check, and thread them into createMcpServer as an auth context.
- [x] Let the token creation script take a --scopes flag so a knowledge:write-only token can be minted for the import.

### Notes
- Owns apps/api/src/api-token, apps/api/src/db/schema.ts, the new migration, the MCP auth gate and the createMcpServer signature.

## yulia-trus-import-workflow

### Scope
- The repeatable loop that takes one batch from the local server, passes the raw notes unchanged to submit_knowledge on prod, and confirms the batch so Business.txt shrinks; the server's own pipeline does the splitting into cards.
- Out of scope: Importing other subjects or other authors' decks, even though the same tools will work for them later.

### Goal
- All of Yulia Trus' business course notes from Business.txt end up in PostAnki prod as knowledge sources under the right Business sub-subject, the pipeline turns them into pending cards, and the file is empty when the loop finishes.

### Criteria
- [x] A short runbook in the plan folder states the batch size and the order get_next_batch, submit_knowledge, confirm_batch, with no rewriting step in between.
- [ ] One batch run end to end on prod shows pending cards in the review screen under the expected sub-subjects and the matching notes gone from Business.txt.
- [ ] Re-running the loop after an interrupted batch adds no duplicate sources.

### Coding tasks
- [x] Write the import runbook: batch size, the three tool calls in order, and how to resume after an interrupted batch using the import keys.
- [ ] [blocked: user] Deploy the staged API changes, seed the Business sub-subjects on prod and mint the knowledge:write token, then export POST_ANKI_MCP_TOKEN as the runbook says.
  - Why: These write to the production database, which the autonomous run stops short of.
  - Decision: Run the five user steps at the top of runbook.md, or hand the Neon connection string to a session that may run them.
  - Default: You run them yourself in the runbook order.
- [ ] [blocked: user] Run the first batch of 20 against prod and check the pending cards on /knowledge-bit-review before letting the loop continue.
  - Why: Needs the deployed API, the seeded sub-subjects and the minted token, all of them user steps.
  - Decision: Whether the first batch's cards look right and the loop may run to the end of the file.
  - Default: Continue the loop once the first batch shows cards under the expected sub-subjects.

### Notes
- Depends on local-batch-server and prod-knowledge-submit-tool being deployed.
- Owns .planning/business-anki-import-mcp/runbook.md and the prod http entry in .mcp.json.

## prod-knowledge-submit-tool

### Scope
- A submit_knowledge tool on the deployed PostAnki MCP that takes raw note texts plus a deck name, files them as pending knowledge sources under the matching Business sub-subject, and leaves question generation to the existing extraction pipeline.
- Out of scope: Any card writing or AI rewriting in the tool itself; it stores raw knowledge exactly like pasted prose.

### Goal
- A scoped token can feed raw Anki notes into prod as ordinary knowledge sources, so the same pipeline that handles pasted prose turns them into granular cards.

### Criteria
- [x] submit_knowledge accepts up to 100 notes, each with a content-derived import key and its raw text, plus a deck name, validated with zod, and returns created and already-present counts.
- [x] Each deck name maps to an existing Business sub-subject (Основы to Common, Маркетинг и СММ to Marketing, Продажи to Sales, Финансы и планирование to Finance, Лояльность to Loyalty, Персонал и зарплаты to Hiring) and an unknown deck is refused, not guessed.
- [x] Sources are inserted with the caller's import keys and conflicts are skipped per note, so re-sending a batch after a crash adds no rows, proven by an integration test.
- [x] A token without knowledge:write gets an isError tool result and the read-only guard test still passes for every other tool.
- [ ] Submitted sources are picked up by the existing detection scan and show up as pending cards in the review screen.

### Coding tasks
- [x] Add a submit_knowledge tool next to the other MCP tools that checks the knowledge:write scope from the auth context, maps the deck to its Business sub-subject id, and inserts pending prose sources with the caller's per-note import keys, skipping keys that already exist.
- [x] Update the read-only guard test so submit_knowledge is the one allowed writer and every other tool is still proven read-only.
- [x] Integration test: the same batch submitted twice yields one set of sources, and an unknown deck name is refused.

### Notes
- Depends on token-scopes for the auth context.
- Examples stay in the existing background column; no new column.
- Owns apps/api/src/mcp (new tool and the read-only guard test) and one new keyed-insert repo file under apps/api/src/knowledge-source.


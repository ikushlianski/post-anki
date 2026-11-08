# Brief: Business Anki import through MCP

Goal: every note in `subjects/Business.txt` (Yulia Trus' business courses, Anki export) reaches
PostAnki prod as a raw knowledge source under the right Business sub-subject, the existing detection
pipeline turns it into cards, and the file shrinks as batches are confirmed.

The full plan with file-level detail and cited facts is `plan.md` in this folder. This brief is the
architecture it rests on.

## Architecture

- `apps/anki-batch-mcp` (new workspace): a stdio MCP server Claude starts from `.mcp.json`. Owns the
  export file: parses it, backs it up once, hands out batches with an id, removes a confirmed batch.
  No network, no database, no AI.
- `apps/api` auth: `api_tokens` gains a `scopes` text array. The existing gate resolves the scopes
  of the token behind a request into a per-request auth context; `createMcpServer` receives it. Shared
  secret and session tokens carry `*`. Tokens without scopes keep today's read access.
- `apps/api/src/mcp`: one write tool, `submit_knowledge`. Input: a deck name and up to 100 notes, each
  with a content-derived import key and raw text. It requires `knowledge:write`, maps the deck to an
  existing Business sub-subject by name, inserts pending prose knowledge sources with the given import
  keys and skips keys already present. Every other tool stays read-only, proven by the guard test.
- Detection pipeline: unchanged. Submitted sources are ordinary pending prose sources.
- Workflow: Claude calls `get_next_batch`, one `submit_knowledge` per deck, then `confirm_batch`.
  Re-sending a batch is a no-op on prod because keys come from note content.

## Decisions

- Raw knowledge in, not cards: the server's pipeline owns card generation, as for pasted prose.
- Examples stay in the existing `background` column; no new column.
- Deck mapping: Основы→Common, Маркетинг и СММ→Marketing, Маркетинг воронка→Marketing,
  Продажи→Sales, Финансы и планирование→Finance, Лояльность→Loyalty, Персонал и зарплаты→Hiring.
- Import keys are `anki:<note hash>`, never batch ids, so an interrupted batch cannot duplicate.
- Migrations: schema change, `db:generate`, then the migrate script; never push. Prod receives the
  migration through the normal deploy, not from a developer shell.

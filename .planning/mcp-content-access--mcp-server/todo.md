---
type: todo
direction: mcp-content-access
task: mcp-server
tier: Guarded
updated: 2026-09-29
---

## Decisions to make
Nothing open — see Resolved.

## To review/clarify
- Which table is the learner-visible deck content: `phrases` or `phraseBankEntries`? Both carry `subjectId`. Default: `phrases`. Confirm against what the web app's deck/practice screen lists before writing `get_deck_items`.
- Verify the "not-found is an `isError: true` tool result, not a JSON-RPC error" rule against the current MCP spec's tool-error section.

## Coding tasks
- [ ] Phase 2: add a course-outline repo in `curriculum/` (modules → topics with ids, order, and card-set status) plus the `list_courses` and `get_course_structure` tools, with not-found handling
- [ ] Phase 3: add the `get_topic_cards` and `list_course_cards` tools (paged, clamped at 200), a subject-scoped deck-item repo in `practice/`, and `get_deck_items`
- [ ] Phase 4: add a card-text search repo in `cards/` (ready sets only, escaped wildcards, capped) plus `search_knowledge_items`, which merges in the existing course/topic name search
- [ ] Each phase: co-located vitest tests for its scenarios.md lines, then `npx tsc --noEmit` and lint at zero issues

## Manual steps
- Add an example client entry to docs, not to the committed `.mcp.json`: `{ "type": "http", "url": "<api-base>/mcp", "headers": { "Authorization": "Bearer ${POST_ANKI_API_TOKEN}" } }`. The token always comes from env-var expansion, never a literal.
- Issue a dedicated `api_tokens` row for MCP clients, so it can be revoked on its own.

## Post-deploy checks
- In prod, `POST /mcp` without a token returns 401. This confirms `API_SHARED_SECRET` is set and the gate isn't failing open.
- A real MCP client (for example Claude Code with the http entry above) lists the tools and runs `list_courses` and `search_knowledge_items` against prod after a cold start.

## Resolved
- Transport: Streamable HTTP, stateless, mounted at `POST /mcp` inside `apps/api`. stdio was rejected because it would need prod DB credentials on every client and bypasses the token gate.
- Auth: reuse the existing shared-bearer-token gate, with no new auth.
- Location: `apps/api/src/mcp/`, not a new app, because every reused repo lives in `apps/api`.
- Primitive: tools only, all read-only.
- Added `@modelcontextprotocol/sdk` to `apps/api` (^1.31.0, zod peer range accepts 3.25.76); recorded in `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md`'s post-anki section.
- Phase 1 review round 1 fix: tool exceptions now caught, logged via pino, and return a generic `isError` result instead of leaking raw errors.
- Phase 1 review round 2 fix: `list_decks` output shape is a zod schema (`listDecksResultSchema`) wired into `registerTool`'s `outputSchema`, matching architecture.md's stated data contract.
- Phase 1 review round 3 fix: `list_decks` input shape is also a zod schema now (`listDecksInputSchema`), same pattern as the output side, for consistency going into phases 2-4.
- Phase 1 review round 4, Opus structured-verdict fix: added a real success-path test calling `list_decks` through the MCP client, not just the repo function directly, plus a rejected-input test.
- Phase 1 done: review-factory Pass 1 and Pass 2 both PASSed clean (2 consecutive), marked done in .planning/TODO.md.

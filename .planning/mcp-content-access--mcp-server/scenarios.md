---
type: scenarios
direction: mcp-content-access
task: mcp-server
tier: Guarded
updated: 2026-09-29
---

## Connection and auth
- [ ] An MCP client with the valid shared token completes `initialize` and `tools/list` over `POST /mcp` and sees all seven read-only tools
- [ ] With `API_SHARED_SECRET` set, a `POST /mcp` with no or a wrong bearer token is rejected with HTTP 401 before any MCP handling
- [ ] A token revoked in `api_tokens` can no longer reach `/mcp`
- [ ] `GET` and `DELETE /mcp` return 405 (stateless server, no session stream)
- [ ] Two consecutive requests with no session id both succeed (no dependency on in-memory session state)

## Browsing
- [ ] `list_decks` returns every subject with `kind = 'language-practice'` and no course-like subjects
- [ ] `list_courses` returns every non-container curriculum, and with `subjectId` only that subject's curricula
- [ ] `get_course_structure` returns the curriculum's modules in order, each with its topics in order and their card-set status
- [ ] `get_course_structure` for a nonexistent curriculum id returns an `isError` tool result "not found", not a crash or a JSON-RPC internal error

## Cards and deck items
- [ ] `get_topic_cards` returns a ready topic's cards with every prompt/answer variant
- [ ] `get_topic_cards` for a topic whose cards are still generating returns that status and an empty card list
- [ ] `get_topic_cards` for a topic with no card set, or an unknown topic id, returns a clean `isError` not-found result
- [ ] `list_course_cards` returns only ready cards for the curriculum and honours `limit`/`offset` with a correct `total`
- [ ] A `limit` above 200 is clamped to 200, not rejected or ignored
- [ ] `get_deck_items` returns a deck's phrase items, and returns an `isError` "not a deck" result when given a course subject id

## Search
- [ ] `search_knowledge_items` matches ready cards by text in concept, prompt, or answer, case-insensitively
- [ ] `search_knowledge_items` never returns cards from sets that are still generating
- [ ] A query containing `%` or `_` is matched literally, not as a wildcard
- [ ] A query shorter than 2 characters is rejected by input validation with no DB call
- [ ] `search_knowledge_items` also returns matching course names and topic titles

## Read-only guarantee
- [ ] No tool changes any row. Running every tool leaves the content tables unchanged

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
- Verify the "not-found is an `isError: true` tool result, not a JSON-RPC error" rule against the current MCP spec's tool-error section.

## Coding tasks
- [x] Phase 3: add the `get_topic_cards` and `list_course_cards` tools (paged, clamped at 200), a subject-scoped deck-item repo in `practice/`, and `get_deck_items`
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
- Phase 2 deviation from plan.md's table: `list_courses`'s `subjectName` is `string | null`, not `string` — `curricula.subject_id` has no DB foreign key, so an orphaned course is real and gets `null` rather than a silent `""`.
- Phase 2 review round 1 fix: added a rejected-empty-`curriculumId` test for `get_course_structure` through the real MCP client, matching Phase 1's precedent.
- Phase 2 review round 2 fix: that test now seeds a curriculum that would succeed if it reached the DB, so `isError` can only come from input rejection, not the not-found branch.
- Phase 2 done: review-factory Pass 1 and Pass 2 both PASSed clean (2 consecutive), marked done in .planning/TODO.md.
- Deck content table resolved: `phrases`, not `phraseBankEntries`. `phraseBankEntries` is the scheduling/mastery metadata store; `phrases` is the generated, learner-visible practice content (FK `phrases.targetPhraseBankEntryId` → `phraseBankEntries.id`).
- `get_deck_items` orders phrases by `level, pack, sequenceNumber, id` (the table's own unique-index column order), not `sequenceNumber` alone — that number is only unique per (subject, level, pack), so a deck spanning multiple levels/packs would repeat it and break offset paging.
- Phase 3 review round 1 fix: added a rejected-empty-input test through the real MCP client for each of `get_topic_cards`/`list_course_cards`/`get_deck_items`, each seeded so it would succeed absent zod validation, matching Phase 1/2's precedent.
- Phase 3 review round 2 fix: added a multi-card, multi-variant fixture to `get_topic_cards`'s test, proving every variant on every card maps through, not just the first of each.
- Phase 3 review round 3 fixes: `list_course_cards` now returns `isError` for an unknown `curriculumId` (new `curriculumExists` check), matching plan.md's unknown-id rule instead of the earlier empty-page deviation; tool registration split into `register-browse-tools.ts`/`register-cards-tools.ts` by area, per plan.md's "split by area" instruction; the 398-line combined route test split into `mcp-topic-cards.route.test.ts`/`mcp-course-cards.route.test.ts`/`mcp-deck-items.route.test.ts`, each under 300 lines.
- Phase 3 review round 4 (Pass 2) fix: fixed a pre-existing bug in `listCardsForCurriculum` — it sorted by `topics.order` alone, which restarts at 1 in every module, so `list_course_cards`'s pagination could silently reorder rows in a multi-module course. Now orders by `modules.order` first. Added a two-module regression test to the cards integration suite.
- Phase 3 review round 5 fix: the round-4 regression test gave both seeded topics the same topic-order (1), so it only caught the bug by lucky tie-breaking, not by design. Fixed by giving Module 1's topic the higher topic-order (2) so a `topics.order`-only sort would deterministically rank it wrong; confirmed the fix now fails 3/3 under a manual mutation test reverting the module-order fix, and passes with it in place.
- Phase 3 review round 6 fix: the ">200 clamp" tests for `list_course_cards`/`get_deck_items` only seeded 5 rows, so a mutation that reports `limit: 200` but still slices with the raw unclamped limit would pass unnoticed. Fixed by seeding 201 rows in each and asserting the actual page length is 200, not just the reported `limit` field; also added a route-level clamp test for `get_deck_items` (previously missing).
- Phase 3 review round 7 fixes: `curriculumExists` was mocked out in every test touching `list_course_cards`, so the real function had zero direct coverage — added a dedicated test file for it. The `get_deck_items` not-found route test only checked the subject id substring was present, which also passes for the wrong ("not a deck") error message — tightened to assert the exact expected text and that the wrong message is absent; matched the same tightening for `list_course_cards`'s not-found test. Also broadened the MCP tool listing test to assert `readOnlyHint: true` for all six tools, not just `list_decks`.
- Phase 3 review round 8 fix: several new test files (and one tool file) carried rationale comments, against this project's "no comments in tests" convention. Removed every one — the fixture/assertion names already carry the intent.
- Phase 3 review round 9 fixes: `cards-summary.integration.test.ts` had grown to 309 lines (over the 300-line file cap) and still had two leftover rationale comments. Split it by function into `cards-summary.integration.test.ts` (getCurriculumCardsSummary) and `list-cards-for-curriculum.integration.test.ts` (listCardsForCurriculum), each with its own isolated throwaway DB, and dropped both comments.
- Phase 3 review round 10 fix: `mcp.route.test.ts` (pre-existing Phase 1/2 file, grown further by this phase's readOnlyHint test) had reached 328 lines, over the same 300-line cap. Split by concern into `mcp-auth.route.test.ts` (bearer-token/405/stateless tests) and a slimmer `mcp.route.test.ts` (tool listing, list_decks call, error handling).
- Phase 3 review round 11 fix: this phase's two new functions, `listCardsForCurriculum` and `curriculumExists`, were added directly into the large pre-existing `cards.repo.ts`/`curriculum.repo.ts` files instead of their own files, unlike their already-split tests. Extracted each into its own file (`list-cards-for-curriculum.repo.ts`, `curriculum-exists.repo.ts`) and updated every import site.
- Phase 3 review round 12 (Pass 1) and round 13 (Pass 2) both PASSed clean — 2 consecutive, marked done.

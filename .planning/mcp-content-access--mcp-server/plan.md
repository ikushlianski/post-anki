---
type: plan
direction: mcp-content-access
task: mcp-server
tier: Guarded
updated: 2026-09-29
---

# MCP server for decks and course content (read-only)

## Goal
- Any MCP client (Claude Desktop/Code, Cursor, etc.) can browse and search the learner's decks, courses, modules, topics ("sections"), and study cards, read-only.

## Why an MCP server, not docs or the REST API
- The REST API is shaped for the app's own screens (progress, merge state, admin); an LLM client would need hand-written glue per endpoint.
- MCP gives self-describing tools with typed inputs that clients discover automatically — "point the client at a URL" is the whole setup.
- The portfolio tech-stack note already treats "an MCP server alongside the REST API" as a pattern worth showing.

## Design

### Transport: Streamable HTTP, stateless, mounted at `POST /mcp` in `apps/api`
- Reuses the existing shared-bearer-token gate in-process (`apps/api/src/server.ts:262-287`, `authorized()`), so no new auth. Clients send `Authorization: Bearer <token>`, the same header every other request uses.
- stdio was rejected. A local stdio process would need direct prod DB credentials on every client machine, and it bypasses the token gate. It also couldn't serve remote clients.
- `.mcp.json` already uses a `type: "http"` entry (notion), so clients use the same shape plus a `headers.Authorization`.
- Stateless mode (no session id). Prod is scale-to-zero Cloud Run, so in-memory sessions would not survive cold starts or multiple instances. Each POST gets a fresh server and transport, following the SDK's stateless example. `GET`/`DELETE /mcp` return 405.
- Body handling: `server.ts` dispatch does not pre-read the body (auth → `route()`), so the transport can consume the raw request stream. Alternatively, the handler parses JSON with the existing helper and passes `parsedBody`.

### Where the code lives
- A new entity folder `apps/api/src/mcp/`, not a new app. Every repo function reused lives in `apps/api/src/*`, and a separate app would have to import another app's internals or duplicate the DB/env setup.
- `mcp/` holds only the protocol layer: the server factory, the transport handler, and tool registration split by area (browse / cards / search). New queries go in their owning entity folders (`curriculum/`, `cards/`, `practice/`).
- Route: one `ROUTES` entry in `apps/api/src/router-table.ts` (`POST /mcp`), dispatched in `server.ts` like any other route. It sits behind `authorized()` automatically, not on the `/_healthz` bypass.
- Library: `@modelcontextprotocol/sdk` (official TS SDK). It is **not** currently a dependency anywhere in the monorepo, so the proposal is to add it to `apps/api` only (see todo.md Decisions). Repo zod is 3.25.76, and the implementer must confirm that the chosen SDK version's zod peer range accepts it.

### Primitive choice: tools only (no resources/prompts in v1)
- Tools are the one primitive every major client supports. Resources are optional, and client support is uneven.
- Every tool is read-only and carries the `readOnlyHint: true` annotation.

### Tool surface
All list-shaped tools take `limit` (default 50, hard max 200) and `offset` (default 0) and return `{ items, total, limit, offset }`, so a full curriculum can't flood a client's context.

| Tool | Input | Output | Backed by |
|---|---|---|---|
| `list_decks` | `limit?, offset?` | subjects with `kind = 'language-practice'`: `{ id, name, description }` | `listSubjects()` filtered by kind |
| `list_courses` | `subjectId?, limit?, offset?` | `{ id, name, subjectId, subjectName }` (container rows excluded) | `listCurricula(subjectId?)` + subject names |
| `get_course_structure` | `curriculumId` | `{ curriculum: { id, name, subjectId }, modules: [{ id, title, order, topics: [{ id, title, order, cardSetStatus \| null }] }] }` | **new** small outline read (see below) |
| `get_topic_cards` | `topicId` | `{ topicId, status, cards: [{ id, concept, variants: [{ prompt, answer }] }] }`; a `generating`/failed set returns its status with no cards | `getCardsByTopic(topicId)` |
| `list_course_cards` | `curriculumId, limit?, offset?` | flattened ready cards `{ cardId, topicId, topicTitle, concept, prompt, answer }` | `listCardsForCurriculum(curriculumId)`, paged in the tool |
| `get_deck_items` | `subjectId, limit?, offset?` | a deck's phrase items (exact field set confirmed at implementation, see todo.md) | **new** subject-scoped phrase list read |
| `search_knowledge_items` | `query (min 2 chars), limit?` | `{ cards: [{ cardId, topicId, curriculumId, concept, prompt, answer }], courses: [...], topics: [...] }` | **new** card-text search + existing `searchCurricula` / `searchTopics` |

### New reads (the only new query logic)
- **Course outline**: `getModuleProgressSnapshots` is not usable as the contract. Its `MergeTopicSnapshot` has no topic id (`apps/api/src/curriculum/curriculum.repo.ts:440-451`) and it carries merge/progress internals. A new `curriculum-outline.repo.ts` returns modules → topics with ids, titles, order, and card-set status.
- **Card search**: nothing searches card text today (`searchKnowledgeBitsRanked` searches the `knowledgeBits` staging table). A new `cards/card-search.repo.ts` runs a case-insensitive match over `concept` / `prompt` / `answer`, limited to `ready` card sets, with `%`/`_` escaped in the user query and a capped limit. It makes no embedding or LLM call per query, so a search has no token cost. No new index in v1.
- **Deck items**: decks keep their content in `phrases` / `phraseBankEntries` (both have `subjectId`, schema.ts ~1202/1241), not in `topicCards`. There's no existing list-by-subject read, so a new one goes in `practice/`.

### Errors
- Unknown id (curriculum/topic/deck) → a tool result with `isError: true` and a plain message ("No course with id X"), not a thrown JSON-RPC error. This matches the MCP spec's tool-execution-error guidance, and the implementer verifies it against the current spec text.
- Invalid input (missing id, empty query) → the SDK's zod input validation rejects it before any DB call.
- Wrong kind (`get_deck_items` on a course subject) → `isError: true` "Subject X is not a deck".
- Unexpected DB failure → logged with the tool name, and the client gets a generic `isError` result with no stack trace.

### Auth reuse
- `/mcp` goes through the same `authorized()` check as every route: a missing or bad token gets HTTP 401 before the MCP layer runs.
- Known property of the existing gate: it **fails open when `API_SHARED_SECRET` is unset** (`server.ts:263-265`), even if `api_tokens` rows exist. This plan doesn't change that. The post-deploy check confirms prod has the secret set and `/mcp` returns 401 without a token.

### Safety notes (agentic-principles pass)
- Card and phrase text is LLM- or learner-generated and flows into the client's model. It's returned as plain data fields. The server never interprets it, and no tool takes actions.
- Cost: there are no model calls server-side. Result caps bound the client's context growth.

## Out of scope
- Write tools (create/edit/delete content), prompts, resources, subscriptions/notifications.
- Per-user auth, OAuth for MCP, new token types.
- New UI, and a new taxonomy or new content model.
- `knowledgeBits` staging rows (not study content).
- Semantic/embedding search (a later iteration could reuse `topicCardVariants.embedding`).

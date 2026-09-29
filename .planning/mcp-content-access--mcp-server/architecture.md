---
type: architecture
direction: mcp-content-access
task: mcp-server
tier: Guarded
updated: 2026-09-29
---

## Boundaries
- New protocol layer `apps/api/src/mcp/`. It owns MCP wiring only (server factory, stateless transport handler, tool registration) and holds no SQL.
- New reads go in their owning entity folders: course outline in `curriculum/`, card-text search in `cards/`, deck item list in `practice/`. Tools call repos directly, the same way controllers do.
- Auth stays owned by `server.ts`'s `authorized()`. `/mcp` is an ordinary route behind it.
- Data contract: tool outputs are MCP-facing shapes defined with zod in `mcp/`. They don't expose internal types like `MergeModuleSnapshot`, so repo refactors don't silently change what clients see.

## Non-goals
- No write tools and no content mutation of any kind.
- No new UI.
- No per-user auth system, OAuth, or new token type. The single shared token is the model.
- No new taxonomy, content model, or schema changes. `knowledgeBits` staging rows are not exposed.
- No MCP resources, prompts, sessions, or server-sent notifications in v1.
- No embedding or LLM calls on the MCP path.

## Rollback
The change is purely additive: one new route, one new folder, three new read-only repo files, and one new npm dependency. It has no schema change, no migration, and no index, so no data is touched. To roll back, remove the `POST /mcp` route entry (or revert the commits) and redeploy. Existing REST clients, the web app, and the bot are unaffected either way. Any MCP client configs pointing at `/mcp` just start failing to connect.

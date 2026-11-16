# Research

## Facts
- Fact: The ticket is an existing backlog item under the 'the-me-agent-integration' direction, marked [blocked: user]: 'Add a Post Anki button that sends a todo to the user's Me agent.' (source: .planning/TODO.md)
- Fact: The direction's scope is post-anki's side of connecting to the-me-agent's vault/learning-map via MCP. Changes to the-me-agent itself are out of scope. (source: .planning/TODO.md)
- Fact: The notes say the vault MCP is stdio-only and post-anki runs on Cloud Run, so there is no prod path without a networked transport. A round-3 re-check (2026-10-02) found the vault MCP is still stdio plus local SQLite/notes, with no network path. (source: .planning/TODO.md)
- Fact: A note says post-anki now has a networked MCP transport and the blocker should be re-checked once that is live in prod. That transport serves post-anki's own MCP tools (inbound), not a path to the Me agent vault. (source: .planning/TODO.md)
- Fact: post-anki exposes its own MCP server over HTTP at POST /mcp, and also has a stdio entry (mcp:stdio). Both are inbound servers for other clients, not an outbound client to the Me agent. I found no code that calls the Me agent. (source: apps/api/src/router-table.ts)
- Fact: A related blocked item already exists: 'Decide how Me Agent book notes reach post-anki so the Sources page can list them.' The Sources page item is marked done. (source: .planning/TODO.md)
- Fact: The repo has no wayfinder wiki: no index.md files were found under wiki/ or .planning/wiki/. (source: .planning/TODO.md)

## Open questions
- Open question: Which transport or API would the Me agent expose for receiving a todo from a Cloud Run service (networked MCP, HTTP endpoint, or other)? The code and docs I read do not say. The Me agent is out of scope for changes.
- Open question: What is the todo payload (title, notes, linked card/subject), and where should the button live (web, iPhone, extension, or chat)? None of this is specified.
- Open question: How would post-anki authenticate to the Me agent, and is sending user content to that outside system acceptable (privacy, data shared between apps)? This needs a stakeholder decision.

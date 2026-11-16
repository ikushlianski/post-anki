# Research: Which transport or API would the Me agent expose for receiving a todo from a Cloud Run service (networked MCP, HTTP endpoint, or other)? The code and docs I read do not say. The Me agent is out of scope for changes.

## Facts
- Fact: The backlog item is blocked: the vault MCP is stdio-only while post-anki runs on Cloud Run, so there is no prod path without a networked transport. Round 3 (2026-10-02) re-verified that the Me agent vault MCP is stdio plus local SQLite/notes with no network path. (source: .planning/TODO.md)
- Fact: The integration scope covers post-anki's side only. Changes to the-me-agent are out of scope. (source: .planning/TODO.md)
- Fact: The networked MCP transport noted in TODO.md is post-anki's own inbound MCP server. It is not a path to the Me agent. (source: .planning/a-button-in-post-anki-that-sends-a-todo-/research.md)
- Fact: The Me agent's `me mcp serve` is a vault MCP server with read-only tools over its notes folder, and post-anki already consumes it. Read-only tools cannot receive a todo. (source: .planning/notion-english-import/spec.md)
- Fact: The Me agent has a separate Chrome-extension capture server. It uses a Notion REST write client keyed off ME_NOTION_INTEGRATION_TOKEN. The spec does not say whether that server accepts todos over HTTP or is reachable from Cloud Run. (source: .planning/notion-english-import/spec.md)

## Open questions
- Open question: The Me agent exposes no documented network-reachable write interface for receiving a todo. It is unknown whether it would offer a networked MCP with a write tool, an HTTP endpoint (such as the capture server or inbox), or something else. The Me agent repo is outside this codebase, so this needs a stakeholder answer.
